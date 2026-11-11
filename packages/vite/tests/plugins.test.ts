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

describe("server plugins", () => {
  const hello = (server: Record<string, unknown> = {}): SvartzPlugin =>
    ({ id: "hello", server: { module: "/plugins/hello/server.js", ...server } }) as SvartzPlugin;
  const vault = (type: string, plugins: SvartzPlugin[] = [hello()]) =>
    ({ id: "wiki", target: { type }, plugins }) as unknown as ResolvedConfig;

  it("accepts a server plugin on every server target", () => {
    for (const type of ["cloudflare-workers", "cloudflare-pages", "node"]) {
      expect(resolveRuntimePlugins(vault(type)).find((plugin) => plugin.id === "hello")?.server)
        .toEqual({ module: "/plugins/hello/server.js" });
    }
  });

  it("fails a static vault, naming the vault and the plugin", () => {
    expect(() => resolveRuntimePlugins(vault("static"))).toThrow(
      'Vault "wiki" targets "static", but plugin "hello" serves requests.',
    );
  });

  it("fails a static vault whose theme preset brings the server plugin", () => {
    const theme = { id: "theme", pluginPreset: { plugins: [hello()] } } as SvartzTheme;
    expect(() => resolveRuntimePlugins(vault("static", []), theme)).toThrow('plugin "hello" serves requests');
  });

  it("builds a static vault whose server plugin is disabled", () => {
    expect(() => resolveRuntimePlugins(vault("static", [{ ...hello(), disabled: true }]))).not.toThrow();
  });

  it("accepts a host vault unless the host app uses adapter-static", () => {
    expect(() => resolveRuntimePlugins(vault("host"), undefined, "@sveltejs/adapter-node")).not.toThrow();
    expect(() => resolveRuntimePlugins(vault("host"), undefined, "@sveltejs/adapter-static")).toThrow(
      'Vault "wiki" is mounted in a host app that uses @sveltejs/adapter-static, but plugin "hello" serves requests.',
    );
  });

  it("names secrets by server-only env vars", () => {
    const withSecret = (options: unknown) => vault("node", [hello({ options })]);
    expect(() => resolveRuntimePlugins(withSecret({ token: { env: "PRIVATE_GITHUB_TOKEN" } }))).not.toThrow();
    for (const name of ["PUBLIC_TOKEN", "VITE_TOKEN", "not a name"]) {
      expect(() => resolveRuntimePlugins(withSecret({ token: { env: name } }))).toThrow(
        `server.options.token names "${name}"`,
      );
    }
    expect(() => resolveRuntimePlugins(withSecret({ token: { env: "TOKEN", fallback: "x" } }))).toThrow(
      "exactly { env: \"NAME\" }",
    );
  });

  it("refuses options that aren't JSON", () => {
    for (const [options, path] of [
      [{ run: () => {} }, "server.options.run"],
      [{ limit: Number.NaN }, "server.options.limit"],
      [{ list: [1, undefined] }, "server.options.list[1]"],
      [{ when: new Date(0) }, "server.options.when"],
    ] as const) {
      expect(() => resolveRuntimePlugins(vault("node", [hello({ options })]))).toThrow(`Plugin "hello": ${path}`);
    }
  });

  it("refuses ids that can't be a URL path segment and relative modules", () => {
    expect(() => resolveRuntimePlugins(vault("node", [{ ...hello(), id: "core:hello" } as SvartzPlugin])))
      .toThrow('Plugin "core:hello" serves requests under /_svartz/<id>/');
    expect(() => resolveRuntimePlugins(vault("node", [hello({ module: "./server.js" })])))
      .toThrow('server module "./server.js" is relative');
  });
});
