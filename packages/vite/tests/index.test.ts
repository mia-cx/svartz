import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Artifact, ResolvedConfig } from "@svartz/core";
import {
  RESOLVED_ARTIFACTS_VIRTUAL_ID,
  RESOLVED_THEME_VIRTUAL_ID,
} from "../src/virtual-modules";
import { svartz } from "../src/index";

const {
  executeHandleChangeMock,
  createThemeVirtualModuleSourceMock,
  loadThemeModuleMock,
  resolveRuntimePluginsMock,
  runStagesMock,
} = vi.hoisted(() => ({
  executeHandleChangeMock: vi.fn(),
  createThemeVirtualModuleSourceMock: vi.fn(),
  loadThemeModuleMock: vi.fn(),
  resolveRuntimePluginsMock: vi.fn(),
  runStagesMock: vi.fn(),
}));

vi.mock("@svartz/core", async () => {
  const actual = await vi.importActual<typeof import("@svartz/core")>(
    "@svartz/core",
  );

  return {
    ...actual,
    executeHandleChange: executeHandleChangeMock,
    runStages: runStagesMock,
  };
});

vi.mock("../src/theme-resolver", async () => {
  const actual = await vi.importActual<typeof import("../src/theme-resolver")>(
    "../src/theme-resolver",
  );

  return {
    ...actual,
    createThemeVirtualModuleSource: createThemeVirtualModuleSourceMock,
    loadThemeModule: loadThemeModuleMock,
  };
});

vi.mock("../src/plugins", async () => {
  const actual = await vi.importActual<typeof import("../src/plugins")>(
    "../src/plugins",
  );

  return {
    ...actual,
    resolveRuntimePlugins: resolveRuntimePluginsMock,
  };
});

const testConfig: ResolvedConfig = {
  version: "0.0.1",
  id: "docs",
  path: "/tmp/svartz-tests/vaults/docs",
  outDir: "/tmp/svartz-tests/.svartz/vaults/docs/dist",
  mountPath: "",
  include: [],
  exclude: [],
  publicationMode: "exclusion",
  linkResolution: "closest",
  theme: { base: "@svartz/theme-docs" },
  frontmatter: {
    titleField: "title",
    descriptionField: "description",
    tagsField: "tags",
    aliasesField: "aliases",
    createdAtField: "created_at",
    updatedAtField: "updated_at",
    publishedField: "published",
  },
  target: { type: "static" },
  site: { title: "Docs", favicon: "/tmp/svartz-tests/icon.svg" },
  discovery: {
    feed: { enabled: false, limit: 10, content: "summary", sort: "published" },
    sitemap: { enabled: false },
    socialImages: { enabled: false },
    favicon: { enabled: true },
    dateSources: ["frontmatter", "git", "filesystem"],
  },
  plugins: [],
};

describe("@svartz/vite plugin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();

    loadThemeModuleMock.mockResolvedValue({
      id: "theme-docs",
      version: "0.0.1",
      contractVersion: "1.0.0",
      layouts: {
        defaultPage: { default: {} },
        notePage: { default: {} },
      },
      routes: [{ id: "home", pattern: "/" }],
    });
    resolveRuntimePluginsMock.mockReturnValue([]);
    executeHandleChangeMock.mockResolvedValue({
      errors: [],
      fatalError: undefined,
    });
    createThemeVirtualModuleSourceMock.mockImplementation(
      (themeModuleId: string) => `theme-source:${themeModuleId}`,
    );
    runStagesMock.mockImplementation(
      async (
        _plugins: unknown,
        ctx: { artifacts: Map<string, Artifact> },
      ) => {
        ctx.artifacts.set("pages/index.svelte", {
          key: "pages/index.svelte",
          path: "/tmp/svartz-tests/.svartz/vaults/docs/artifacts/pages/index.svelte",
          type: "svelte",
          pluginId: "core:emit-artifacts",
          noteSlug: "index",
          contents: "<h1>Home</h1>",
        });
        ctx.artifacts.set("index.ts", {
          key: "index.ts",
          path: "/tmp/svartz-tests/.svartz/vaults/docs/artifacts/index.ts",
          type: "ts",
          pluginId: "core:emit-artifacts",
          contents: "export const index = {};",
        });
        ctx.artifacts.set("assets/media/photo.png", {
          key: "assets/media/photo.png",
          path: join("/tmp/svartz-tests/.svartz/vaults/docs/artifacts", "assets/media/photo.png"),
          type: "asset",
          pluginId: "core:emit-artifacts",
          contents: new Uint8Array([1, 2, 3]),
        });
      },
    );
  });

  it("runs the pipeline before serving the artifacts virtual module", async () => {
    const plugin = svartz({
      config: testConfig,
      env: {},
      mode: "test",
    });

    expect(resolveRuntimePluginsMock).not.toHaveBeenCalled();

    await plugin.buildStart?.call({} as never);

    const artifactsSource = plugin.load?.call(
      {} as never,
      RESOLVED_ARTIFACTS_VIRTUAL_ID,
    );
    const themeSource = plugin.load?.call(
      {} as never,
      RESOLVED_THEME_VIRTUAL_ID,
    );

    expect(loadThemeModuleMock).toHaveBeenCalledWith(
      expect.any(Function),
      testConfig,
      process.cwd(),
      {},
    );
    expect(resolveRuntimePluginsMock).toHaveBeenCalled();
    expect(runStagesMock).toHaveBeenCalled();
    expect(artifactsSource).toContain("pages/index.svelte");
    expect(artifactsSource).toContain(
      'import { index, graph, backlinks, search, tags, folders, routes, assets } from "/tmp/svartz-tests/.svartz/vaults/docs/artifacts/index.ts";',
    );
    expect(themeSource).toBe("theme-source:@svartz/theme-docs");
  });

  it("imports the source theme through its Vite alias when configured", async () => {
    vi.stubEnv("SVARTZ_THEME_SOURCES", JSON.stringify({
      "@svartz/theme-docs": "/tmp/theme/src/lib/index.ts",
      "@svartz/theme-other-vault": "/tmp/other/src/lib/index.ts",
    }));
    try {
      const plugin = svartz({ config: testConfig, env: {}, mode: "test" });
      const viteConfig = await plugin.config?.call({} as never, { command: "serve", mode: "test" } as never);
      plugin.configResolved?.call({} as never, { root: process.cwd(), mode: "test" } as never);

      const aliases = viteConfig?.resolve?.alias as { find: string | RegExp; replacement: string }[];
      const resolveAlias = (id: string) =>
        aliases.find(({ find }) => (typeof find === "string" ? id === find || id.startsWith(`${find}/`) : find.test(id)))?.replacement;
      expect(resolveAlias("@svartz/theme-docs")).toBe("/tmp/theme/src/lib/index.ts");
      // Another listed theme's subpath import must reach the package, not the source entry.
      expect(resolveAlias("@svartz/theme-docs/runtime")).toBeUndefined();
      expect(resolveAlias("@svartz/theme-other-vault")).toBeUndefined();
      expect(plugin.load?.call({} as never, RESOLVED_THEME_VIRTUAL_ID))
        .toBe("theme-source:@svartz/theme-docs");
      await plugin.buildStart?.call({} as never);
      expect(loadThemeModuleMock).toHaveBeenCalledWith(
        expect.any(Function), testConfig, process.cwd(), { "@svartz/theme-docs": "/tmp/theme/src/lib/index.ts" },
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("rebuilds and triggers a full reload when a vault file changes", async () => {
    vi.useFakeTimers();

    const plugin = svartz({
      config: testConfig,
      env: {},
      mode: "test",
    });

    await plugin.buildStart?.call({} as never);

    const watcher = new EventEmitter() as EventEmitter & {
      add: ReturnType<typeof vi.fn>;
    };
    watcher.add = vi.fn();

    const server = {
      watcher,
      close: vi.fn(async () => {}),
      middlewares: { use: vi.fn() },
      ws: { send: vi.fn() },
      moduleGraph: {
        getModulesByFile: vi.fn().mockReturnValue(new Set([{ id: "module" }])),
        invalidateModule: vi.fn(),
      },
      config: {
        logger: {
          warn: vi.fn(),
          error: vi.fn(),
        },
      },
    };

    // Vite calls a function returned from configureServer straight away, as its post-middleware hook.
    const postHook = plugin.configureServer?.(server as never);
    if (typeof postHook === "function") postHook();
    expect(watcher.add).toHaveBeenCalledWith(testConfig.path);
    expect(watcher.add).toHaveBeenCalledWith(testConfig.site.favicon);

    await vi.advanceTimersByTimeAsync(300);
    watcher.emit("change", "/tmp/svartz-tests/vaults/docs/note.md");
    await vi.advanceTimersByTimeAsync(100);

    expect(executeHandleChangeMock).toHaveBeenCalledWith(
      [],
      expect.objectContaining({
        type: "change",
        file: "/tmp/svartz-tests/vaults/docs/note.md",
        relativeFile: "note.md",
      }),
      expect.objectContaining({
        config: testConfig,
      }),
    );
    expect(runStagesMock).toHaveBeenCalledTimes(2);
    await vi.waitFor(() => {
      expect(server.ws.send).toHaveBeenCalledWith({ type: "full-reload" });
    });
    expect(server.moduleGraph.invalidateModule).toHaveBeenCalled();

    watcher.emit("change", testConfig.site.favicon);
    await vi.advanceTimersByTimeAsync(100);
    expect(runStagesMock).toHaveBeenCalledTimes(3);
  });

  // Proves a host static-file event in the same debounce window doesn't displace a vault change, whose plugin hooks
  // must still run: every rebuild rereads the host's routes anyway.
  it("keeps a pending vault change when a host static file changes right after it", async () => {
    vi.useFakeTimers();
    const plugin = svartz({ config: { ...testConfig, target: { type: "host" } } as ResolvedConfig, env: {}, mode: "test" });
    await plugin.buildStart?.call({} as never);
    const server = devServer();
    const postHook = plugin.configureServer?.(server as never);
    if (typeof postHook === "function") postHook();

    await vi.advanceTimersByTimeAsync(300);
    server.watcher.emit("change", "/tmp/svartz-tests/vaults/docs/note.md");
    server.watcher.emit("add", join(process.cwd(), "static", "robots.txt"));
    await vi.advanceTimersByTimeAsync(100);

    // A host rebuild reads the real static folder first, so the hook runs after that I/O.
    await vi.waitFor(() => expect(executeHandleChangeMock).toHaveBeenCalledWith(
      [], expect.objectContaining({ relativeFile: "note.md" }), expect.anything(),
    ));
  });

  const devServer = (watcher = Object.assign(new EventEmitter(), { add: vi.fn() })) => ({
    watcher,
    // Middleware mode: no HTTP server to listen on.
    httpServer: null,
    close: vi.fn(async () => {}),
    middlewares: { use: vi.fn() },
    ws: { send: vi.fn() },
    moduleGraph: { getModulesByFile: vi.fn().mockReturnValue(new Set()), invalidateModule: vi.fn() },
    config: { logger: { warn: vi.fn(), error: vi.fn() } },
  });

  it("stops watching the vault and drops a pending rebuild when the dev server closes", async () => {
    vi.useFakeTimers();
    const plugin = svartz({ config: testConfig, env: {}, mode: "test" });
    await plugin.buildStart?.call({} as never);
    runStagesMock.mockClear();
    const server = devServer();
    const close = server.close;
    expect(plugin.configureServer?.(server as never)).toBeUndefined();
    for (const event of ["add", "change", "unlink"]) expect(server.watcher.listenerCount(event)).toBe(1);

    await vi.advanceTimersByTimeAsync(300);
    server.watcher.emit("change", "/tmp/svartz-tests/vaults/docs/note.md");
    await server.close();
    await vi.advanceTimersByTimeAsync(100);

    expect(close).toHaveBeenCalled();
    for (const event of ["add", "change", "unlink"]) expect(server.watcher.listenerCount(event)).toBe(0);
    expect(runStagesMock).not.toHaveBeenCalled();
  });

  it("releases Cloudflare dev bindings when a middleware-mode server closes", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "svartz-dev-bindings-"));
    try {
      await writeFile(join(projectRoot, "wrangler.json"), "{}");
      const plugin = svartz({ config: { ...testConfig, target: { type: "cloudflare-workers" } } as ResolvedConfig, env: {}, mode: "test", projectRoot });
      await plugin.buildStart?.call({} as never);
      const server = devServer();
      const slot = globalThis as { [key: symbol]: unknown };
      const bindings = Symbol.for("svartz.devBindings");

      plugin.configureServer?.(server as never);
      expect(slot[bindings]).toBeTypeOf("function");
      await server.close();

      expect(slot[bindings]).toBeUndefined();
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  // Proves a server that reuses the plugin never replays a change queued for one that closed first.
  it("drops a closed server's queued change", async () => {
    vi.useFakeTimers();
    const plugin = svartz({ config: { ...testConfig, target: { type: "host" } } as ResolvedConfig, env: {}, mode: "test" });
    await plugin.buildStart?.call({} as never);
    const previous = devServer();
    plugin.configureServer?.(previous as never);
    await vi.advanceTimersByTimeAsync(300);
    previous.watcher.emit("change", "/tmp/svartz-tests/vaults/docs/note.md");
    await previous.close();

    const next = devServer();
    plugin.configureServer?.(next as never);
    await vi.advanceTimersByTimeAsync(300);
    next.watcher.emit("add", join(process.cwd(), "static", "robots.txt"));
    await vi.advanceTimersByTimeAsync(100);
    await vi.waitFor(() => expect(next.ws.send).toHaveBeenCalledWith({ type: "full-reload" }));

    expect(executeHandleChangeMock).not.toHaveBeenCalled();
  });

  it("keeps a restarted server watching when the old one closes", async () => {
    vi.useFakeTimers();
    const plugin = svartz({ config: testConfig, env: {}, mode: "test" });
    await plugin.buildStart?.call({} as never);
    runStagesMock.mockClear();
    // Vite configures the replacement before closing the old server, reusing inline plugin instances.
    const previous = devServer();
    const next = devServer();
    plugin.configureServer?.(previous as never);
    plugin.configureServer?.(next as never);
    await previous.close();
    expect(previous.watcher.listenerCount("change")).toBe(0);
    expect(next.watcher.listenerCount("change")).toBe(1);

    await vi.advanceTimersByTimeAsync(300);
    next.watcher.emit("change", "/tmp/svartz-tests/vaults/docs/note.md");
    await vi.advanceTimersByTimeAsync(100);
    await vi.waitFor(() => expect(next.ws.send).toHaveBeenCalledWith({ type: "full-reload" }));
  });

  it("emits public assets into the client bundle for any SvelteKit adapter", async () => {
    const plugin = svartz({ config: testConfig, env: {}, mode: "test" });
    await plugin.buildStart?.call({} as never);
    const emitFile = vi.fn();

    plugin.generateBundle?.call({ environment: { name: "client" }, emitFile } as never, {} as never, {} as never, false);
    expect(emitFile).toHaveBeenCalledWith({
      type: "asset",
      fileName: "media/photo.png",
      source: new Uint8Array([1, 2, 3]),
    });

    emitFile.mockClear();
    plugin.generateBundle?.call({ environment: { name: "server" }, emitFile } as never, {} as never, {} as never, false);
    expect(emitFile).not.toHaveBeenCalled();
  });

  it("hands assets from SvelteKit's server build to its shared client output", async () => {
    const plugin = svartz({ config: testConfig, env: {}, mode: "test" });
    await plugin.buildStart?.call({} as never);
    const root = await mkdtemp(join(tmpdir(), "svartz-kit-assets-"));
    try {
      await plugin.writeBundle?.call(
        { environment: { name: "ssr" } } as never,
        { dir: join(root, "output/server") } as never,
        {} as never,
      );
      expect(await readFile(join(root, "output/client/media/photo.png"))).toEqual(Buffer.from([1, 2, 3]));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("serves only emitted assets under the dev base path", async () => {
    const plugin = svartz({ config: testConfig, env: {}, mode: "test" });
    await plugin.buildStart?.call({} as never);
    const use = vi.fn();
    const server = {
      watcher: Object.assign(new EventEmitter(), { add: vi.fn() }),
      close: vi.fn(async () => {}),
      middlewares: { use },
      ws: { send: vi.fn() },
      moduleGraph: { getModulesByFile: vi.fn() },
      config: { base: "/blog/", logger: { warn: vi.fn(), error: vi.fn() } },
    };
    const dispose = plugin.configureServer?.(server as never);
    const middleware = use.mock.calls[0]![0] as (request: { method: string; url: string }, response: { setHeader: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> }, next: ReturnType<typeof vi.fn>) => void;
    const response = { setHeader: vi.fn(), end: vi.fn() };
    const next = vi.fn();

    middleware({ method: "GET", url: "/blog/media/photo.png" }, response, next);
    expect(response.setHeader).toHaveBeenCalledWith("Content-Type", "image/png");
    expect(response.end).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]));

    middleware({ method: "GET", url: "/blog/media/private.png" }, response, next);
    middleware({ method: "GET", url: "/media/photo.png" }, response, next);
    expect(next).toHaveBeenCalledTimes(2);
    dispose?.();
  });

  it("hands hooks the build's final plugins, which the config's list lacks when a theme preset adds some", async () => {
    const preset = { id: "theme:guestbook" };
    resolveRuntimePluginsMock.mockReturnValue([preset]);
    const plugin = svartz({ config: testConfig, env: {}, mode: "test" });

    await plugin.buildStart?.call({} as never);

    expect(runStagesMock.mock.calls[0]![1]).toMatchObject({ plugins: [preset] });
  });

  it("drops an unused browser resource on the next pipeline run", async () => {
    let run = 0;
    runStagesMock.mockImplementation(async (_plugins: unknown, ctx: { compiler?: { browserResources: Map<string, { id: string; kind: "css"; importId: string }> } }) => {
      if (run++ === 0) {
        ctx.compiler = {
          browserResources: new Map([["math", { id: "math", kind: "css", importId: "/math.css" }]]),
        };
      }
    });
    const plugin = svartz({ config: testConfig, env: {}, mode: "test" });

    await plugin.buildStart?.call({} as never);
    expect(plugin.load?.call({} as never, RESOLVED_ARTIFACTS_VIRTUAL_ID)).toContain('import "/math.css";');

    await plugin.buildStart?.call({} as never);
    expect(plugin.load?.call({} as never, RESOLVED_ARTIFACTS_VIRTUAL_ID)).not.toContain("math.css");
  });
});

describe("@svartz/vite version snapshots", () => {
  let root: string;
  beforeEach(async () => {
    vi.clearAllMocks();
    root = await mkdtemp(join(tmpdir(), "svartz-snapshot-"));
    loadThemeModuleMock.mockResolvedValue({ id: "theme-docs", version: "0.0.1", contractVersion: "1.0.0", layouts: {}, routes: [] });
    resolveRuntimePluginsMock.mockReturnValue([]);
    createThemeVirtualModuleSourceMock.mockReturnValue("theme-source");
  });

  /** A snapshot vault in `root`, whose pipeline publishes `asset` (a path below `assets/`) and a page at `/pets/`. */
  const snapshotConfig = (overrides: Partial<ResolvedConfig> = {}): ResolvedConfig => ({
    ...testConfig, path: join(root, "vault"), outDir: join(root, "build/dist"), site: { title: "Docs" }, ...overrides,
  });
  function publishing(asset = "assets/logo.png") {
    runStagesMock.mockImplementation(async (_plugins: unknown, ctx: { artifacts: Map<string, Artifact>; index?: unknown }) => {
      const path = join(root, "build/artifacts", asset);
      await mkdir(join(path, ".."), { recursive: true });
      await writeFile(path, "png");
      ctx.artifacts.set(asset, { key: asset, path, type: "asset", pluginId: "test", contents: new Uint8Array([1]) });
      ctx.index = { entries: [], routes: { all: ["/pets/"], redirects: {} } };
    });
  }
  /** Builds the snapshot once per call, as a fresh CLI build would, answering how many times its pipeline ran in all. */
  async function build(config: ResolvedConfig, options: { nestedMounts?: string[]; root?: string } = {}) {
    // Themes resolve from this package, wherever the host app's root is.
    const plugin = svartz({ config, env: {}, mode: "test", projectRoot: process.cwd(), snapshot: "c0ffee:docs/", nestedMounts: options.nestedMounts });
    if (options.root) await plugin.configResolved?.call({} as never, { root: options.root, mode: "test", plugins: [], define: {} } as never);
    await plugin.buildStart?.call({} as never);
    return runStagesMock.mock.calls.length;
  }

  // Proves an unchanged snapshot skips its pipeline on the next build.
  it("reuses an unchanged snapshot's build", async () => {
    publishing();
    expect(await build(snapshotConfig())).toBe(1);
    expect(await build(snapshotConfig())).toBe(1);
  });

  // Proves a rotated password re-encrypts: a key can't hold the password, so a vault with password groups isn't cached.
  it("builds a vault with password groups every time", async () => {
    publishing();
    const config = snapshotConfig({ passwordGroups: { members: { env: "SVARTZ_TEST_PASSWORD" } } });
    expect(await build(config)).toBe(1);
    expect(await build(config)).toBe(2);
  });

  // Proves a build that bypasses the cache drops the entry whose files it rewrote, so the next cacheable build runs again.
  it("forgets a cached build that a build with password groups rewrote", async () => {
    publishing();
    expect(await build(snapshotConfig())).toBe(1);
    expect(await build(snapshotConfig({ passwordGroups: { members: { env: "SVARTZ_TEST_PASSWORD" } } }))).toBe(2);
    expect(await build(snapshotConfig())).toBe(3);
  });

  // Proves editing a file a plugin reads, such as a bibliography outside the vault, builds the snapshot again.
  it("builds again when a file a plugin reads changes", async () => {
    publishing();
    const bibliography = join(root, "refs.bib");
    await writeFile(bibliography, "@book{a}");
    resolveRuntimePluginsMock.mockReturnValue([{ id: "citations", reads: [bibliography] }]);
    expect(await build(snapshotConfig())).toBe(1);
    await writeFile(bibliography, "@book{b}");
    expect(await build(snapshotConfig())).toBe(2);
  });

  // Proves a host page added where a snapshot note was builds the snapshot again, so routes allocate as a clean build's.
  it("builds a host snapshot again when the host's routes change", async () => {
    publishing();
    const config = snapshotConfig({ target: { type: "host" }, mountPath: "/v1" });
    expect(await build(config, { root })).toBe(1);
    await mkdir(join(root, "src/routes/v1/pets"), { recursive: true });
    await writeFile(join(root, "src/routes/v1/pets/+page.svelte"), "<h1>Pets</h1>");
    expect(await build(config, { root })).toBe(2);
  });

  // Proves the latest version can't publish a public file where one of its versions serves its own.
  it.each([
    ["below a version's mount", "assets/v1/logo.png", "/v1/logo.png"],
    // Static output needs `v1` to be the folder that holds the version's pages.
    ["at a version's mount", "assets/v1", "/v1"],
  ])("refuses a public file %s", async (_case, asset, path) => {
    publishing(asset);
    await expect(build(snapshotConfig(), { nestedMounts: ["/v1"] })).rejects.toThrow(`publishes ${path}, where version /v1/ is served`);
  });
});
