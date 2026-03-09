import { describe, it, expect } from "vitest";
import {
  createCorePlugins,
  CORE_PLUGIN_IDS,
} from "../src/index";

describe("createCorePlugins", () => {
  it("returns correct number of plugins", () => {
    const plugins = createCorePlugins();
    expect(plugins).toHaveLength(CORE_PLUGIN_IDS.length);
    expect(plugins).toHaveLength(13);
  });

  it("returns plugins in canonical order matching CORE_PLUGIN_IDS", () => {
    const plugins = createCorePlugins();
    const ids = plugins.map((p) => p.id);
    expect(ids).toEqual([...CORE_PLUGIN_IDS]);
  });

  it("all core plugins have fatal hooks", () => {
    const plugins = createCorePlugins();

    for (const plugin of plugins) {
      const hookName = CORE_PLUGIN_IDS.find((id) => {
        const p = plugins.find((pp) => pp.id === id);
        return p === plugin;
      });

      const hookKeys = Object.keys(plugin).filter(
        (k) =>
          k !== "id" &&
          k !== "disabled" &&
          plugin[k as keyof typeof plugin] != null,
      );

      for (const key of hookKeys) {
        const hook = plugin[key as keyof typeof plugin] as {
          options?: { fatal?: boolean };
        };
        if (hook?.options) {
          expect(
            hook.options.fatal,
            `${plugin.id}.${key} should be fatal`,
          ).toBe(true);
        }
      }
    }
  });

  it("all core plugins are enabled by default", () => {
    const plugins = createCorePlugins();
    for (const plugin of plugins) {
      expect(plugin.disabled).toBeUndefined();
    }
  });

  it("core:filter-unpublished enforces post", () => {
    const plugins = createCorePlugins();
    const filter = plugins.find((p) => p.id === "core:filter-unpublished");
    expect(filter?.filterUnpublished?.options?.enforce).toBe("post");
  });

  it("core:emit-artifacts runs post to flush final artifacts last", () => {
    const plugins = createCorePlugins();
    const emit = plugins.find((p) => p.id === "core:emit-artifacts");
    expect(emit?.emitArtifacts?.options?.enforce).toBe("post");
    expect(emit?.emitArtifacts?.options?.parallel).toBeUndefined();
  });

  it("attaches handleChange hooks to every core plugin", () => {
    const plugins = createCorePlugins();
    for (const plugin of plugins) {
      expect(plugin.handleChange, `${plugin.id} should define handleChange`).toBeDefined();
    }
  });

  it("clears parse caches when markdown changes are handled", () => {
    const plugins = createCorePlugins();
    const parseFrontmatter = plugins.find((plugin) => plugin.id === "core:parse-frontmatter");
    const ctx = {
      config: { path: "/vaults/docs" },
      files: [],
      artifacts: new Map(),
      meta: new Map([["sourceBodies", new Map()]]),
    };

    parseFrontmatter?.handleChange?.run(
      {
        type: "change",
        file: "/vaults/docs/daily.md",
        relativeFile: "daily.md",
      },
      ctx as never,
    );

    expect(ctx.meta.has("sourceBodies")).toBe(false);
    expect(ctx.meta.get("svartz:changedPlugins")).toEqual(new Set(["core:parse-frontmatter"]));
  });

  it("CORE_PLUGIN_IDS is readonly (as const)", () => {
    expect(CORE_PLUGIN_IDS.length).toBe(13);
    // TypeScript `as const` prevents mutation at compile-time
  });
});

describe("CORE_PLUGIN_IDS", () => {
  it("contains all expected IDs", () => {
    expect(CORE_PLUGIN_IDS).toContain("core:discover-files");
    expect(CORE_PLUGIN_IDS).toContain("core:parse-frontmatter");
    expect(CORE_PLUGIN_IDS).toContain("core:filter-unpublished");
    expect(CORE_PLUGIN_IDS).toContain("core:resolve-links");
    expect(CORE_PLUGIN_IDS).toContain("core:transform-ofm");
    expect(CORE_PLUGIN_IDS).toContain("core:transform-gfm");
    expect(CORE_PLUGIN_IDS).toContain("core:transform-toc");
    expect(CORE_PLUGIN_IDS).toContain("core:transform-description");
    expect(CORE_PLUGIN_IDS).toContain("core:transform-syntax");
    expect(CORE_PLUGIN_IDS).toContain("core:transform-latex");
    expect(CORE_PLUGIN_IDS).toContain("core:transform-embeds");
    expect(CORE_PLUGIN_IDS).toContain("core:index");
    expect(CORE_PLUGIN_IDS).toContain("core:emit-artifacts");
  });
});
