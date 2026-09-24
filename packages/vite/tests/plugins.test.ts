import { describe, expect, it } from "vitest";
import type { ResolvedConfig, SvartzPlugin } from "@svartz/core";
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
});
