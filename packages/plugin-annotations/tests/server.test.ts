import { afterEach, describe, expect, it } from "vitest";
import { ADA, createDatabase, createSite, ENDPOINT, GRACE, seed } from "./harness";

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
