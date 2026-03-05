import { describe, it, expect, vi } from "vitest";
import { normalizePlugin } from "../src/plugin/utils";
import { PluginValidationError } from "../src/plugin/errors";
import type { SvartzPlugin } from "../src/plugin/types";

/**
 * Parity tests: verify that the Effect Schema validation path
 * produces identical errors, warnings, and normalization output
 * compared to the legacy manual validation path.
 */

describe("schema parity: error classes and tags", () => {
  it("missing id throws PluginValidationError with correct _tag", () => {
    try {
      normalizePlugin({ id: "" });
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(PluginValidationError);
      expect((e as PluginValidationError)._tag).toBe("PluginValidationError");
      expect((e as PluginValidationError).message).toBe(
        "Plugin id must be a non-empty string",
      );
    }
  });

  it("non-string id throws PluginValidationError", () => {
    try {
      normalizePlugin({ id: 42 as unknown as string });
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(PluginValidationError);
      expect((e as PluginValidationError).message).toBe(
        "Plugin id must be a non-empty string",
      );
    }
  });

  it("invalid hook shape throws PluginValidationError with hook name", () => {
    try {
      normalizePlugin({ id: "test", transformOfm: 42 as never });
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(PluginValidationError);
      expect((e as PluginValidationError).message).toContain("transformOfm");
      expect((e as PluginValidationError).message).toContain(
        "must be a function or { run, options? }",
      );
    }
  });

  it("invalid enforce value throws PluginValidationError with hook name", () => {
    try {
      normalizePlugin({
        id: "test",
        parseFrontmatter: {
          run() {},
          options: { enforce: "middle" as "pre" },
        },
      });
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(PluginValidationError);
      expect((e as PluginValidationError).message).toContain(
        "parseFrontmatter",
      );
      expect((e as PluginValidationError).message).toContain(
        "invalid enforce value",
      );
    }
  });

  it("invalid parallel value throws PluginValidationError with hook name", () => {
    try {
      normalizePlugin({
        id: "test",
        emitArtifacts: {
          run() {},
          options: { parallel: "yes" as unknown as boolean },
        },
      });
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(PluginValidationError);
      expect((e as PluginValidationError).message).toContain("emitArtifacts");
      expect((e as PluginValidationError).message).toContain(
        "invalid parallel value",
      );
    }
  });
});

describe("schema parity: warning behavior", () => {
  it("unknown keys produce console.warn with exact format", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    normalizePlugin({ id: "test", foo: "bar" } as SvartzPlugin);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(
      '[svartz:plugin] plugin "test" has unknown key "foo"',
    );
    spy.mockRestore();
  });

  it("multiple unknown keys produce one warning each", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    normalizePlugin({
      id: "test",
      foo: "bar",
      baz: 42,
    } as SvartzPlugin);
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });

  it("disabled-with-hooks produces console.warn with exact format", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    normalizePlugin({
      id: "test",
      disabled: true,
      transformOfm: () => {},
    });
    expect(spy).toHaveBeenCalledWith(
      '[svartz:plugin] plugin "test" is disabled but has hooks defined; hooks will be ignored',
    );
    spy.mockRestore();
  });
});

describe("schema parity: normalization output", () => {
  it("function shorthand becomes { run, options: {} }", () => {
    const fn = () => {};
    const normalized = normalizePlugin({
      id: "test",
      transformOfm: fn,
    });
    expect(normalized.transformOfm).toEqual({
      run: fn,
      options: {},
    });
  });

  it("object form passes through unchanged", () => {
    const run = () => {};
    const options = { fatal: true, enforce: "pre" as const };
    const normalized = normalizePlugin({
      id: "test",
      transformOfm: { run, options },
    });
    expect(normalized.transformOfm?.run).toBe(run);
    expect(normalized.transformOfm?.options).toBe(options);
  });

  it("undefined hooks remain undefined", () => {
    const normalized = normalizePlugin({ id: "minimal" });
    expect(normalized.buildStart).toBeUndefined();
    expect(normalized.transformOfm).toBeUndefined();
    expect(normalized.emitArtifacts).toBeUndefined();
    expect(normalized.handleChange).toBeUndefined();
  });

  it("contractVersion is preserved when present", () => {
    const normalized = normalizePlugin({
      id: "test",
      contractVersion: "1.0.0",
    });
    expect(normalized.contractVersion).toBe("1.0.0");
  });

  it("disabled flag is preserved", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const normalized = normalizePlugin({
      id: "test",
      disabled: true,
    });
    expect(normalized.disabled).toBe(true);
    spy.mockRestore();
  });
});
