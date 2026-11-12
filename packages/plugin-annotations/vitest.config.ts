import type { IncomingMessage, ServerResponse } from "node:http";
import { playwright } from "@vitest/browser-playwright";
import type { Plugin } from "vite";
import type { BrowserCommand } from "vitest/node";
import { defineConfig } from "vitest/config";
import { ADA, createDatabase, createSite, ENDPOINT, seed, signIn as signInAt, type SeedComment } from "./tests/harness";

/**
 * Browser tests read and write annotations through the real plugin on a real D1, same-origin as the test page: this
 * serves `ENDPOINT` from the Vite dev server, the `seedComments` command fills the database between tests, and
 * `signIn` gives the test browser a real session cookie from `auth`.
 */
let site: Promise<{ fetch: ReturnType<typeof createSite>; seed: (comments: readonly SeedComment[]) => Promise<void>; dispose: () => Promise<void> }> | undefined;

function annotationsSite() {
  site ??= createDatabase().then(({ db, dispose }) => ({
    fetch: createSite({ DB: db }),
    seed: (comments: readonly SeedComment[]) => seed(db, comments),
    dispose,
  }));
  return site;
}

const seedComments: BrowserCommand<[comments: SeedComment[]]> = async (_context, comments) => {
  const { dispose } = await annotationsSite();
  // A clean database per call, so tests never see each other's comments.
  site = undefined;
  await dispose();
  await (await annotationsSite()).seed(comments);
};

/** Sign the test browser in as Ada, as returning from GitHub would; `null` signs it out. */
const signIn: BrowserCommand<[origin: string | null]> = async ({ context }, origin) => {
  await context.clearCookies({ name: "__Host-svartz-session" });
  if (!origin) return;
  const [name, value] = (await signInAt((await annotationsSite()).fetch, ADA)).split(/=(.*)/s) as [string, string];
  // Chromium treats http://localhost as secure, so it sends a `Secure` cookie there, but only takes one set for https.
  await context.addCookies([{ name, value, url: origin.replace(/^http:/, "https:"), secure: true, httpOnly: true, sameSite: "Lax" }]);
};

async function bodyOf(request: IncomingMessage): Promise<Buffer | undefined> {
  if (request.method === "GET" || request.method === "HEAD") return undefined;
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

const serveAnnotations: Plugin = {
  name: "serve-annotations",
  configureServer(server) {
    server.middlewares.use(async (request: IncomingMessage, response: ServerResponse, next: () => void) => {
      if (!request.url?.startsWith(`${ENDPOINT}/`)) return next();
      const headers = new Headers();
      for (const name of ["cookie", "origin", "content-type", "accept"]) {
        const value = request.headers[name];
        if (typeof value === "string") headers.set(name, value);
      }
      // Served from the test page's own origin, so a same-origin write names it.
      const answer = await (await annotationsSite()).fetch(`http://${request.headers.host}${request.url}`, {
        method: request.method,
        headers,
        body: await bodyOf(request),
      });
      response.statusCode = answer.status;
      answer.headers.forEach((value, name) => response.setHeader(name, value));
      response.end(Buffer.from(await answer.arrayBuffer()));
    });
  },
  async closeBundle() {
    await (await site)?.dispose();
  },
};

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "server",
          environment: "node",
          include: ["tests/**/*.test.ts"],
          exclude: ["tests/**/*.browser.test.ts"],
        },
      },
      {
        plugins: [serveAnnotations],
        test: {
          name: "browser",
          include: ["tests/**/*.browser.test.ts"],
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: "chromium" }],
            // A desktop wide enough for comment cards in the margin beside a 42rem measure.
            viewport: { width: 1440, height: 900 },
            commands: { seedComments, signIn },
          },
        },
      },
    ],
  },
});
