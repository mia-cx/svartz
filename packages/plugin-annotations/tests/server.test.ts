import { afterEach, describe, expect, it } from "vitest";
import { ADA, createDatabase, createSite, ENDPOINT, GRACE, ORIGIN, seed, signIn, type Site } from "./harness";

const disposers: Array<() => Promise<void>> = [];

async function database() {
  const created = await createDatabase();
  disposers.push(created.dispose);
  return created;
}

afterEach(async () => {
  await Promise.all(disposers.splice(0).map((dispose) => dispose()));
});

const anchor = (exact: string, start: number) => ({ exact, prefix: "", suffix: "", start, end: start + exact.length });

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
    expect(await later.json()).toEqual({ annotations: [] });
    expect(await tables()).toEqual(["agreements", "annotations", "identities", "svartz_annotations_migrations"]);
    const { results } = await db.prepare("SELECT version FROM svartz_annotations_migrations").all();
    expect(results).toEqual([{ version: 1 }]);
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
    expect(await (await site(`${ENDPOINT}/?page=garden`)).json()).toEqual({ annotations: [] });
  });
});
