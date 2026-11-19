import { auth } from "@svartz/auth";
import type { NormalizedSvartzPlugin, PluginContext, ResolvedConfig } from "@svartz/core";
import { describe, expect, it } from "vitest";
import { moderation, type ModerationOptions } from "../src/index";

const database = { env: "SVARTZ_DB" };
const signIn = auth({ providers: { github: { clientId: "fake-client-id", clientSecret: { env: "PRIVATE_GITHUB_SECRET" } } } });

/** Resolve `plugin` for a vault the way config resolution does, once every vault is known. */
function resolveFor(plugin: NormalizedSvartzPlugin, type: string, others: unknown[] = [signIn]) {
  const vault = { id: "garden", mountPath: "/garden", target: { type }, plugins: [...others, plugin] } as unknown as ResolvedConfig;
  return plugin.forVault!({ vault, vaults: [vault] });
}

/** A build of the garden vault that published `entries`, with `plugins` beside moderation. */
async function build(plugins: unknown[], entries: unknown[] = []) {
  const plugin = moderation({ database });
  const ctx = { config: { mountPath: "/garden" }, plugins: [plugin, ...plugins], index: { entries }, files: [], meta: new Map() } as unknown as PluginContext;
  await plugin.emitArtifacts!.run(ctx);
  return ctx.compiler!;
}

describe("the moderation plugin", () => {
  it("serves its routes with every default filled in", () => {
    const plugin = moderation({ database });

    expect(resolveFor(plugin, "cloudflare-workers")).toBe(plugin);
    expect(plugin.server).toEqual({ module: expect.stringMatching(/server\.js$/), options: { database, limits: { reportsPerHour: 10 } } });
  });

  it("declares reporting, handling reports, suspending and reading the log, which auth collects at build time", () => {
    const vault = { id: "garden", mountPath: "/garden", target: { type: "cloudflare-workers" }, plugins: [signIn, moderation({ database })] } as unknown as ResolvedConfig;

    const resolved = signIn.forVault!({ vault, vaults: [vault] });

    expect((resolved.server?.options as { permissions: Array<{ slug: string; defaults?: unknown }> }).permissions.map(({ slug, defaults }) => [slug, defaults])).toEqual([
      ["moderation:reports:write", { "signed-in": "allow" }],
      ["moderation:reports:read", undefined],
      ["moderation:accounts:write", undefined],
      ["moderation:audit:read", undefined],
    ]);
  });

  it("tells the server the published pages and which owning plugins the vault has", async () => {
    const annotations = { id: "annotations", server: { module: "/a.js", options: { database: { env: "DB" } } } };
    const submissions = { id: "submissions", server: { module: "/s.js", options: { repo: "wikiplace/wikiplace.live" } } };

    const compiler = await build([annotations, submissions], [
      { slug: "roses", title: "Roses", href: "/garden/roses/" },
      { slug: "locked", title: "Locked", href: "/garden/locked/", locked: true },
    ]);

    expect(compiler.serverData.get("moderation")).toEqual({
      pages: { roses: { title: "Roses", href: "/garden/roses/" } },
      userPages: "users",
      annotations: { database: "DB" },
      submissions: { repo: "wikiplace/wikiplace.live" },
    });
    expect(compiler.browserResources.get("moderation")).toEqual({
      id: "moderation", kind: "script", importId: expect.stringMatching(/browser\.js$/), options: { mountPath: "/garden", userPages: "users" },
    });
    expect(compiler.browserResources.get("moderation-css")).toEqual({ id: "moderation-css", kind: "css", importId: expect.stringMatching(/browser\.css$/) });
  });

  it("names no owning plugin the vault lacks", async () => {
    expect((await build([])).serverData.get("moderation")).toEqual({ pages: {}, userPages: "users" });
  });

  it.each([
    ["on a node target", () => resolveFor(moderation({ database }), "node"), /\[svartz:moderation\] vault "garden" deploys to node/],
    ["without auth on the same vault", () => resolveFor(moderation({ database }), "cloudflare-workers", []), /\[svartz:moderation\] vault "garden" enables moderation without auth/],
    ["without a database binding", () => moderation({} as ModerationOptions), /\[svartz:moderation\] database must name the D1 binding/],
    ["with a report limit of zero", () => moderation({ database, limits: { reportsPerHour: 0 } }), /limits\.reportsPerHour must be a whole number above 0/],
  ])("fails the build %s, naming the plugin", (_case, make, error) => {
    expect(make).toThrow(error);
  });
});
