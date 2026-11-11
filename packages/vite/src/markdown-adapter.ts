import { readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { build } from "vite";
import { getMarkdownRoutes } from "./public-assets";

interface MarkdownBuilder {
  getBuildDirectory(name: string): string;
}

interface Adapter {
  readonly name: string;
  adapt(builder: MarkdownBuilder): void | Promise<void>;
}

/** Run the shared Svartz handle ahead of the standalone adapters' static-file handlers. */
export function withMarkdownNegotiation<T extends Adapter>(adapter: T, target: string, outDir: string): T {
  if (target === "static") return adapter;
  return {
    ...adapter,
    async adapt(builder: MarkdownBuilder) {
      await adapter.adapt(builder);
      const markdown = getMarkdownRoutes();
      if (Object.keys(markdown).length === 0) return;
      const node = target === "node";
      const directory = node ? outDir : builder.getBuildDirectory("cloudflare");
      const entry = node ? "handler.js" : "_worker.js";
      const original = node ? "svartz-handler.js" : "svartz-worker.js";
      const common = `
        import { createServerHandle } from ${JSON.stringify(import.meta.resolve("@svartz/core"))};
        const markdown = ${JSON.stringify(markdown)};
        const handle = createServerHandle({
          basePath: "", vault: { id: "", mountPath: "", site: {} }, servers: [],
          markdown,
        }, { building: false, dev: false, privateEnv: {} });
      `;
      const source = node ? `${common}
        import { handler as original } from "./${original}";
        import { readFile } from "node:fs/promises";
        const client = new URL("./client/", import.meta.url);
        export async function handler(req, res, next) {
          try {
            const url = new URL(req.url, "http://svartz.local");
            if (!["GET", "HEAD"].includes(req.method) || !Object.hasOwn(markdown, url.pathname.endsWith("/") ? url.pathname : url.pathname + "/")) {
              return original(req, res, next);
            }
            const request = new Request(url, { method: req.method, headers: {
              accept: req.headers.accept ?? "*/*",
              "user-agent": req.headers["user-agent"] ?? "",
            }});
            let passed = false;
            const response = await handle({
              event: { request, url, getClientAddress: () => req.socket.remoteAddress,
                fetch: async (url) => {
                  try { return new Response(await readFile(new URL("." + url.pathname, client))); }
                  catch (error) {
                    if (error.code === "ENOENT") return new Response(null, { status: 404 });
                    throw error;
                  }
                },
              },
              resolve: () => { passed = true; return new Response(null); },
            });
            if (passed) {
              // sirv sets its own Vary and Cache-Control after this middleware.
              const setHeader = res.setHeader;
              res.setHeader = function(name, value) {
                if (name.toLowerCase() === "vary" && value !== "*") value = [value, "Accept", "User-Agent"].join(", ");
                if (name.toLowerCase() === "cache-control" && !/\\bno-store\\b/i.test(String(value))) value = "private, no-cache";
                return setHeader.call(this, name, value);
              };
              for (const name of ["vary", "cache-control"]) {
                if (response.headers.has(name)) res.setHeader(name, response.headers.get(name));
              }
              return original(req, res, next);
            }
            res.writeHead(response.status, Object.fromEntries(response.headers));
            res.end(Buffer.from(await response.arrayBuffer()));
          } catch (error) { next(error); }
        }
      ` : `${common}
        import original from "./${original}";
        export default {
          ...original,
          fetch(request, env, ctx) {
            const url = new URL(request.url);
            if (!["GET", "HEAD"].includes(request.method) || !Object.hasOwn(markdown, url.pathname.endsWith("/") ? url.pathname : url.pathname + "/")) {
              return original.fetch(request, env, ctx);
            }
            return handle({
              event: { request, url, platform: { env, ctx },
                getClientAddress: () => request.headers.get("cf-connecting-ip"),
                fetch: (url) => env.ASSETS.fetch(new Request(url)),
              },
              resolve: () => original.fetch(request, env, ctx),
            });
          },
        };
      `;
      // Bundle the shared router so a deployed Node build needs no Svartz development dependencies.
      const id = "\0svartz-markdown-entry";
      const result = await build({
        configFile: false,
        logLevel: "warn",
        plugins: [{ name: "svartz:markdown-entry", resolveId: (value) => value === id ? id : null, load: (value) => value === id ? source : null }],
        ssr: { noExternal: true },
        build: {
          ssr: true, write: false, minify: false,
          rollupOptions: {
            input: id,
            external: [`./${original}`],
            output: { inlineDynamicImports: true, paths: (id) => id.endsWith(`/${original}`) ? `./${original}` : id },
          },
        },
      });
      if (Array.isArray(result) || !("output" in result)) throw new Error("Markdown router build returned no output");
      const chunk = result.output.find((item) => item.type === "chunk" && item.isEntry);
      if (!chunk || chunk.type !== "chunk") throw new Error("Markdown router build returned no entry");
      await rename(join(directory, entry), join(directory, original));
      await writeFile(join(directory, entry), chunk.code);
      if (target === "cloudflare-pages") {
        const routesPath = join(directory, "_routes.json");
        const routes = JSON.parse(await readFile(routesPath, "utf8")) as { exclude: string[] };
        // Pages otherwise bypasses the worker for prerendered pages before negotiation can run.
        routes.exclude = routes.exclude.filter((pattern) => !Object.keys(markdown).some((href) =>
          href === pattern || (pattern.endsWith("*") && href.startsWith(pattern.slice(0, -1)))));
        await writeFile(routesPath, JSON.stringify(routes, null, 2));
      }
    },
  };
}
