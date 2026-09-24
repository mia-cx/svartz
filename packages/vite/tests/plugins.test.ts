import { describe, expect, it } from "vitest";
import { runStages, type PluginContext, type ResolvedConfig, type SvartzPlugin, type SvartzTheme } from "@svartz/core";
import { resolveRuntimePlugins } from "../src/plugins";

function config(plugins: SvartzPlugin[] = []): ResolvedConfig {
  return { plugins } as unknown as ResolvedConfig;
}

describe("runtime plugin requirements", () => {
  it("allows an optional built-in transformer to be disabled", () => {
    const plugins = resolveRuntimePlugins(config([
      { id: "core:transform-latex", disabled: true },
      { id: "core:transform-syntax", disabled: true },
    ]));
    expect(plugins.some((plugin) => plugin.id === "core:transform-latex")).toBe(false);
    expect(plugins.some((plugin) => plugin.id === "core:transform-syntax")).toBe(false);
  });

  it("requires a provider for each build stage, regardless of plugin ID", () => {
    expect(() => resolveRuntimePlugins(config([
      { id: "core:filter-unpublished", disabled: true },
    ]))).toThrow("`filterUnpublished`");

    const plugins = resolveRuntimePlugins(config([
      { id: "core:filter-unpublished", disabled: true },
      { id: "custom:visibility", filterUnpublished() {} },
    ]));
    expect(plugins.some((plugin) => plugin.id === "custom:visibility")).toBe(true);

    const theme = {
      id: "theme",
      pluginPreset: { plugins: [{ id: "theme:visibility", filterUnpublished() {} }] },
    } as SvartzTheme;
    const themed = resolveRuntimePlugins(config([{ id: "core:filter-unpublished", disabled: true }]), theme);
    expect(themed.some((plugin) => plugin.id === "theme:visibility")).toBe(true);
  });

  it("keeps a same-ID replacement in its built-in stage position", () => {
    const plugins = resolveRuntimePlugins(config([
      { id: "core:transform-syntax", transformSyntax() {} },
    ]));
    const position = plugins.findIndex((plugin) => plugin.id === "core:transform-syntax");
    expect(position).toBeGreaterThan(0);
    expect(plugins[position - 1]?.id).toBe("core:transform-description");
    expect(plugins[position + 1]?.id).toBe("core:transform-latex");
  });

  it("does not retain browser resources from a replaced transformer", async () => {
    const plugins = resolveRuntimePlugins(config([
      { id: "core:transform-latex", transformLatex() {} },
    ]));
    const ctx = {
      config: config(),
      files: [{ path: "math.md", slug: "math", extension: ".md", content: "$x$" }],
      artifacts: new Map(),
      meta: new Map(),
    } as unknown as PluginContext;

    await runStages(plugins, ctx, ["transformLatex"]);

    expect(ctx.files[0]?.content).toBe("$x$");
    expect(ctx.compiler?.browserResources.size ?? 0).toBe(0);
  });

  it("fails only when a theme explicitly requires a disabled feature", () => {
    const noMath = config([{ id: "core:transform-latex", disabled: true }]);
    const supported = { id: "theme", capabilities: { math: true } } as SvartzTheme;
    expect(() => resolveRuntimePlugins(noMath, supported)).not.toThrow();

    const required = { ...supported, requiredFeatures: ["math"] } as SvartzTheme;
    expect(() => resolveRuntimePlugins(noMath, required)).toThrow(
      'Theme "theme" requires disabled feature(s): math.',
    );

    const replacement = config([
      { id: "core:transform-latex", disabled: true },
      { id: "custom:math", transformLatex() {} },
    ]);
    expect(() => resolveRuntimePlugins(replacement, required)).not.toThrow();
  });
});
