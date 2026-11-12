import { auth } from "@svartz/auth";
import type { NormalizedSvartzPlugin, PluginContext, ResolvedConfig } from "@svartz/core";
import { describe, expect, it } from "vitest";
import { annotations, type AnnotationsOptions } from "../src/index";

const database = { env: "DB" };
const signIn = auth({ providers: { github: { clientId: "fake-client-id", clientSecret: { env: "PRIVATE_GITHUB_SECRET" } } } });

/** Resolve `plugin` for a vault the way config resolution does, once every vault is known. */
function resolveFor(plugin: NormalizedSvartzPlugin, type: string, others: unknown[] = [signIn]) {
  const vault = { id: "garden", mountPath: "/garden", target: { type }, plugins: [...others, plugin] } as unknown as ResolvedConfig;
  return plugin.forVault!({ vault, vaults: [vault] });
}

describe("the annotations plugin", () => {
  it("serves its routes with every default filled in", () => {
    const plugin = annotations({ database });

    expect(resolveFor(plugin, "cloudflare-workers")).toBe(plugin);
    expect(plugin.server).toEqual({
      module: expect.stringMatching(/server\.js$/),
      options: { database, reactions: [], moderators: [], limits: { writesPerHour: 30 } },
    });
  });

  it("gives the browser a script that finds the vault's routes, and its stylesheet", async () => {
    const plugin = annotations({ database });
    const ctx = { config: { mountPath: "/garden", target: { type: "cloudflare-workers" } }, files: [], meta: new Map() } as unknown as PluginContext;

    await plugin.emitArtifacts!.run(ctx);

    const resources = ctx.compiler!.browserResources;
    expect(resources.get("annotations")).toEqual({
      id: "annotations", kind: "script", importId: expect.stringMatching(/browser\.js$/), options: { endpoint: "/garden/_svartz/annotations" },
    });
    expect(resources.get("annotations-css")).toEqual({ id: "annotations-css", kind: "css", importId: expect.stringMatching(/browser\.css$/) });
  });

  it.each([
    ["on a node target", () => resolveFor(annotations({ database }), "node"),
      /\[svartz:annotations\] vault "garden" deploys to node, but annotations are stored in Cloudflare D1/],
    ["without auth on the same vault", () => resolveFor(annotations({ database }), "cloudflare-workers", []),
      /\[svartz:annotations\] vault "garden" enables annotations without auth/],
    ["without a database binding", () => annotations({} as AnnotationsOptions),
      /\[svartz:annotations\] database must name the D1 binding/],
    ["with a reaction id that isn't a slug", () => annotations({ database, reactions: [{ id: "Heart!", label: "Heart", src: "/heart.svg" }] }),
      /reactions\[0\]\.id must be lowercase letters, digits and hyphens/],
    ["with a reaction listed twice", () => annotations({ database, reactions: [{ id: "heart", label: "Heart", src: "/a.svg" }, { id: "heart", label: "Love", src: "/b.svg" }] }),
      /reactions lists "heart" twice/],
    ["with a moderator that isn't an identity id", () => annotations({ database, moderators: ["octocat"] }),
      /moderators must be identity ids/],
    ["with a write limit of zero", () => annotations({ database, limits: { writesPerHour: 0 } }),
      /limits\.writesPerHour must be a whole number above 0/],
  ])("fails the build %s, naming the plugin", (_case, build, error) => {
    expect(build).toThrow(error);
  });
});
