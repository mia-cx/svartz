import { auth } from "@svartz/auth";
import { getCompilerContributions, type NormalizedSvartzPlugin, type PluginContext, type ResolvedConfig } from "@svartz/core";
import { submissions } from "@svartz/plugin-submissions";
import { describe, expect, it } from "vitest";
import { history } from "../src/index";

const repo = "wikiplace/wikiplace.live";
const app = { id: 1_234_567, privateKey: { env: "SVARTZ_GITHUB_APP_KEY" } };
const sync = { database: { env: "SVARTZ_DB" }, webhookSecret: { env: "SVARTZ_GITHUB_WEBHOOK_SECRET" }, live: { workflow: "deploy.yml" } };

/** Resolve `plugin` for a vault holding `others` beside it, the way config resolution does. */
function resolveFor(plugin: NormalizedSvartzPlugin, others: unknown[]) {
  const vault = { id: "wiki", mountPath: "/wiki", target: { type: "cloudflare-workers" }, plugins: [...others, plugin] } as unknown as ResolvedConfig;
  return plugin.forVault!({ vault, vaults: [vault] });
}

describe("the history plugin", () => {
  // Proves a vault gets history only where the submissions plugin mirrors GitHub, and the build says what's missing.
  it.each([
    ["without the submissions plugin", []],
    ["with submissions but no sync", [submissions({ repo, app })]],
    ["with sync on a disabled submissions plugin", [{ ...submissions({ repo, app, sync }), disabled: true }]],
  ])("fails the build %s, naming the vault and the plugin it needs", (_case, others) => {
    expect(() => resolveFor(history(), others)).toThrow(
      /\[history\] vault "wiki" enables history without the submissions plugin's GitHub mirror; add submissions\(\{ repo, app, sync: \{ … \} \}\) to the same vault/,
    );
  });

  // Proves the pages it claims, which a vault with the mirror resolves.
  it("claims /-/history/, /-/changes/ and /-/contributions/ on a vault whose submissions plugin mirrors GitHub", () => {
    const plugin = history();
    expect(resolveFor(plugin, [submissions({ repo, app, sync })])).toBe(plugin);
    expect(plugin.server?.pages).toEqual(["history", "changes", "contributions"]);
  });

  // Proves user pages get their account's contributions on the vault that holds them, and only there: in a host app,
  // a `users/` page of another vault is an ordinary page.
  it("tells the browser where user pages are, on the vault that holds them", async () => {
    const github = { clientId: "fake-client-id", clientSecret: { env: "PRIVATE_GITHUB_SECRET" } };
    const vault = (id: string, mountPath: string) => ({
      id, mountPath, target: { type: "host" }, linkResolution: "shallowest", frontmatter: { aliasesField: "aliases" }, theme: {},
      plugins: [auth({ providers: { github }, userPages: "people" }), submissions({ repo, app, sync }), history()],
    }) as unknown as ResolvedConfig;
    const vaults = [vault("wiki", "/wiki"), vault("blog", "/blog")];

    async function browserOptions(config: ResolvedConfig) {
      const plugins = (config.plugins as NormalizedSvartzPlugin[]).map((plugin) => plugin.forVault!({ vault: config, vaults }) as NormalizedSvartzPlugin);
      const ctx = { config, plugins, files: [], index: { entries: [] }, meta: new Map() } as unknown as PluginContext;
      // What the submissions plugin's own build step records first: where the vault is in the repository.
      getCompilerContributions(ctx).serverData.set("submissions", { vaultRoot: "content" });
      await plugins.at(-1)!.emitArtifacts!.run(ctx);
      return getCompilerContributions(ctx).browserResources.get("history")?.options;
    }

    expect(await browserOptions(vaults[0]!)).toEqual({ mountPath: "/wiki", pages: [], userPages: "/wiki/people/" });
    expect(await browserOptions(vaults[1]!)).toEqual({ mountPath: "/blog", pages: [] });
  });
});
