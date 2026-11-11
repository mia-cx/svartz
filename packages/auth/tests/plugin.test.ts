import type { PluginContext } from "@svartz/core";
import { describe, expect, it } from "vitest";
import { auth, type AuthOptions } from "../src/index";

const github = { clientId: "fake-client-id", clientSecret: { env: "PRIVATE_GITHUB_SECRET" } };

describe("the auth plugin", () => {
  it("serves its routes and gives the dialog the vault's providers, endpoint and privacy notice", async () => {
    const plugin = auth({ providers: { github }, privacyNotice: "/privacy/" });
    const ctx = { config: { mountPath: "/notes", target: { type: "node", basePath: "/site/" } }, files: [], meta: new Map() } as unknown as PluginContext;

    await plugin.emitArtifacts!.run(ctx);

    expect(plugin.id).toBe("auth");
    expect(plugin.server).toEqual({ module: expect.stringMatching(/server\.js$/), options: { providers: { github }, privacyNotice: "/privacy/" } });
    expect(ctx.compiler?.browserResources.get("auth")?.options).toEqual({
      endpoint: "/site/notes/_svartz/auth",
      providers: [{ id: "github", label: "GitHub" }],
      privacyNotice: "/privacy/",
    });
  });

  it("fails the build for a provider it doesn't support", () => {
    expect(() => auth({ providers: { gitlab: github } } as unknown as AuthOptions)).toThrow(/unknown provider "gitlab"/);
  });

  it.each(["", "  "])("fails the build when the client secret's variable name is %j", (env) => {
    expect(() => auth({ providers: { github: { ...github, clientSecret: { env } } } })).toThrow(/clientSecret must name its environment variable/);
  });
});
