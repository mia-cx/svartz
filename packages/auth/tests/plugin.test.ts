import type { NormalizedSvartzPlugin, PluginContext, ResolvedConfig } from "@svartz/core";
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
      // Below the deployment base, which the dialog only learns when it mounts: a host app's comes from SvelteKit.
      endpoint: "/notes/_svartz/auth",
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

describe("one sign-in per host app", () => {
  const google = { clientId: "fake-google-id", clientSecret: { env: "PRIVATE_GOOGLE_SECRET" } };
  type Vault = { id: string; type?: string; plugins?: unknown[] };
  const site = (...vaults: Vault[]) => vaults.map(({ id, type = "host", plugins = [] }) =>
    ({ id, mountPath: `/${id}`, target: { type }, plugins }) as unknown as ResolvedConfig);
  const resolve = (vaults: ResolvedConfig[], id: string) => {
    const vault = vaults.find((candidate) => candidate.id === id)!;
    const plugin = (vault.plugins as NormalizedSvartzPlugin[]).find((candidate) => candidate.id === "auth")!;
    return plugin.forVault!({ vault, vaults }) as NormalizedSvartzPlugin;
  };
  const dialogEndpoint = async (plugin: NormalizedSvartzPlugin, mountPath: string) => {
    const ctx = { config: { mountPath, target: { type: "host" } }, files: [], meta: new Map() } as unknown as PluginContext;
    await plugin.emitArtifacts!.run(ctx);
    return (ctx.compiler?.browserResources.get("auth")?.options as { endpoint: string }).endpoint;
  };

  it("sends every host vault's sign-in through the first host vault with auth", async () => {
    const vaults = site(
      { id: "blog" },
      { id: "journal", plugins: [auth({ providers: { github, google } })] },
      { id: "work", plugins: [auth({ providers: { github } })] },
    );

    const work = resolve(vaults, "work");

    expect(work.server?.options).toMatchObject({ callbackMountPath: "/journal" });
    expect(await dialogEndpoint(work, "/work")).toBe("/journal/_svartz/auth");
    expect(resolve(vaults, "journal").server?.options).not.toHaveProperty("callbackMountPath");
  });

  it("uses the callbackVault a vault names", async () => {
    const vaults = site(
      { id: "journal", plugins: [auth({ providers: { github } })] },
      { id: "work", plugins: [auth({ providers: { github }, callbackVault: "work" })] },
    );

    expect(resolve(vaults, "work").server?.options).not.toHaveProperty("callbackMountPath");
    expect(await dialogEndpoint(resolve(vaults, "work"), "/work")).toBe("/work/_svartz/auth");
  });

  it.each([
    ["names no vault", [{ id: "work", plugins: [auth({ providers: { github }, callbackVault: "jornal" })] }],
      /vault "work" sets callbackVault "jornal", but no vault has that id/],
    ["names a vault without auth", [{ id: "journal" }, { id: "work", plugins: [auth({ providers: { github }, callbackVault: "journal" })] }],
      /vault "work" sets callbackVault "journal", which must be a host vault that enables auth/],
    ["names a standalone vault", [
      { id: "journal", type: "node", plugins: [auth({ providers: { github } })] },
      { id: "work", plugins: [auth({ providers: { github }, callbackVault: "journal" })] },
    ], /vault "work" sets callbackVault "journal", which must be a host vault that enables auth/],
    ["lacks a provider the vault offers", [
      { id: "journal", plugins: [auth({ providers: { github } })] },
      { id: "work", plugins: [auth({ providers: { github, google } })] },
    ], /vault "work" offers google, but its callbackVault "journal" doesn't list it under providers/],
    ["is set on a standalone vault", [
      { id: "journal", plugins: [auth({ providers: { github } })] },
      { id: "work", type: "node", plugins: [auth({ providers: { github }, callbackVault: "journal" })] },
    ], /only host vaults share a sign-in; "work" runs its own/],
  ])("fails config resolution when the callbackVault %s", (_case, vaults, error) => {
    expect(() => resolve(site(...vaults), "work")).toThrow(error);
  });

  it("refuses callback vaults that forward to each other, which would loop sign-in forever", () => {
    // journal comes first, so work's default is journal, while journal names work.
    const vaults = site(
      { id: "journal", plugins: [auth({ providers: { github }, callbackVault: "work" })] },
      { id: "work", plugins: [auth({ providers: { github } })] },
    );

    expect(() => resolve(vaults, "journal")).toThrow(/vault "journal" sends sign-in to "work", but "work" sends its own to "journal"/);
    expect(() => resolve(vaults, "work")).toThrow(/vault "work" sends sign-in to "journal", but "journal" sends its own to "work"/);
  });
});
