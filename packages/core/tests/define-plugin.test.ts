import { describe, it, expect, vi } from "vitest";
import { definePlugin } from "../src/plugin/define-plugin";
import { PluginValidationError } from "../src/plugin/errors";

describe("definePlugin", () => {
  it("accepts a static plugin object", () => {
    const factory = definePlugin({
      id: "static-plugin",
      buildStart() {},
    });

    const plugin = factory();
    expect(plugin.id).toBe("static-plugin");
    expect(typeof plugin.buildStart?.run).toBe("function");
  });

  it("allows overriding disabled on static plugin object", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const factory = definePlugin({
      id: "static-disabled-override",
      disabled: false,
      buildStart() {},
    });

    const plugin = factory({ disabled: true });
    expect(plugin.disabled).toBe(true);
    warnSpy.mockRestore();
  });

  it("wraps a factory and returns normalized plugin", () => {
    const factory = definePlugin(() => ({
      id: "test-plugin",
      transformOfm(ctx) {
        ctx.files = [];
      },
    }));

    const plugin = factory();
    expect(plugin.id).toBe("test-plugin");
    expect(plugin.transformOfm).toBeDefined();
    expect(typeof plugin.transformOfm?.run).toBe("function");
  });

  it("passes options through to the factory", () => {
    const factory = definePlugin<{ verbose: boolean }>((opts) => ({
      id: "opt-plugin",
      buildStart: {
        run() {},
        options: { fatal: opts?.verbose ?? false },
      },
    }));

    const plugin = factory({ verbose: true });
    expect(plugin.buildStart?.options?.fatal).toBe(true);
  });

  it("normalizes function shorthand hooks to object form", () => {
    const factory = definePlugin(() => ({
      id: "shorthand",
      discoverFiles(ctx) {
        ctx.files = [];
      },
      parseFrontmatter(ctx) {
        ctx.files = [];
      },
    }));

    const plugin = factory();
    expect(typeof plugin.discoverFiles?.run).toBe("function");
    expect(plugin.discoverFiles?.options).toEqual({});
    expect(typeof plugin.parseFrontmatter?.run).toBe("function");
    expect(plugin.parseFrontmatter?.options).toEqual({});
  });

  it("throws PluginValidationError when id is missing", () => {
    const factory = definePlugin(() => ({
      id: "",
      transformOfm(ctx) {
        ctx.files = [];
      },
    }));

    expect(() => factory()).toThrow(PluginValidationError);
  });

  it("throws PluginValidationError for invalid enforce value", () => {
    const factory = definePlugin(() => ({
      id: "bad-enforce",
      transformOfm: {
        run() {},
        options: { enforce: "middle" as "pre" },
      },
    }));

    expect(() => factory()).toThrow(PluginValidationError);
  });

  it("throws PluginValidationError for invalid parallel value", () => {
    const factory = definePlugin(() => ({
      id: "bad-parallel",
      emitArtifacts: {
        run() {},
        options: { parallel: "yes" as unknown as boolean },
      },
    }));

    expect(() => factory()).toThrow(PluginValidationError);
  });

  it("throws for invalid hook shape", () => {
    const factory = definePlugin(() => ({
      id: "bad-hook",
      transformOfm: { notRun: true } as never,
    }));

    expect(() => factory()).toThrow(PluginValidationError);
  });

  it("preserves disabled flag", () => {
    const factory = definePlugin(() => ({
      id: "disabled-plugin",
      disabled: true,
    }));

    const plugin = factory();
    expect(plugin.disabled).toBe(true);
  });

  it("preserves handleChange as normalized hook", () => {
    const factory = definePlugin(() => ({
      id: "change-plugin",
      handleChange(_event, _ctx) {},
    }));

    const plugin = factory();
    expect(typeof plugin.handleChange?.run).toBe("function");
    expect(plugin.handleChange?.options).toEqual({});
  });
});
