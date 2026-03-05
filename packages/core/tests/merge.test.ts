import { describe, it, expect, vi } from "vitest";
import { mergePlugins } from "../src/plugin/merge";
import type { SvartzPlugin } from "../src/plugin/types";

const makePlugin = (
  id: string,
  overrides?: Partial<SvartzPlugin>,
): SvartzPlugin => ({
  id,
  ...overrides,
});

describe("mergePlugins", () => {
  it("returns defaults when vault list is empty", () => {
    const defaults = [makePlugin("a"), makePlugin("b")];
    const result = mergePlugins(defaults, []);
    expect(result.map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("returns vault plugins when defaults is empty", () => {
    const vault = [makePlugin("x"), makePlugin("y")];
    const result = mergePlugins([], vault);
    expect(result.map((p) => p.id)).toEqual(["x", "y"]);
  });

  it("appends new vault plugins after defaults", () => {
    const defaults = [makePlugin("a")];
    const vault = [makePlugin("b")];
    const result = mergePlugins(defaults, vault);
    expect(result.map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("replaces default plugin in-place when vault has same id", () => {
    const defaultHook = () => {};
    const vaultHook = () => {};

    const defaults = [
      makePlugin("a", { transformOfm: defaultHook }),
      makePlugin("b"),
    ];
    const vault = [makePlugin("a", { transformOfm: vaultHook })];

    const result = mergePlugins(defaults, vault);
    expect(result.map((p) => p.id)).toEqual(["a", "b"]);
    expect(result[0]!.transformOfm).toBe(vaultHook);
  });

  it("removes disabled plugins from final output", () => {
    const defaults = [makePlugin("a"), makePlugin("b")];
    const vault = [makePlugin("a", { disabled: true })];
    const result = mergePlugins(defaults, vault);
    expect(result.map((p) => p.id)).toEqual(["b"]);
  });

  it("removes disabled vault-only plugins", () => {
    const defaults = [makePlugin("a")];
    const vault = [makePlugin("b", { disabled: true })];
    const result = mergePlugins(defaults, vault);
    expect(result.map((p) => p.id)).toEqual(["a"]);
  });

  it("handles duplicates within defaults (last wins)", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const first = makePlugin("a", { transformOfm: () => {} });
    const second = makePlugin("a", { emitArtifacts: () => {} });
    const result = mergePlugins([first, second], []);
    expect(result).toHaveLength(1);
    expect(result[0]!.emitArtifacts).toBeDefined();
    expect(result[0]!.transformOfm).toBeUndefined();
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('duplicate plugin id "a"'),
    );
    spy.mockRestore();
  });

  it("handles duplicates within vault list (last wins)", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const first = makePlugin("x", { transformOfm: () => {} });
    const second = makePlugin("x", { parseFrontmatter: () => {} });
    const result = mergePlugins([], [first, second]);
    expect(result).toHaveLength(1);
    expect(result[0]!.parseFrontmatter).toBeDefined();
    expect(result[0]!.transformOfm).toBeUndefined();
    spy.mockRestore();
  });

  it("preserves deterministic order: replaced keeps position, new appends", () => {
    const defaults = [makePlugin("a"), makePlugin("b"), makePlugin("c")];
    const vault = [makePlugin("d"), makePlugin("b", { disabled: false })];
    const result = mergePlugins(defaults, vault);
    expect(result.map((p) => p.id)).toEqual(["a", "b", "c", "d"]);
  });
});
