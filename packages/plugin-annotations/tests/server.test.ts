import { afterEach, describe, expect, it, vi } from "vitest";
import type { Database } from "../src/store";
import { ADA, ALAN, createDatabase, createSite, ENDPOINT, GRACE, ORIGIN, seed, signIn, type Site } from "./harness";

const disposers: Array<() => Promise<void>> = [];

async function database() {
  const created = await createDatabase();
  disposers.push(created.dispose);
  return created;
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(disposers.splice(0).map((dispose) => dispose()));
});

const anchor = (exact: string, start: number) => ({ exact, prefix: "", suffix: "", start, end: start + exact.length });

const HOUR_MS = 3_600_000;
/** The start of the next clock hour, near enough to now that sessions signed in now are still valid. */
const nextHour = () => Math.ceil(Date.now() / HOUR_MS) * HOUR_MS;

describe("each reader's write budget", () => {
  const comment = JSON.stringify({ kind: "comment", page: "garden", anchor: anchor("roses", 0), body: "Lovely." });
  const write = (site: Site, cookie: string, path = "/", method = "POST", body: string | undefined = comment) =>
    site(`${ENDPOINT}${path}`, { method, headers: { cookie, origin: ORIGIN, "content-type": "application/json" }, body: method === "DELETE" ? undefined : body });

  it.each([
    ["comment", "/", "POST", comment],
    ["+1", "/c1/agree/", "POST", JSON.stringify({ agreed: true })],
    ["delete", "/c1/", "DELETE", undefined],
  ])("refuses an over-budget %s before it changes storage", async (_case, path, method, body) => {
    const { db } = await database();
    await seed(db, [{ id: "c1", page: "garden", author: ADA, body: "First.", anchor: anchor("roses", 0), createdAt: "2026-11-02T00:00:00.000Z" }]);
    const site = createSite({ DB: db }, { writesPerHour: 1 });
    const cookie = await signIn(site, ADA);
    vi.spyOn(Date, "now").mockReturnValue(nextHour());
    expect((await write(site, cookie)).status).toBe(201);

    const response = await write(site, cookie, path, method, body);

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("3600");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "rate_limited", retryAfter: 3600, message: "You've sent too many annotations. Try again in 1 hour." });
    const listed = await (await site(`${ENDPOINT}/?page=garden`)).json() as { annotations: Array<{ id: string; agreements: unknown[] }> };
    expect(listed.annotations).toHaveLength(2);
    expect(listed.annotations.find(({ id }) => id === "c1")?.agreements).toEqual([]);
  });

  it("shares each reader's budget across isolates on one database, and keeps readers apart", async () => {
    const { binding } = await database();
    const one = createSite({ DB: await binding() }, { writesPerHour: 2 });
    const two = createSite({ DB: await binding() }, { writesPerHour: 2 });
    const ada = await signIn(one, ADA);
    const alan = await signIn(two, ALAN);

    const statuses = async (...writes: Array<[Site, string]>) => {
      const answers = [];
      for (const [site, cookie] of writes) answers.push((await write(site, cookie)).status);
      return answers;
    };

    expect(await statuses([one, ada], [two, ada], [one, ada], [two, ada])).toEqual([201, 201, 429, 429]);
    expect(await statuses([two, alan], [one, alan], [two, alan])).toEqual([201, 201, 429]);
  });

  it("lets no more than the budget through when writes race across isolates", async () => {
    const { db, binding } = await database();
    const sites = [createSite({ DB: await binding() }, { writesPerHour: 3 }), createSite({ DB: await binding() }, { writesPerHour: 3 })];
    const cookie = await signIn(sites[0]!, ADA);

    const answers = await Promise.all(Array.from({ length: 10 }, (_, index) => write(sites[index % 2]!, cookie)));

    expect(answers.filter(({ status }) => status === 201)).toHaveLength(3);
    expect(answers.filter(({ status }) => status === 429)).toHaveLength(7);
    expect((await db.prepare("SELECT COUNT(*) AS n FROM annotations").all<{ n: number }>()).results).toEqual([{ n: 3 }]);
  });

  it("waits out the clock hour, then starts a fresh one and sweeps the past ones", async () => {
    const { db } = await database();
    const site = createSite({ DB: db }, { writesPerHour: 1 });
    const cookie = await signIn(site, ADA);
    const hour = nextHour();
    const clock = vi.spyOn(Date, "now").mockReturnValue(hour - 30 * 60_000);
    expect((await write(site, cookie)).status).toBe(201);

    for (const [before, retryAfter, wait] of [[90_500, 91, "2 minutes"], [59_000, 59, "59 seconds"], [1, 1, "1 second"]] as const) {
      clock.mockReturnValue(hour - before);
      const refused = await write(site, cookie);
      expect(refused.headers.get("retry-after")).toBe(String(retryAfter));
      expect(await refused.json()).toEqual({ error: "rate_limited", retryAfter, message: `You've sent too many annotations. Try again in ${wait}.` });
    }

    clock.mockReturnValue(hour);
    expect((await write(site, cookie)).status).toBe(201);
    expect((await write(site, cookie)).status).toBe(429);
    expect((await db.prepare("SELECT window_start, identity_id, writes FROM write_counts").all()).results)
      .toEqual([{ window_start: hour, identity_id: ADA.id, writes: 1 }]);
  });
});

describe("the annotations database", () => {
  it("is created on the first request, and racing or later isolates leave it as it is", async () => {
    const { db, binding } = await database();
    const tables = async () => (await db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT GLOB '_cf_*' ORDER BY name").all<{ name: string }>())
      .results.map(({ name }) => name);
    expect(await tables()).toEqual([]);

    // Two isolates racing through their first request, then a third arriving later.
    const first = await Promise.all([binding(), binding()].map(async (isolate) => createSite({ DB: await isolate })(`${ENDPOINT}/?page=garden`)));
    expect(first.map(({ status }) => status)).toEqual([200, 200]);
    const later = await createSite({ DB: await binding() })(`${ENDPOINT}/?page=garden`);

    expect(later.status).toBe(200);
    expect(await later.json()).toEqual({ annotations: [], viewer: null });
    expect(await tables()).toEqual(["agreements", "annotations", "identities", "svartz_annotations_migrations", "write_counts"]);
    const { results } = await db.prepare("SELECT version FROM svartz_annotations_migrations ORDER BY version").all();
    expect(results).toEqual([{ version: 1 }, { version: 2 }]);
  });

  it("brings a version 1 database up to date, keeping its comments", async () => {
    const { db, binding } = await database();
    await seed(db, [{ id: "c1", page: "garden", author: ADA, body: "First.", anchor: anchor("roses", 0), createdAt: "2026-11-02T00:00:00.000Z" }]);
    // What a database migrated before write counts existed looks like.
    await db.batch([db.prepare("DROP TABLE write_counts"), db.prepare("DELETE FROM svartz_annotations_migrations WHERE version = 2")]);

    const site = createSite({ DB: await binding() }, { writesPerHour: 1 });
    const cookie = await signIn(site, ADA);
    const posted = await site(`${ENDPOINT}/`, {
      method: "POST",
      headers: { cookie, origin: ORIGIN, "content-type": "application/json" },
      body: JSON.stringify({ kind: "comment", page: "garden", anchor: anchor("roses", 0), body: "Second." }),
    });

    expect(posted.status).toBe(201);
    expect((await db.prepare("SELECT version FROM svartz_annotations_migrations ORDER BY version").all()).results).toEqual([{ version: 1 }, { version: 2 }]);
    expect((await db.prepare("SELECT id FROM annotations WHERE id = 'c1'").all()).results).toEqual([{ id: "c1" }]);
  });
});

describe("GET ?page=", () => {
  it("lists one page's comments, with authors and agreements, to a reader who isn't signed in", async () => {
    const { db } = await database();
    await seed(db, [
      { id: "c2", page: "garden", author: GRACE, body: "Second", anchor: anchor("roses", 40), createdAt: "2026-11-03T00:00:00.000Z" },
      { id: "c1", page: "garden", author: ADA, body: "First", anchor: anchor("the garden", 4), createdAt: "2026-11-02T00:00:00.000Z", agreedBy: [GRACE] },
      { id: "other-page", page: "orchard", author: ADA, body: "Elsewhere", anchor: anchor("apples", 0), createdAt: "2026-11-02T00:00:00.000Z" },
      { id: "other-vault", vault: "journal", page: "garden", author: ADA, body: "Another vault", anchor: anchor("roses", 40), createdAt: "2026-11-02T00:00:00.000Z" },
    ]);

    const response = await createSite({ DB: db })(`${ENDPOINT}/?page=garden`);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      viewer: null,
      annotations: [
        {
          id: "c1",
          kind: "comment",
          body: "First",
          anchor: { exact: "the garden", prefix: "", suffix: "", start: 4, end: 14 },
          author: ADA,
          createdAt: "2026-11-02T00:00:00.000Z",
          agreements: [{ author: GRACE, createdAt: "2026-11-02T00:00:00.000Z" }],
        },
        {
          id: "c2",
          kind: "comment",
          body: "Second",
          anchor: { exact: "roses", prefix: "", suffix: "", start: 40, end: 45 },
          // Google gives no handle, picture or profile page, so the author has none.
          author: { id: "google:1906", provider: "google", name: "Grace Hopper" },
          createdAt: "2026-11-03T00:00:00.000Z",
          agreements: [],
        },
      ],
    });
  });

  it.each([
    ["without a page", `${ENDPOINT}/`, { DB: "bound" }, 400, "invalid_page"],
    ["without a D1 binding", `${ENDPOINT}/?page=garden`, {}, 503, "misconfigured"],
  ])("refuses a request %s", async (_case, path, env, status, error) => {
    const response = await createSite(env)(path);

    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ error });
  });
});

describe("POST", () => {
  const quote = "the garden";
  const comment = (overrides: Record<string, unknown> = {}) => JSON.stringify({
    kind: "comment", page: "garden", anchor: { exact: quote, prefix: "Walk to ", suffix: " at dusk", start: 8, end: 18 }, body: "Lovely.", ...overrides,
  });
  const post = (site: Site, body: string, headers: Record<string, string>) =>
    site(`${ENDPOINT}/`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body });

  it("stores a signed-in reader's comment, refreshing who they are, and lists it at once", async () => {
    const { db } = await database();
    // Ada commented before under an older name and picture.
    await seed(db, [{ id: "older", page: "garden", author: { ...ADA, name: "Ada Byron", avatarUrl: "https://example.com/old.png" }, body: "Earlier", anchor: anchor("roses", 40), createdAt: "2026-11-01T00:00:00.000Z" }]);
    const site = createSite({ DB: db });
    const session = await signIn(site, ADA);

    const response = await post(site, comment({ body: "  <b>Lovely</b> at dusk.\r\nTruly.  " }), { cookie: session, origin: ORIGIN });

    expect(response.status).toBe(201);
    const { annotation } = await response.json() as { annotation: { id: string; createdAt: string } };
    expect(annotation).toEqual({
      id: expect.any(String),
      kind: "comment",
      // Plain text, trimmed, with one kind of line break; markup stays characters.
      body: "<b>Lovely</b> at dusk.\nTruly.",
      anchor: { exact: quote, prefix: "Walk to ", suffix: " at dusk", start: 8, end: 18 },
      author: ADA,
      createdAt: expect.any(String),
      agreements: [],
    });
    const listed = await (await site(`${ENDPOINT}/?page=garden`)).json() as { annotations: Array<{ id: string; author: unknown }> };
    expect(listed.annotations.map(({ id, author }) => [id, author])).toEqual([["older", ADA], [annotation.id, ADA]]);
    // Identity only: never a token, email or anything else the provider knows.
    const { results } = await db.prepare("SELECT * FROM identities").all();
    expect(results).toEqual([{
      id: ADA.id, provider: "github", name: ADA.name, handle: ADA.handle, avatar_url: ADA.avatarUrl, profile_url: ADA.profileUrl, updated_at: annotation.createdAt,
    }]);
  });

  it.each([
    ["signed out", comment(), {}, 401, "signed_out", "Sign in to comment."],
    ["from another site", comment(), { session: true, origin: "https://evil.test" }, 403, "cross_origin", "Post from this site."],
    ["with no Origin", comment(), { session: true, origin: null }, 403, "cross_origin", "Post from this site."],
    ["over 2,000 characters", comment({ body: "a".repeat(2001) }), { session: true }, 400, "invalid_annotation", "Comments can be up to 2,000 characters."],
    ["quoting over 1,000 characters", comment({ anchor: { exact: "b".repeat(1001), prefix: "", suffix: "", start: 0, end: 1001 } }), { session: true },
      400, "invalid_annotation", "Select up to 1,000 characters to respond to."],
    ["with nothing written", comment({ body: " \n " }), { session: true }, 400, "invalid_annotation", "Write a comment before posting."],
    ["whose position doesn't cover its quote", comment({ anchor: { exact: quote, prefix: "", suffix: "", start: 8, end: 30 } }), { session: true },
      400, "invalid_annotation", "Select the passage in the note you're responding to."],
    ["that isn't JSON", "body=Lovely", { session: true }, 400, "invalid_json", "Send the comment as JSON."],
  ])("refuses a comment %s, storing nothing", async (_case, body, { session = false, origin = ORIGIN }: { session?: boolean; origin?: string | null }, status, error, message) => {
    const { db } = await database();
    const site = createSite({ DB: db });
    const headers: Record<string, string> = {};
    if (session) headers.cookie = await signIn(site, ADA);
    if (origin) headers.origin = origin;

    const response = await post(site, body, headers);

    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error, message });
    expect(await (await site(`${ENDPOINT}/?page=garden`)).json()).toEqual({ annotations: [], viewer: null });
  });

  describe("a body over 32 KiB, sent without a Content-Length", () => {
    const CHUNK = 8 * 1024;
    /** `chunks` chunks of `bytes`, streamed so no Content-Length is sent, counting how many the server pulled. */
    function stream(chunks: Uint8Array[]) {
      let pulled = 0;
      const body = new ReadableStream<Uint8Array>({
        pull(controller) {
          const next = chunks[pulled++];
          if (next) controller.enqueue(next);
          else controller.close();
        },
      });
      return { body, pulled: () => pulled };
    }
    const send = async (site: Site, body: ReadableStream<Uint8Array>) => site(`${ENDPOINT}/`, {
      method: "POST", headers: { "content-type": "application/json", origin: ORIGIN, cookie: await signIn(site, ADA) }, body, duplex: "half",
    } as RequestInit);

    it("is refused, even when its characters fit, storing nothing", async () => {
      const { db } = await database();
      const site = createSite({ DB: db });
      // 20,000 three-byte characters: under 32 Ki code units, over 32 KiB.
      const bytes = new TextEncoder().encode(comment({ ignored: "界".repeat(20_000) }));
      const { body } = stream(Array.from({ length: Math.ceil(bytes.length / CHUNK) }, (_, index) => bytes.subarray(index * CHUNK, (index + 1) * CHUNK)));

      const response = await send(site, body);

      expect(response.status).toBe(413);
      expect(await response.json()).toEqual({ error: "too_large", message: "This comment is too long to post." });
      expect(await (await site(`${ENDPOINT}/?page=garden`)).json()).toEqual({ annotations: [], viewer: null });
    });

    it("is refused as soon as it passes the limit, without reading the rest", async () => {
      const { db } = await database();
      const site = createSite({ DB: db });
      const { body, pulled } = stream(Array.from({ length: 100 }, () => new Uint8Array(CHUNK).fill(0x20)));

      const response = await send(site, body);

      expect(response.status).toBe(413);
      // 32 KiB is four chunks; the fifth passes it. A stream may buffer one more ahead.
      expect(pulled()).toBeLessThanOrEqual(6);
    });
  });
});

describe("POST <id>/agree/", () => {
  /** Grace's comment in the notes vault, a reaction beside it, and a comment in another vault. */
  async function seeded() {
    const created = await database();
    await seed(created.db, [
      { id: "c1", page: "garden", author: GRACE, body: "Roses first.", anchor: anchor("roses", 40), createdAt: "2026-11-02T00:00:00.000Z" },
      { id: "elsewhere", vault: "journal", page: "garden", author: GRACE, body: "Another vault", anchor: anchor("roses", 40), createdAt: "2026-11-02T00:00:00.000Z" },
    ]);
    await created.db.prepare(`INSERT INTO annotations (id, vault, page, kind, reaction, exact, prefix, suffix, start, "end", author_id, created_at)
      VALUES ('r1', 'notes', 'garden', 'reaction', 'heart', 'roses', '', '', 40, 45, ?, '2026-11-02T00:00:00.000Z')`).bind(GRACE.id).run();
    return created;
  }

  const agree = (site: Site, id: string, body: string, headers: Record<string, string>) =>
    site(`${ENDPOINT}/${id}/agree/`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body });
  const agreed = (value: boolean) => JSON.stringify({ agreed: value });
  const stored = async (db: Database) =>
    (await db.prepare("SELECT annotation_id, author_id FROM agreements ORDER BY author_id").all()).results;

  it("adds the signed-in reader's +1 and takes it back, answering who agrees", async () => {
    const { db } = await seeded();
    const site = createSite({ DB: db });
    const session = await signIn(site, ADA);
    const headers = { cookie: session, origin: ORIGIN };

    const on = await agree(site, "c1", agreed(true), headers);

    expect(on.status).toBe(200);
    expect(on.headers.get("cache-control")).toBe("no-store");
    const { agreements } = await on.json() as { agreements: Array<{ createdAt: string }> };
    expect(agreements).toEqual([{ author: ADA, createdAt: expect.any(String) }]);
    // The list names the reader, so their +1 shows as theirs.
    const listed = await (await site(`${ENDPOINT}/?page=garden`, { headers: { cookie: session } })).json() as {
      viewer: unknown; annotations: Array<{ id: string; agreements: unknown }>;
    };
    expect(listed.viewer).toEqual({ id: ADA.id, moderator: false });
    expect(listed.annotations.find(({ id }) => id === "c1")?.agreements).toEqual(agreements);
    const { results: [identity] } = await db.prepare("SELECT name, avatar_url FROM identities WHERE id = ?").bind(ADA.id).all();
    expect(identity).toEqual({ name: ADA.name, avatar_url: ADA.avatarUrl });

    const off = await agree(site, "c1", agreed(false), headers);

    expect(off.status).toBe(200);
    expect(await off.json()).toEqual({ agreed: false, agreements: [] });
    expect(await stored(db)).toEqual([]);
  });

  it("changes nothing more when a request is retried", async () => {
    const { db } = await seeded();
    const site = createSite({ DB: db });
    const headers = { cookie: await signIn(site, ADA), origin: ORIGIN };

    const first = await (await agree(site, "c1", agreed(true), headers)).json();
    const retried = await agree(site, "c1", agreed(true), headers);

    expect(retried.status).toBe(200);
    // The first agreement stands, time and all.
    expect(await retried.json()).toEqual(first);
    expect(await stored(db)).toEqual([{ annotation_id: "c1", author_id: ADA.id }]);

    await agree(site, "c1", agreed(false), headers);
    const retriedOff = await agree(site, "c1", agreed(false), headers);

    expect(await retriedOff.json()).toEqual({ agreed: false, agreements: [] });
    expect(await stored(db)).toEqual([]);
  });

  it("keeps one +1 per reader when their requests race through separate isolates", async () => {
    const { db, binding } = await seeded();
    const alan = { id: "github:1912", provider: "github", name: "Alan Turing", handle: "alan" } as const;
    const ada = await signIn(createSite({ DB: db }), ADA);
    const other = await signIn(createSite({ DB: db }), alan);

    const answers = await Promise.all([
      ...Array.from({ length: 4 }, async () => agree(createSite({ DB: await binding() }), "c1", agreed(true), { cookie: ada, origin: ORIGIN })),
      agree(createSite({ DB: await binding() }), "c1", agreed(true), { cookie: other, origin: ORIGIN }),
    ]);

    expect(answers.map(({ status }) => status)).toEqual([200, 200, 200, 200, 200]);
    expect(await stored(db)).toEqual([{ annotation_id: "c1", author_id: ADA.id }, { annotation_id: "c1", author_id: alan.id }]);
  });

  it.each([
    ["signed out", "c1", agreed(true), {}, 401, "signed_out", "Sign in to +1 a comment."],
    ["from another site", "c1", agreed(true), { session: true, origin: "https://evil.test" }, 403, "cross_origin", "Post from this site."],
    ["with no Origin", "c1", agreed(true), { session: true, origin: null }, 403, "cross_origin", "Post from this site."],
    ["that isn't JSON", "c1", "agreed=true", { session: true }, 400, "invalid_json", "Send the +1 as JSON."],
    ["without agreed", "c1", JSON.stringify({ agreed: "yes" }), { session: true }, 400, "invalid_agreement",
      "Send { agreed: true } to +1 a comment, or { agreed: false } to take it back."],
    ["over 32 KiB", "c1", JSON.stringify({ agreed: true, padding: "x".repeat(33 * 1024) }), { session: true }, 413, "too_large",
      "Send only { agreed } to +1 a comment."],
    ["on a reaction", "r1", agreed(true), { session: true }, 400, "invalid_agreement", "Only comments take a +1."],
    ["on a comment that doesn't exist", "deleted", agreed(true), { session: true }, 404, "not_found", "This comment has been deleted."],
    ["on another vault's comment", "elsewhere", agreed(true), { session: true }, 404, "not_found", "This comment has been deleted."],
  ])("refuses a +1 %s, storing nothing", async (_case, id, body, { session = false, origin = ORIGIN }: { session?: boolean; origin?: string | null }, status, error, message) => {
    const { db } = await seeded();
    const site = createSite({ DB: db });
    const headers: Record<string, string> = {};
    if (session) headers.cookie = await signIn(site, ADA);
    if (origin) headers.origin = origin;

    const response = await agree(site, id, body, headers);

    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error, message });
    expect(await stored(db)).toEqual([]);
    // Refused before anything is written about the reader.
    const { results } = await db.prepare("SELECT id FROM identities WHERE id = ?").bind(ADA.id).all();
    expect(results).toEqual([]);
  });

  it("answers only POST", async () => {
    const { db } = await seeded();

    const response = await createSite({ DB: db })(`${ENDPOINT}/c1/agree/`);

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
  });
});

describe("DELETE <id>/", () => {
  /** Grace's comment that Ada and Alan agree with, Ada's comment, Grace's reaction, and Ada's comment in another vault. */
  async function seeded() {
    const created = await database();
    await seed(created.db, [
      { id: "c1", page: "garden", author: GRACE, body: "Roses first.", anchor: anchor("roses", 40), createdAt: "2026-11-02T00:00:00.000Z", agreedBy: [ADA, ALAN] },
      { id: "c2", page: "garden", author: ADA, body: "Then tulips.", anchor: anchor("tulips", 60), createdAt: "2026-11-03T00:00:00.000Z", agreedBy: [ALAN] },
      { id: "elsewhere", vault: "journal", page: "garden", author: ADA, body: "Another vault", anchor: anchor("roses", 40), createdAt: "2026-11-02T00:00:00.000Z" },
    ]);
    await created.db.prepare(`INSERT INTO annotations (id, vault, page, kind, reaction, exact, prefix, suffix, start, "end", author_id, created_at)
      VALUES ('r1', 'notes', 'garden', 'reaction', 'heart', 'roses', '', '', 40, 45, ?, '2026-11-02T00:00:00.000Z')`).bind(GRACE.id).run();
    return { ...created, site: createSite({ DB: created.db }, { moderators: [ALAN.id] }) };
  }

  const remove = (site: Site, id: string, headers: Record<string, string>) => site(`${ENDPOINT}/${id}/`, { method: "DELETE", headers });
  const stored = async (db: Database) => ({
    annotations: (await db.prepare("SELECT id FROM annotations ORDER BY id").all<{ id: string }>()).results.map(({ id }) => id),
    agreements: (await db.prepare("SELECT annotation_id, author_id FROM agreements ORDER BY author_id").all()).results,
  });

  it("deletes the reader's own comment and its agreements, leaving everyone else's", async () => {
    const { db, site } = await seeded();
    const headers = { cookie: await signIn(site, ADA), origin: ORIGIN };

    const response = await remove(site, "c2", headers);

    expect(response.status).toBe(204);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await stored(db)).toEqual({
      annotations: ["c1", "elsewhere", "r1"],
      // Alan's agreement with Ada's comment went with it; his and Ada's with Grace's stay.
      agreements: [{ annotation_id: "c1", author_id: ADA.id }, { annotation_id: "c1", author_id: ALAN.id }],
    });
  });

  it("lets a moderator delete anyone's comment, with its agreements, and anyone's reaction", async () => {
    const { db, site } = await seeded();
    const session = await signIn(site, ALAN);
    const listed = await (await site(`${ENDPOINT}/?page=garden`, { headers: { cookie: session } })).json() as { viewer: unknown };
    expect(listed.viewer).toEqual({ id: ALAN.id, moderator: true });

    const comment = await remove(site, "c1", { cookie: session, origin: ORIGIN });
    const reaction = await remove(site, "r1", { cookie: session, origin: ORIGIN });

    expect([comment.status, reaction.status]).toEqual([204, 204]);
    expect(await stored(db)).toEqual({ annotations: ["c2", "elsewhere"], agreements: [{ annotation_id: "c2", author_id: ALAN.id }] });
  });

  it("answers a retried delete with 404, changing nothing more", async () => {
    const { db, site } = await seeded();
    const headers = { cookie: await signIn(site, ADA), origin: ORIGIN };

    const first = await remove(site, "c2", headers);
    const after = await stored(db);
    const retried = await remove(site, "c2", headers);

    expect(first.status).toBe(204);
    expect(retried.status).toBe(404);
    expect(await retried.json()).toEqual({ error: "not_found", message: "This comment has been deleted." });
    expect(await stored(db)).toEqual(after);
  });

  it.each([
    ["signed out", "c2", {}, 401, "signed_out", "Sign in to delete a comment."],
    ["from another site", "c2", { as: ADA, origin: "https://evil.test" }, 403, "cross_origin", "Post from this site."],
    ["with no Origin", "c2", { as: ADA, origin: null }, 403, "cross_origin", "Post from this site."],
    ["by someone who didn't write it", "c1", { as: ADA }, 403, "forbidden", "Only its author or a moderator can delete this comment."],
    ["of a comment that doesn't exist", "deleted", { as: ADA }, 404, "not_found", "This comment has been deleted."],
    ["of another vault's comment, even its author's", "elsewhere", { as: ADA }, 404, "not_found", "This comment has been deleted."],
  ])("refuses a delete %s, changing nothing", async (_case, id, { as, origin = ORIGIN }: { as?: typeof ADA; origin?: string | null }, status, error, message) => {
    const { db, site } = await seeded();
    const before = await stored(db);
    const headers: Record<string, string> = {};
    if (as) headers.cookie = await signIn(site, as);
    if (origin) headers.origin = origin;

    const response = await remove(site, id, headers);

    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error, message });
    expect(await stored(db)).toEqual(before);
  });

  it("answers only DELETE", async () => {
    const { site } = await seeded();

    const response = await site(`${ENDPOINT}/c1/`);

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("DELETE");
  });
});
