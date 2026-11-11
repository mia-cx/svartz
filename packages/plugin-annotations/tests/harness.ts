/**
 * The annotations plugin behind Svartz's real server router, on a real D1 from Miniflare. Node only: the server tests
 * use it directly, and the browser tests reach it through the Vite middleware and command in vitest.config.ts.
 */
import { createServerHandle } from "@svartz/core";
import { Miniflare } from "miniflare";
import type { Identity } from "@svartz/auth";
import type { SeedComment } from "./data";
import { DEFAULT_WRITES_PER_HOUR } from "../src/index";
import type { AnnotationsServerOptions } from "../src/server";
import { migrate, type Database } from "../src/store";

export { ADA, ENDPOINT, GRACE, type SeedComment } from "./data";

const OPTIONS: AnnotationsServerOptions = {
  database: { env: "DB" },
  reactions: [],
  moderators: [],
  limits: { writesPerHour: DEFAULT_WRITES_PER_HOUR },
};

/**
 * A fresh, empty D1 database. Each `binding()` is a new binding object over the same data, as each Workers isolate
 * gets its own.
 */
export async function createDatabase() {
  const miniflare = new Miniflare({ modules: true, script: "export default {}", d1Databases: ["DB"] });
  const binding = async () => await miniflare.getD1Database("DB") as unknown as Database;
  return { db: await binding(), binding, dispose: () => miniflare.dispose() };
}

/** One vault's router, answering like the deployed Worker would; `env` is the Workers env the plugin reads its binding from. */
export function createSite(env: Record<string, unknown>, vault = "notes") {
  const handle = createServerHandle({
    basePath: "/notes",
    vault: { id: vault, mountPath: "/notes", site: { title: "Notes" } },
    servers: [{ id: "annotations", load: () => import("../src/server"), options: OPTIONS }],
  }, { privateEnv: {}, building: false, dev: false });
  return (path: string, init?: RequestInit) => {
    const request = new Request(`https://notes.test${path}`, init);
    return handle({
      event: { request, url: new URL(request.url), getClientAddress: () => "203.0.113.7", platform: { env } },
      resolve: async () => new Response("page"),
    });
  };
}


/** Store `comments` and their authors directly, as the write routes will once they exist. */
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
