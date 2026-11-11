import { describe, expect, it, vi } from "vitest";
import { createServerHandle, DEV_BINDINGS, type DevBindings, type ServerContext, type ServerHandleEvent, type ServerRegistry } from "../src/plugin/server";

const vault = { id: "wiki", mountPath: "", site: { title: "Wiki" } };

describe("page representation negotiation", () => {
  // Proves agent defaults, explicit media preferences, methods and prerendering preserve the requested representation.
  it.each([
    ["text/markdown", "", "GET", false, true],
    ["text/markdown; q=0.8, text/html; q=0.2", "", "GET", false, true],
    ["text/markdown, */*", "", "HEAD", false, true],
    ["*/*", "ChatGPT-User/1.0", "GET", false, true],
    [undefined, "ClaudeBot/1.0", "GET", false, true],
    ["*/*", "Mozilla/5.0", "GET", false, false],
    ["text/html, */*", "GPTBot/1.0", "GET", false, false],
    ["text/html, text/markdown;q=0.5", "ClaudeBot/1.0", "GET", false, false],
    ["text/markdown;q=0, */*", "GPTBot/1.0", "GET", false, false],
    ["text/markdown;q=invalid", "GPTBot/1.0", "GET", false, false],
    ["text/html, text/markdown", "", "GET", false, false],
    ["text/markdown", "", "POST", false, false],
    ["text/markdown", "GPTBot/1.0", "GET", true, false],
  ])("Accept %s, agent %s, %s, building %s", async (accept, agent, method, building, markdown) => {
    const headers = new Headers({ "user-agent": agent });
    if (accept !== undefined) headers.set("accept", accept);
    const request = new Request("https://wiki.test/site/docs/guide?x=1", { method, headers });
    const handle = createServerHandle({
      basePath: "/site/docs", vault, servers: [],
      markdown: { "/site/docs/guide/": "/site/docs/guide.md" },
    }, { privateEnv: {}, dev: false, building });
    const response = await handle({
      event: { request, url: new URL(request.url), getClientAddress: () => "" },
      resolve: () => new Response("<h1>Guide</h1>", { headers: { vary: "Accept-Encoding" } }),
    });
    // The copy's links are relative to its own URL, so agents are sent there rather than served it at the page URL.
    expect(response.status).toBe(markdown ? 303 : 200);
    expect(response.headers.get("location")).toBe(markdown ? "/site/docs/guide.md" : null);
    if (!markdown) expect(await response.text()).toBe("<h1>Guide</h1>");
    if (!building && method !== "POST") {
      expect(response.headers.get("vary")).toContain("Accept");
      expect(response.headers.get("vary")).toContain("User-Agent");
      expect(response.headers.get("cache-control")).toBe("private, no-cache");
      if (!markdown) expect(response.headers.get("vary")).toContain("Accept-Encoding");
    }
  });

  // Proves non-ASCII pages negotiate although request paths arrive percent-encoded, and malformed escapes fall through.
  it.each([
    ["/caf%C3%A9/", "/caf%C3%A9.md"],
    ["/%E6%97%A5%E6%9C%AC%E8%AA%9E", "/%E6%97%A5%E6%9C%AC%E8%AA%9E.md"],
    ["/caf%E9/", null],
  ])("negotiates %s", async (path, location) => {
    const handle = createServerHandle({
      basePath: "", vault, servers: [],
      markdown: { "/café/": "/café.md", "/日本語/": "/日本語.md" },
    }, { privateEnv: {}, dev: false, building: false });
    const request = new Request(`https://wiki.test${path}`, { headers: { accept: "text/markdown" } });
    const response = await handle({
      event: { request, url: new URL(request.url), getClientAddress: () => "" },
      resolve: () => new Response("<h1>Page</h1>"),
    });
    expect(response.headers.get("location")).toBe(location);
  });
});

function event(path: string, platform?: unknown, clientAddress: () => string = () => "203.0.113.7"): ServerHandleEvent {
  return {
    request: new Request(`https://wiki.test${path}`, { method: "POST", body: "hi" }),
    url: new URL(`https://wiki.test${path}`),
    platform,
    getClientAddress: clientAddress,
  };
}

function setup({ basePath = "", building = false, dev = false, privateEnv = { SECRET: "from-process" } } = {}) {
  const seen: Array<{ id: string; pathname: string; context: ServerContext }> = [];
  const factory = (id: string) => vi.fn((options: unknown, data: unknown) => (request: Request, context: ServerContext) => {
    const { pathname } = new URL(request.url);
    seen.push({ id, pathname, context });
    return pathname.endsWith("/missing/") ? undefined : Response.json({ id, options, data });
  });
  const hello = factory("hello");
  const helloWorld = factory("hello-world");
  const registry: ServerRegistry = {
    basePath,
    vault,
    servers: [
      { id: "hello", load: async () => ({ default: hello }), options: { greeting: "hi" }, data: { commit: "abc123" } },
      { id: "hello-world", load: async () => ({ default: helloWorld }) },
    ],
  };
  const resolve = vi.fn(async () => new Response("page"));
  const handle = createServerHandle(registry, { privateEnv, building, dev });
  return { handle, resolve, seen, hello };
}

describe("server plugin routing", () => {
  it("sends requests under /_svartz/<id>/ to that plugin only, with its options and build data", async () => {
    const { handle, resolve, seen } = setup();

    const response = await handle({ event: event("/_svartz/hello/ping/"), resolve });

    expect(await response.json()).toEqual({ id: "hello", options: { greeting: "hi" }, data: { commit: "abc123" } });
    expect(seen.map(({ id, pathname }) => [id, pathname])).toEqual([["hello", "/_svartz/hello/ping/"]]);
    expect(resolve).not.toHaveBeenCalled();
  });

  it("matches the id as a whole path segment", async () => {
    const { handle, resolve, seen } = setup();

    await handle({ event: event("/_svartz/hello-world/"), resolve });

    expect(seen.map(({ id }) => id)).toEqual(["hello-world"]);
  });

  it("never reaches plugins for other paths", async () => {
    const { handle, resolve, seen, hello } = setup();

    for (const path of ["/", "/notes/hello/", "/_svartzhello/", "/x/_svartz/hello/"]) {
      const response = await handle({ event: event(path), resolve });
      expect(await response.text()).toBe("page");
    }

    expect(resolve).toHaveBeenCalledTimes(4);
    expect(seen).toEqual([]);
    expect(hello).not.toHaveBeenCalled();
  });

  it("answers 404 for unknown plugins and unhandled sub-paths", async () => {
    const { handle, resolve } = setup();

    for (const path of ["/_svartz/", "/_svartz/nope/", "/_svartz/%68ello/", "/_svartz/hello/missing/"]) {
      const response = await handle({ event: event(path), resolve });
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({ error: "not_found" });
    }
    expect(resolve).not.toHaveBeenCalled();
  });

  it("redirects plugin paths without a trailing slash, keeping the query", async () => {
    const { handle, resolve, hello } = setup();

    const response = await handle({ event: event("/_svartz/hello/ping?x=1"), resolve });

    expect([response.status, response.headers.get("location")]).toEqual([308, "/_svartz/hello/ping/?x=1"]);
    expect(hello).not.toHaveBeenCalled();
  });

  it("serves a slashless path when the matched route already removed the slash", async () => {
    // A host's catch-all route defaults to trailingSlash 'never', which SvelteKit applies before hooks run.
    const { handle, resolve, seen } = setup();

    const response = await handle({ event: { ...event("/_svartz/hello/ping?x=1"), route: { id: "/[...slug]" } }, resolve });

    expect(response.status).toBe(200);
    expect(seen.map(({ pathname }) => pathname)).toEqual(["/_svartz/hello/ping/"]);
  });

  it("serves below the deployment base and vault mount", async () => {
    const { handle, resolve, seen } = setup({ basePath: "/site/docs" });

    expect((await handle({ event: event("/site/docs/_svartz/hello/"), resolve })).status).toBe(200);
    expect(await (await handle({ event: event("/_svartz/hello/"), resolve })).text()).toBe("page");
    expect(seen[0]!.context.base).toBe("/site/docs/_svartz/hello");
  });

  it("answers 404 without running plugins while prerendering", async () => {
    const { handle, resolve, hello } = setup({ building: true });

    expect((await handle({ event: event("/_svartz/hello/"), resolve })).status).toBe(404);
    // No redirect while prerendering: SvelteKit would write it out as a static page.
    expect((await handle({ event: event("/_svartz/hello/ping"), resolve })).status).toBe(404);
    expect(hello).not.toHaveBeenCalled();
  });

  it("builds each handler once", async () => {
    const { handle, resolve, hello } = setup();

    await handle({ event: event("/_svartz/hello/"), resolve });
    await handle({ event: event("/_svartz/hello/again/"), resolve });

    expect(hello).toHaveBeenCalledTimes(1);
  });
});

describe("server plugin loading", () => {
  it("retries a server module that failed to load", async () => {
    const load = vi.fn()
      .mockRejectedValueOnce(new Error("cold start"))
      .mockResolvedValue({ default: () => () => new Response("ok") });
    const handle = createServerHandle({ basePath: "", vault, servers: [{ id: "flaky", load }] }, { privateEnv: {}, building: false, dev: false });
    const resolve = vi.fn(async () => new Response("page"));

    await expect(handle({ event: event("/_svartz/flaky/"), resolve })).rejects.toThrow("cold start");
    expect(await (await handle({ event: event("/_svartz/flaky/"), resolve })).text()).toBe("ok");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("names the plugin when its module has no factory", async () => {
    const handle = createServerHandle({ basePath: "", vault, servers: [{ id: "empty", load: async () => ({}) }] }, { privateEnv: {}, building: false, dev: false });

    await expect(handle({ event: event("/_svartz/empty/"), resolve: async () => new Response() }))
      .rejects.toThrow('plugin "empty" server module must default-export a factory');
  });
});

describe("server plugin context", () => {
  it("uses the platform's env and waitUntil when the platform has them", async () => {
    const { handle, resolve, seen } = setup();
    const waitUntil = vi.fn();
    const task = Promise.resolve();

    await handle({ event: event("/_svartz/hello/", { env: { SECRET: "from-platform" }, ctx: { waitUntil } }), resolve });
    seen[0]!.context.waitUntil(task);

    expect(seen[0]!.context).toMatchObject({ env: { SECRET: "from-platform" }, clientAddress: "203.0.113.7", vault, base: "/_svartz/hello" });
    expect(waitUntil).toHaveBeenCalledWith(task);
  });

  it("reads the private env in dev, where the Cloudflare emulator's prerender platform throws on env access", async () => {
    const { handle, resolve, seen } = setup({ dev: true });
    const restricted = { env: Object.defineProperty({}, "SECRET", { get: () => { throw new Error("prerenderable route"); } }) };

    await handle({ event: event("/_svartz/hello/", restricted), resolve });

    expect(seen[0]!.context.env.SECRET).toBe("from-process");
  });

  it("adds the bindings svartz dev registers in dev, winning over the private env", async () => {
    const { handle, resolve, seen } = setup({ dev: true, privateEnv: { SECRET: "from-process", TOKEN: "from-dotenv" } });
    const db = { prepare: vi.fn() };
    const slot = globalThis as { [DEV_BINDINGS]?: DevBindings };
    slot[DEV_BINDINGS] = async () => ({ DB: db, TOKEN: "from-wrangler" });
    try {
      await handle({ event: event("/_svartz/hello/"), resolve });
    } finally {
      delete slot[DEV_BINDINGS];
    }

    expect(seen[0]!.context.env).toEqual({ SECRET: "from-process", TOKEN: "from-wrangler", DB: db });
  });

  it("reports a missing Cloudflare client address as unknown", async () => {
    const { handle, resolve, seen } = setup();

    await handle({ event: event("/_svartz/hello/", { env: {} }, () => null as unknown as string), resolve });

    expect(seen[0]!.context.clientAddress).toBeUndefined();
  });

  it("falls back to the private env, an unknown client address and a logged background task", async () => {
    const { handle, resolve, seen } = setup();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    await handle({ event: event("/_svartz/hello/", undefined, () => { throw new Error("no address"); }), resolve });
    const { context } = seen[0]!;
    context.waitUntil(Promise.reject(new Error("late failure")));
    await new Promise((settle) => setTimeout(settle));

    expect(context.env).toEqual({ SECRET: "from-process" });
    expect(context.clientAddress).toBeUndefined();
    expect(error).toHaveBeenCalledWith(expect.stringContaining('"hello"'), expect.objectContaining({ message: "late failure" }));
    error.mockRestore();
  });
});
