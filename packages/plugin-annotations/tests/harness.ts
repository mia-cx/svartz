/**
 * The annotations plugin behind Svartz's real server router, beside the real `auth` plugin, on a real D1 from
 * Miniflare. Node only: the server tests use it directly, and the browser tests reach it through the Vite middleware
 * and commands in vitest.config.ts.
 */
import { createServerHandle } from "@svartz/core";
import { Miniflare } from "miniflare";
import type { Identity } from "@svartz/auth";
import type { SeedComment } from "./data";
import { DEFAULT_WRITES_PER_HOUR } from "../src/index";
import type { AnnotationsServerOptions } from "../src/server";
import { migrate, type Database } from "../src/store";

export { ADA, ALAN, ENDPOINT, GRACE, type SeedComment } from "./data";

/** Where the router answers unless a test says otherwise; writes must name it as their `Origin`. */
export const ORIGIN = "https://notes.test";
const AUTH = "/notes/_svartz/auth";

const OPTIONS: AnnotationsServerOptions = {
  database: { env: "DB" },
  reactions: [],
  moderators: [],
  limits: { writesPerHour: DEFAULT_WRITES_PER_HOUR },
};

/** The secrets `auth` needs to seal sessions and finish a GitHub sign-in. */
const AUTH_ENV = {
  PRIVATE_SVARTZ_SESSION_SECRET: "test-secret-0123456789-abcdefghijklmnop",
  PRIVATE_GITHUB_SECRET: "fake-client-secret",
};

/**
 * A fresh, empty D1 database. Each `binding()` is a new binding object over the same data, as each Workers isolate
 * gets its own.
 */
export async function createDatabase() {
  const miniflare = new Miniflare({ modules: true, script: "export default {}", d1Databases: ["DB"] });
  // Miniflare caches one binding object, so wrap it: a fresh object is what a fresh isolate's per-binding state keys on.
  const binding = async (): Promise<Database> => {
    const db = await miniflare.getD1Database("DB") as unknown as Database;
    return { prepare: (query) => db.prepare(query), batch: (statements) => db.batch(statements) };
  };
  return { db: await binding(), binding, dispose: () => miniflare.dispose() };
}

export type Site = ReturnType<typeof createSite>;

/**
 * One vault's router with `auth` and `annotations`, answering like the deployed Worker would. `env` is the Workers env
 * the plugins read their binding and secrets from; `origin` is where the site is served; `moderators` may delete
 * anyone's annotations.
 */
export function createSite(env: Record<string, unknown>, { vault = "notes", origin = ORIGIN, moderators = [] as readonly string[], writesPerHour = DEFAULT_WRITES_PER_HOUR } = {}) {
  const handle = createServerHandle({
    basePath: "/notes",
    vault: { id: vault, mountPath: "/notes", site: { title: "Notes" } },
    servers: [
      {
        id: "auth",
        load: () => import("@svartz/auth/server"),
        options: { providers: { github: { clientId: "fake-client-id", clientSecret: { env: "PRIVATE_GITHUB_SECRET" } } } },
      },
      { id: "annotations", load: () => import("../src/server"), options: { ...OPTIONS, moderators, limits: { writesPerHour } } },
    ],
  }, { privateEnv: {}, building: false, dev: false });
  return (path: string, init?: RequestInit) => {
    // A full URL, from the browser tests' middleware, names its own origin.
    const request = new Request(new URL(path, origin), init);
    return handle({
      event: { request, url: new URL(request.url), getClientAddress: () => "203.0.113.7", platform: { env: { ...AUTH_ENV, ...env } } },
      resolve: async () => new Response("page"),
    });
  };
}

/**
 * Sign `person` in through `auth`'s real start and callback routes, with GitHub stubbed to vouch for them, and answer
 * the `name=value` session cookie a browser would send back.
 */
export async function signIn(site: Site, person: Identity): Promise<string> {
  const start = await site(`${AUTH}/start/github/?returnTo=%2Fnotes%2F`);
  const state = new URL(start.headers.get("location")!).searchParams.get("state")!;
  const flow = start.headers.getSetCookie()[0]!.split(";")[0]!;
  const user = { id: Number(person.id.split(":")[1]), login: person.handle, name: person.name, avatar_url: person.avatarUrl, html_url: person.profileUrl };
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    // Read the URL without wrapping a Request: that would consume the token request's body.
    const url = input instanceof Request ? input.url : String(input);
    if (url === "https://github.com/login/oauth/access_token") return Response.json({ access_token: "fake-access-token", token_type: "Bearer" });
    if (url === "https://api.github.com/user") return Response.json(user);
    return realFetch(input, init);
  };
  try {
    const callback = await site(`${AUTH}/callback/github/?code=issued-code&state=${state}`, { headers: { cookie: flow } });
    const session = callback.headers.getSetCookie().map((header) => header.split(";")[0]!).find((pair) => pair.startsWith("__Host-svartz-session="));
    if (!session) throw new Error(`sign-in answered ${callback.status}: ${await callback.text()}`);
    return session;
  } finally {
    globalThis.fetch = realFetch;
  }
}

/** Store `comments` and their authors directly, for tests about reading them. */
export async function seed(db: Database, comments: readonly SeedComment[]): Promise<void> {
  await migrate(db);
  const statements = [];
  const people = new Map<string, Identity>();
  for (const { author, agreedBy = [] } of comments) for (const person of [author, ...agreedBy]) people.set(person.id, person);
  for (const person of people.values()) {
    statements.push(db.prepare(`INSERT OR REPLACE INTO identities (id, provider, name, handle, avatar_url, profile_url, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(person.id, person.provider, person.name, person.handle ?? null,
      person.avatarUrl ?? null, person.profileUrl ?? null, "2026-11-01T00:00:00.000Z"));
  }
  for (const { id, vault = "notes", page, author, body, anchor, createdAt, agreedBy = [] } of comments) {
    statements.push(db.prepare(`INSERT INTO annotations (id, vault, page, kind, body, exact, prefix, suffix, start, "end", author_id, created_at)
      VALUES (?, ?, ?, 'comment', ?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, vault, page, body, anchor.exact, anchor.prefix, anchor.suffix,
      anchor.start, anchor.end, author.id, createdAt));
    for (const [index, person] of agreedBy.entries()) {
      statements.push(db.prepare("INSERT INTO agreements (annotation_id, author_id, created_at) VALUES (?, ?, ?)")
        .bind(id, person.id, `2026-11-0${index + 2}T00:00:00.000Z`));
    }
  }
  await db.batch(statements);
}
