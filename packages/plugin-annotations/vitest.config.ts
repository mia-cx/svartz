import type { IncomingMessage, ServerResponse } from "node:http";
import { playwright } from "@vitest/browser-playwright";
import type { Plugin } from "vite";
import type { BrowserCommand } from "vitest/node";
import { defineConfig } from "vitest/config";
import { createDatabase, createSite, ENDPOINT, seed, type SeedComment } from "./tests/harness";

/**
 * Browser tests read annotations from the real plugin on a real D1, same-origin as the test page: this serves
 * `ENDPOINT` from the Vite dev server, and the `seedComments` command fills the database between tests.
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

const serveAnnotations: Plugin = {
  name: "serve-annotations",
  configureServer(server) {
    server.middlewares.use(async (request: IncomingMessage, response: ServerResponse, next: () => void) => {
      if (!request.url?.startsWith(`${ENDPOINT}/`)) return next();
      const answer = await (await annotationsSite()).fetch(request.url, { method: request.method });
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
            commands: { seedComments },
          },
        },
      },
    ],
  },
});
