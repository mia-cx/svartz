import { describe, it, expect, vi } from "vitest";
import {
  normalizePlugin,
  isPluginEnabled,
  sortPluginsForStage,
} from "../src/plugin/utils";
import { PluginValidationError } from "../src/plugin/errors";
import type { SvartzPlugin, NormalizedSvartzPlugin } from "../src/plugin/types";

describe("normalizePlugin", () => {
  it("converts function shorthand to object form", () => {
    const plugin: SvartzPlugin = {
      id: "test",
      transformOfm(ctx) {
        ctx.files = [];
      },
    };
    const normalized = normalizePlugin(plugin);
    expect(typeof normalized.transformOfm?.run).toBe("function");
    expect(normalized.transformOfm?.options).toEqual({});
  });

  it("passes through object-form hooks unchanged", () => {
    const run = () => {};
    const plugin: SvartzPlugin = {
      id: "test",
      emitArtifacts: { run, options: { parallel: true, fatal: true } },
    };
    const normalized = normalizePlugin(plugin);
    expect(normalized.emitArtifacts?.run).toBe(run);
    expect(normalized.emitArtifacts?.options).toEqual({
      parallel: true,
      fatal: true,
    });
  });

  it("normalizes handleChange shorthand", () => {
    const plugin: SvartzPlugin = {
      id: "test",
      handleChange(_event, _ctx) {},
    };
    const normalized = normalizePlugin(plugin);
    expect(typeof normalized.handleChange?.run).toBe("function");
    expect(normalized.handleChange?.options).toEqual({});
  });

  it("throws on missing id", () => {
    expect(() => normalizePlugin({ id: "" })).toThrow(PluginValidationError);
  });

  it("throws on non-string id", () => {
    expect(() => normalizePlugin({ id: 42 as unknown as string })).toThrow(
      PluginValidationError,
    );
  });

  it("throws on invalid hook shape", () => {
    expect(() =>
      normalizePlugin({
        id: "bad",
        transformOfm: 42 as never,
      }),
    ).toThrow(PluginValidationError);
  });

  it("throws on invalid enforce value", () => {
    expect(() =>
      normalizePlugin({
        id: "bad",
        parseFrontmatter: {
          run() {},
          options: { enforce: "middle" as "pre" },
        },
      }),
    ).toThrow(PluginValidationError);
  });

  it("throws on non-boolean parallel", () => {
    expect(() =>
      normalizePlugin({
        id: "bad",
        emitArtifacts: {
          run() {},
          options: { parallel: 1 as unknown as boolean },
        },
      }),
    ).toThrow(PluginValidationError);
  });

  it("warns on unknown keys", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    normalizePlugin({ id: "test", foo: "bar" } as SvartzPlugin);
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('unknown key "foo"'),
    );
    spy.mockRestore();
  });

  it("warns when disabled plugin has hooks", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    normalizePlugin({
      id: "test",
      disabled: true,
      transformOfm: () => {},
    });
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("disabled but has hooks"),
    );
    spy.mockRestore();
  });

  it("leaves undefined hooks as undefined", () => {
    const normalized = normalizePlugin({ id: "minimal" });
    expect(normalized.buildStart).toBeUndefined();
    expect(normalized.transformOfm).toBeUndefined();
    expect(normalized.emitArtifacts).toBeUndefined();
  });
});

describe("isPluginEnabled", () => {
  it("returns true for plugin without disabled flag", () => {
    expect(isPluginEnabled({ id: "a" })).toBe(true);
  });

  it("returns true for explicitly enabled plugin", () => {
    expect(isPluginEnabled({ id: "a", disabled: false })).toBe(true);
  });

  it("returns false for disabled plugin", () => {
    expect(isPluginEnabled({ id: "a", disabled: true })).toBe(false);
  });
});

describe("sortPluginsForStage", () => {
  const makeNormalized = (
    id: string,
    stage: string,
    enforce?: "pre" | "post",
  ): NormalizedSvartzPlugin => ({
    id,
    [stage]: { run() {}, options: enforce ? { enforce } : {} },
  });

  it("sorts pre before default before post", () => {
    const plugins = [
      makeNormalized("c", "transformOfm", "post"),
      makeNormalized("a", "transformOfm", "pre"),
      makeNormalized("b", "transformOfm"),
    ];
    const sorted = sortPluginsForStage(plugins, "transformOfm");
    expect(sorted.map((p) => p.id)).toEqual(["a", "b", "c"]);
  });

  it("preserves config order within same tier", () => {
    const plugins = [
      makeNormalized("x", "transformOfm"),
      makeNormalized("y", "transformOfm"),
      makeNormalized("z", "transformOfm"),
    ];
    const sorted = sortPluginsForStage(plugins, "transformOfm");
    expect(sorted.map((p) => p.id)).toEqual(["x", "y", "z"]);
  });

  it("filters out plugins without the requested stage hook", () => {
    const plugins = [
      makeNormalized("a", "transformOfm"),
      makeNormalized("b", "emitArtifacts"),
      makeNormalized("c", "transformOfm", "post"),
    ];
    const sorted = sortPluginsForStage(plugins, "transformOfm");
    expect(sorted.map((p) => p.id)).toEqual(["a", "c"]);
  });

  it("returns empty for stage with no hooks", () => {
    const plugins = [makeNormalized("a", "transformOfm")];
    const sorted = sortPluginsForStage(plugins, "emitArtifacts");
    expect(sorted).toEqual([]);
  });

  it("handles mixed tiers with multiple plugins per tier", () => {
    const plugins = [
      makeNormalized("d1", "parseFrontmatter"),
      makeNormalized("pre1", "parseFrontmatter", "pre"),
      makeNormalized("d2", "parseFrontmatter"),
      makeNormalized("post1", "parseFrontmatter", "post"),
      makeNormalized("pre2", "parseFrontmatter", "pre"),
    ];
    const sorted = sortPluginsForStage(plugins, "parseFrontmatter");
    expect(sorted.map((p) => p.id)).toEqual([
      "pre1",
      "pre2",
      "d1",
      "d2",
      "post1",
    ]);
  });
});
