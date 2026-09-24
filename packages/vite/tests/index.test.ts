import { EventEmitter } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
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
    vi.stubEnv("SVARTZ_THEME_SOURCE_PATH", "/tmp/theme/src/lib/index.ts");
    try {
      const plugin = svartz({ config: testConfig, env: {}, mode: "test" });
      const viteConfig = await plugin.config?.call({} as never, { command: "serve", mode: "test" } as never);
      plugin.configResolved?.call({} as never, { root: process.cwd(), mode: "test" } as never);

      expect(viteConfig?.resolve?.alias).toMatchObject({
        "@svartz/theme-docs": "/tmp/theme/src/lib/index.ts",
      });
      expect(plugin.load?.call({} as never, RESOLVED_THEME_VIRTUAL_ID))
        .toBe("theme-source:@svartz/theme-docs");
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

    const dispose = plugin.configureServer?.(server as never);
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

    dispose?.();
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
