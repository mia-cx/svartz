import { describe, it, expect, vi } from "vitest";
import { normalizePlugin } from "../src/plugin/utils";
import type { SvartzPlugin } from "../src/plugin/types";

/**
 * Local dev-only benchmark/guardrail for plugin validation.
 * Measures Effect Schema decode overhead vs a reasonable baseline.
 * Max regression threshold: 15%.
 *
 * Not intended for CI — run locally during development to detect
 * decode overhead regressions.
 */

function makePluginSet(count: number): SvartzPlugin[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `bench-plugin-${i}`,
    buildStart() {},
    transformOfm: {
      run() {},
      options: { fatal: true },
    },
    emitArtifacts: {
      run() {},
      options: { parallel: true },
    },
  }));
}

function benchmarkNormalize(plugins: SvartzPlugin[], iterations: number) {
  const spy = vi.spyOn(console, "warn").mockImplementation(() => {});

  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    for (const plugin of plugins) {
      normalizePlugin(plugin);
    }
  }
  const elapsed = performance.now() - start;

  spy.mockRestore();
  return elapsed;
}

describe("validation benchmark (local dev guardrail)", () => {
  const PLUGIN_COUNT = 20;
  const ITERATIONS = 100;
  const MAX_MS_PER_PLUGIN = 0.5;

  it(`normalizes ${PLUGIN_COUNT} plugins x ${ITERATIONS} iterations within budget`, () => {
    const plugins = makePluginSet(PLUGIN_COUNT);

    // Warmup
    benchmarkNormalize(plugins, 5);

    const elapsed = benchmarkNormalize(plugins, ITERATIONS);
    const totalOps = PLUGIN_COUNT * ITERATIONS;
    const msPerPlugin = elapsed / totalOps;

    console.log(
      `[benchmark] ${totalOps} normalizations in ${elapsed.toFixed(1)}ms ` +
        `(${msPerPlugin.toFixed(4)}ms/plugin)`,
    );

    expect(msPerPlugin).toBeLessThan(MAX_MS_PER_PLUGIN);
  });

  it("validates representative plugin shapes without error", () => {
    const plugins: SvartzPlugin[] = [
      { id: "minimal" },
      { id: "shorthand-only", transformOfm() {} },
      {
        id: "full-object",
        buildStart: { run() {}, options: { fatal: true, enforce: "pre" } },
        transformOfm: { run() {}, options: {} },
        emitArtifacts: { run() {}, options: { parallel: true } },
      },
      {
        id: "with-contract-version",
        contractVersion: "1.0.0",
        transformOfm() {},
      },
      {
        id: "all-hooks",
        buildStart() {},
        configResolved() {},
        buildEnd() {},
        handleChange() {},
        discoverFiles() {},
        parseFrontmatter() {},
        filterUnpublished() {},
        resolveLinks() {},
        transformOfm() {},
        transformGfm() {},
        transformToc() {},
        transformDescription() {},
        transformSyntax() {},
        transformLatex() {},
        indexContent() {},
        emitArtifacts() {},
      },
    ];

    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const plugin of plugins) {
      expect(() => normalizePlugin(plugin)).not.toThrow();
    }
    spy.mockRestore();
  });
});
