import { describe, expect, it, vi } from "vitest";
import { createServerHandle, type ServerContext, type ServerHandleEvent, type ServerRegistry } from "../src/plugin/server";

const vault = { id: "wiki", mountPath: "", site: { title: "Wiki" } };

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
  const factory = (id: string) => vi.fn((options: unknown) => (request: Request, context: ServerContext) => {
    const { pathname } = new URL(request.url);
    seen.push({ id, pathname, context });
    return pathname.endsWith("/missing/") ? undefined : Response.json({ id, options });
  });
  const hello = factory("hello");
  const helloWorld = factory("hello-world");
  const registry: ServerRegistry = {
    basePath,
    vault,
    servers: [
      { id: "hello", load: async () => ({ default: hello }), options: { greeting: "hi" } },
      { id: "hello-world", load: async () => ({ default: helloWorld }) },
    ],
  };
  const resolve = vi.fn(async () => new Response("page"));
  const handle = createServerHandle(registry, { privateEnv, building, dev });
  return { handle, resolve, seen, hello };
}

describe("server plugin routing", () => {
  it("sends requests under /_svartz/<id>/ to that plugin only, with its options", async () => {
    const { handle, resolve, seen } = setup();

    const response = await handle({ event: event("/_svartz/hello/ping/"), resolve });

    expect(await response.json()).toEqual({ id: "hello", options: { greeting: "hi" } });
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
