import type { IncomingMessage, ServerResponse } from "node:http";
import { playwright } from "@vitest/browser-playwright";
import type { Plugin } from "vite";
import type { BrowserCommand } from "vitest/node";
import { defineConfig } from "vitest/config";
import { createDashboardSite, type Viewer } from "./tests/dashboard-harness";

/**
 * Dashboard browser tests render what the real auth server answers on a real D1: the `dashboardPage` command answers a
 * page as one of the harness's viewers, `signInAs` gives the test browser that viewer's session cookie, and the
 * middleware serves the vault's plugin routes from the Vite dev server, same-origin as the test page.
 */
let site: ReturnType<typeof createDashboardSite> | undefined;
const dashboardSite = () => site ??= createDashboardSite();

const dashboardPage: BrowserCommand<[viewer: Viewer, path: string]> = async (_context, viewer, path) =>
  (await dashboardSite()).page(viewer, path);

const signInAs: BrowserCommand<[origin: string, viewer: Viewer]> = async ({ context }, origin, viewer) => {
  const [name, value] = (await dashboardSite()).sessions[viewer].split(/=(.*)/s) as [string, string];
  // Chromium treats http://localhost as secure, so it sends a `Secure` cookie there, but only takes one set for https.
  await context.addCookies([{ name, value, url: origin.replace(/^http:/, "https:"), secure: true, httpOnly: true, sameSite: "Lax" }]);
};

const serveAuth: Plugin = {
  name: "serve-auth",
  configureServer(server) {
    server.middlewares.use(async (request: IncomingMessage, response: ServerResponse, next: () => void) => {
      if (!request.url?.startsWith("/notes/_svartz/")) return next();
      const headers = new Headers();
      for (const name of ["cookie", "origin", "accept"]) {
        const value = request.headers[name];
        if (typeof value === "string") headers.set(name, value);
      }
      const answer = await (await dashboardSite()).handle(new Request(`http://${request.headers.host}${request.url}`, { method: request.method, headers }));
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
          // Real D1 workflows include Miniflare startup and several sign-ins. CI runs every workspace's tests at once
          // on one small runner, where the same test takes several times as long.
          testTimeout: process.env.CI ? 60_000 : 15_000,
          include: ["tests/**/*.test.ts"],
          exclude: ["tests/**/*.browser.test.ts"],
        },
      },
      {
        plugins: [serveAuth],
        test: {
          name: "browser",
          include: ["tests/**/*.browser.test.ts"],
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: "chromium" }],
            commands: { dashboardPage, signInAs },
          },
        },
      },
    ],
  },
});
