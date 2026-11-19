import type { IncomingMessage, ServerResponse } from "node:http";
import { playwright } from "@vitest/browser-playwright";
import type { Plugin } from "vite";
import type { BrowserCommand } from "vitest/node";
import { defineConfig } from "vitest/config";
import type { Identity } from "@svartz/auth";
import { ADA, ALAN, createDatabase, createSite, grant, GRACE, seedComment, signIn, type Database, type Site } from "./tests/harness";

/**
 * Browser tests report through the real plugins on a real D1, same-origin as the test page: the middleware serves the
 * vault's `/notes/_svartz/` routes from the Vite dev server, `resetSite` starts a fresh site (Ada reads, Alan handles
 * reports and may hide comments, Grace wrote comment c1 on garden), `signInAs` gives the test browser a session, and
 * `storedReports` and `reportsPanel` read what landed.
 */
interface Running {
  readonly site: Site;
  readonly db: Database;
  readonly sessions: Readonly<Record<string, string>>;
  readonly dispose: () => Promise<void>;
}
let running: Promise<Running> | undefined;

async function start(): Promise<Running> {
  const { db, dispose } = await createDatabase();
  const site = createSite(db);
  const sessions: Record<string, string> = {};
  for (const person of [ADA, ALAN, GRACE]) sessions[person.handle!] = await signIn(site, person);
  await grant(db, "alan", "moderation:reports:read");
  await grant(db, "alan", "annotations:comments:delete");
  await seedComment(site, db, GRACE);
  return { site, db, sessions, dispose };
}
const current = () => running ??= start();

const resetSite: BrowserCommand<[]> = async () => {
  const previous = running;
  running = undefined;
  await (await previous)?.dispose();
  await current();
};

/** Give the test browser `person`'s session at `origin`; `null` signs it out. */
const signInAs: BrowserCommand<[origin: string, person: Identity | null]> = async ({ context }, origin, person) => {
  await context.clearCookies({ name: "__Host-svartz-session" });
  if (!person) return;
  const [name, value] = (await current()).sessions[person.handle!]!.split(/=(.*)/s) as [string, string];
  // Chromium treats http://localhost as secure, so it sends a `Secure` cookie there, but only takes one set for https.
  await context.addCookies([{ name, value, url: origin.replace(/^http:/, "https:"), secure: true, httpOnly: true, sameSite: "Lax" }]);
};

/** Every stored report; none before a report has created the table. */
const storedReports: BrowserCommand<[]> = async () => {
  const { db } = await current();
  const { results: [table] } = await db.prepare("SELECT name FROM sqlite_schema WHERE name = 'moderation_reports'").all();
  return table ? (await db.prepare("SELECT target_kind, target_id, reason FROM moderation_reports ORDER BY created_at").all()).results : [];
};

/** The Reports panel as `person` sees it, or `null` for the 404. */
const reportsPanel: BrowserCommand<[person: Identity]> = async (_context, person) => {
  const { site, sessions } = await current();
  const result = await site.page("/notes/-/dashboard/moderation/reports/", sessions[person.handle!]);
  return result && !("redirect" in result) ? result.html : null;
};

async function bodyOf(request: IncomingMessage): Promise<Buffer | undefined> {
  if (request.method === "GET" || request.method === "HEAD") return undefined;
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

const serveSite: Plugin = {
  name: "serve-site",
  configureServer(server) {
    server.middlewares.use(async (request: IncomingMessage, response: ServerResponse, next: () => void) => {
      if (!request.url?.startsWith("/notes/_svartz/")) return next();
      const headers = new Headers();
      for (const name of ["cookie", "origin", "content-type", "accept"]) {
        const value = request.headers[name];
        if (typeof value === "string") headers.set(name, value);
      }
      const answer = await (await current()).site.fetch(`http://${request.headers.host}${request.url}`, { method: request.method, headers, body: await bodyOf(request) });
      response.statusCode = answer.status;
      answer.headers.forEach((value, name) => response.setHeader(name, value));
      response.end(Buffer.from(await answer.arrayBuffer()));
    });
  },
  async closeBundle() {
    await (await running)?.dispose();
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
        plugins: [serveSite],
        test: {
          name: "browser",
          include: ["tests/**/*.browser.test.ts"],
          fileParallelism: false,
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: "chromium" }],
            viewport: { width: 1280, height: 800 },
            commands: { resetSite, signInAs, storedReports, reportsPanel },
          },
        },
      },
    ],
  },
});
