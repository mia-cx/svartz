import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Artifact, ResolvedConfig } from "@svartz/core";
import {
  RESOLVED_ARTIFACTS_VIRTUAL_ID,
  RESOLVED_THEME_VIRTUAL_ID,
} from "../src/virtual-modules";
import { svartz } from "../src/index";

const {
  createThemeVirtualModuleSourceMock,
  loadThemeModuleMock,
  resolveRuntimePluginsMock,
  runStagesMock,
} = vi.hoisted(() => ({
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
  path: "/vaults/docs",
  outDir: "/workspace/.svartz/vaults/docs/dist",
  include: [],
  exclude: [],
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
  plugins: [],
};

describe("@svartz/vite plugin", () => {
  beforeEach(() => {
    vi.clearAllMocks();

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
          path: "/workspace/.svartz/vaults/docs/artifacts/pages/index.svelte",
          type: "svelte",
          pluginId: "core:emit-artifacts",
          noteSlug: "index",
          contents: "<h1>Home</h1>",
        });
        ctx.artifacts.set("index.ts", {
          key: "index.ts",
          path: "/workspace/.svartz/vaults/docs/artifacts/index.ts",
          type: "ts",
          pluginId: "core:emit-artifacts",
          contents: "export const index = {};",
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
    );
    expect(resolveRuntimePluginsMock).toHaveBeenCalled();
    expect(runStagesMock).toHaveBeenCalled();
    expect(artifactsSource).toContain("pages/index.svelte");
    expect(artifactsSource).toContain(
      'import { index, graph, backlinks, search } from "/workspace/.svartz/vaults/docs/artifacts/index.ts";',
    );
    expect(themeSource).toBe("theme-source:@svartz/theme-docs");
  });
});
