import { existsSync } from "node:fs";
import { readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { build } from "vite";
import { markdownCopyFor } from "@svartz/core";
import { getMarkdownRoutes, getPublicFileNames } from "./public-assets";

interface MarkdownBuilder {
  getBuildDirectory(name: string): string;
}

interface Adapter {
  readonly name: string;
  adapt(builder: MarkdownBuilder): void | Promise<void>;
}

/**
 * adapter-node 6 bundles its server into `server/`; adapter-node 5 writes it at the top level. Either way the
 * directory's `handler.js` is the entry for the handler that serves static files, prerendered pages and the app.
 */
function nodeServerDirectory(outDir: string): string {
  const server = join(outDir, "server");
  return existsSync(join(server, "adapter-index.js")) ? server : outDir;
}

/**
 * The module and export that hold adapter-node's handler. adapter-node 6's `handler.js` re-exports it from a shared
 * chunk under a minified name, and the server entry imports that chunk directly, so the wrapper replaces the chunk.
 */
async function nodeHandlerModule(directory: string): Promise<{ file: string; name: string }> {
  const source = await readFile(join(directory, "handler.js"), "utf8");
  const reexport = /export\s*\{\s*([\w$]+)\s+as\s+handler\s*\}\s*from\s*["']\.\/([^"']+)["']/.exec(source);
  return reexport ? { file: reexport[2]!, name: reexport[1]! } : { file: "handler.js", name: "handler" };
}

/** Run Worker host redirects and the shared Svartz handle ahead of the adapters' static-file handlers. */
export function withMarkdownNegotiation<T extends Adapter>(adapter: T, target: string, outDir: string): T {
  if (target === "static") return adapter;
  return {
    ...adapter,
    async adapt(builder: MarkdownBuilder) {
      await adapter.adapt(builder);
      const markdown = getMarkdownRoutes();
      const worker = target === "cloudflare-workers";
      // The shell's Workers config runs the worker ahead of every asset, and adapter-cloudflare's worker serves only
      // SvelteKit's own, so this one serves Svartz's: the Markdown copies negotiation redirects to, and attachments.
      const publicFiles = worker ? getPublicFileNames().map((name) => `/${name}`) : [];
      const hasContentRoutes = Object.keys(markdown).length > 0 || publicFiles.length > 0;
      if (!worker && !hasContentRoutes) return;
      const node = target === "node";
      const directory = node ? nodeServerDirectory(outDir) : builder.getBuildDirectory("cloudflare");
      const { file: entry, name: handlerExport } = node
        ? await nodeHandlerModule(directory)
        : { file: "_worker.js", name: "default" };
      const original = `svartz-${entry}`;
      const common = hasContentRoutes ? `
        import { createServerHandle, decodeRoutePath, markdownCopyFor } from ${JSON.stringify(import.meta.resolve("@svartz/core"))};
        const markdown = ${JSON.stringify(markdown)};
        const handle = createServerHandle({
          basePath: "", vault: { id: "", mountPath: "", site: {} }, servers: [],
          markdown,
        }, { building: false, dev: false, privateEnv: {} });
      ` : "";
      const source = node ? `${common}
        import { ${handlerExport} as original } from "./${original}";
        // Other chunks may import more of the handler's chunk than the handler; this module's own export wins.
        export * from "./${original}";
        export { handler as ${handlerExport} };
        async function handler(req, res, next) {
          try {
            const url = new URL(req.url, "http://svartz.local");
            // Kit rejects malformed escapes before its hooks and loaders can return Svartz's 404.
            if (decodeRoutePath(url.pathname) === undefined) {
              res.writeHead(404);
              return res.end();
            }
            if (!["GET", "HEAD"].includes(req.method) || !markdownCopyFor(markdown, url.pathname)) {
              return original(req, res, next);
            }
            const request = new Request(url, { method: req.method, headers: {
              accept: req.headers.accept ?? "*/*",
              "user-agent": req.headers["user-agent"] ?? "",
            }});
            let passed = false;
            const response = await handle({
              event: { request, url, getClientAddress: () => req.socket.remoteAddress },
              resolve: () => { passed = true; return new Response(null); },
            });
            if (passed) {
              // The static handler sets its own Vary and Cache-Control after this middleware, through setHeader
              // (adapter-node 5) or writeHead's headers (adapter-node 6).
              const negotiated = (name, value) => {
                if (name.toLowerCase() === "vary" && value !== "*") return [value, "Accept", "User-Agent"].join(", ");
                if (name.toLowerCase() === "cache-control" && !/\\bno-store\\b/i.test(String(value))) return "private, no-cache";
                return value;
              };
              const setHeader = res.setHeader;
              res.setHeader = function(name, value) {
                return setHeader.call(this, name, negotiated(name, value));
              };
              // writeHead takes an object or a flat name, value, name, value array, after an optional status message.
              const negotiatedHeaders = (headers) => Array.isArray(headers)
                ? headers.map((value, index) => index % 2 ? negotiated(headers[index - 1], value) : value)
                : headers && typeof headers === "object"
                  ? Object.fromEntries(Object.entries(headers).map(([name, value]) => [name, negotiated(name, value)]))
                  : headers;
              const writeHead = res.writeHead;
              res.writeHead = function(status, ...rest) {
                const at = typeof rest[0] === "string" ? 1 : 0;
                rest[at] = negotiatedHeaders(rest[at]);
                return writeHead.call(this, status, ...rest);
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
        import original from "./${original}";${hasContentRoutes ? `
        const publicFiles = new Set(${JSON.stringify(publicFiles)});` : ""}
        export default {
          ...original,
          fetch(request, env, ctx) {
            const url = new URL(request.url);${worker ? `
            const roots = env.SVARTZ_WWW_REDIRECT_HOSTS;
            if (url.hostname.startsWith("www.") && Array.isArray(roots) && roots.includes(url.hostname.slice(4))) {
              url.hostname = url.hostname.slice(4);
              url.protocol = "https:";
              url.port = "";
              return Response.redirect(url, 301);
            }` : ""}${!hasContentRoutes ? `
            return original.fetch(request, env, ctx);` : `
            const pathname = decodeRoutePath(url.pathname);
            if (pathname === undefined) return new Response(null, { status: 404 });
            // \`ASSETS\` is the binding the shell's wrangler.jsonc names.
            if (["GET", "HEAD"].includes(request.method) && publicFiles.has(pathname)) return env.ASSETS.fetch(request);
            if (!["GET", "HEAD"].includes(request.method) || !markdownCopyFor(markdown, url.pathname)) {
              return original.fetch(request, env, ctx);
            }
            return handle({
              event: { request, url, platform: { env, ctx },
                getClientAddress: () => request.headers.get("cf-connecting-ip"),
              },
              resolve: () => original.fetch(request, env, ctx),
            });`}
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
            output: { inlineDynamicImports: true, paths: (id) => id === original || id.endsWith(`/${original}`) ? `./${original}` : id },
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
        // Exclusions follow the routes' `trailingSlash`, so match them the way negotiation matches requests.
        routes.exclude = routes.exclude.filter((pattern) => pattern.endsWith("*")
          ? !Object.keys(markdown).some((href) => href.startsWith(pattern.slice(0, -1)))
          : !markdownCopyFor(markdown, pattern));
        await writeFile(routesPath, JSON.stringify(routes, null, 2));
      }
    },
  };
}
