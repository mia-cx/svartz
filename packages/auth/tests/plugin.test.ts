import type { NormalizedSvartzPlugin, PluginContext, ResolvedConfig } from "@svartz/core";
import { describe, expect, it } from "vitest";
import { auth, type AuthOptions } from "../src/index";
import type { AuthServerData } from "../src/server";

const github = { clientId: "fake-client-id", clientSecret: { env: "PRIVATE_GITHUB_SECRET" } };

describe("the auth plugin", () => {
  it("serves its routes and gives the dialog the vault's providers, endpoint and privacy notice", async () => {
    const plugin = auth({ providers: { github }, privacyNotice: "/privacy/" });
    const entries = [{ slug: "garden/herbs/basil" }, { slug: "garden/roses" }, { slug: "index" }];
    const ctx = { config: { mountPath: "/notes", target: { type: "node", basePath: "/site/" } }, plugins: [], files: [], index: { entries }, meta: new Map() } as unknown as PluginContext;

    await plugin.emitArtifacts!.run(ctx);

    expect(plugin.id).toBe("auth");
    // The dashboard's object picker suggests every published page and the folders that hold them.
    expect((ctx.compiler?.serverData.get("auth") as { paths: string[] }).paths)
      .toEqual(["garden/", "garden/herbs/", "garden/herbs/basil", "garden/roses", "index"]);
    // Eager: plugins that read accounts need this deployment's admins before their own first request. It renders
    // /-/account/ and /-/dashboard/.
    expect(plugin.server).toEqual({
      module: expect.stringMatching(/server\.js$/),
      options: { providers: { github }, privacyNotice: "/privacy/", userPages: "users" },
      eager: true,
      pages: ["account", "dashboard"],
    });
    expect(ctx.compiler?.browserResources.get("auth")?.options).toEqual({
      // Below the deployment base, which the dialog only learns when it mounts: a host app's comes from SvelteKit.
      endpoint: "/notes/_svartz/auth",
      mountPath: "/notes",
      providers: [{ id: "github", label: "GitHub" }],
      privacyNotice: "/privacy/",
      // The vault holds user pages, so its pages there show their owner's reputation.
      userPages: "/notes/users/",
    });
  });

  it("fails the build for a provider it doesn't support", () => {
    expect(() => auth({ providers: { gitlab: github } } as unknown as AuthOptions)).toThrow(/unknown provider "gitlab"/);
  });

  it.each([
    ["isn't an identity id", "octocat", /admins lists "octocat"; use identity ids such as "github:583231"/],
    ["names a provider readers can't sign in with", "google:110169484474386276334", /admins lists "google:110169484474386276334", but providers doesn't offer google/],
  ])("fails the build when an admin %s", (_case, admin, error) => {
    expect(() => auth({ providers: { github }, admins: [admin] })).toThrow(error);
  });

  it.each(["", "  "])("fails the build when the client secret's variable name is %j", (env) => {
    expect(() => auth({ providers: { github: { ...github, clientSecret: { env } } } })).toThrow(/clientSecret must name its environment variable/);
  });

  it.each([
    ["people", "people"],
    ["people/", "people"],
    ["wiki/user_pages", "wiki/user_pages"],
  ])("keeps user pages in the folder %j names", (userPages, folder) => {
    expect((auth({ providers: { github }, userPages }).server?.options as AuthOptions).userPages).toBe(folder);
  });

  // Each would let the override match pages outside one folder, or match no page's slug at all.
  it.each(["", "/", "/users", "users//x", "../users", "users/..", "./users", "Users", "user pages", "-", "users\\x", "user--pages", 7])(
    "fails the build for the user page folder %j",
    (userPages) => {
      expect(() => auth({ providers: { github }, userPages } as unknown as AuthOptions)).toThrow(/userPages must be a folder of the vault/);
    },
  );

  it("records the build's user pages for the server: each page directly in the folder named after a handle", async () => {
    const config = { id: "notes", mountPath: "/notes", target: { type: "node" }, plugins: [auth({ providers: { github }, userPages: "people" })] } as unknown as ResolvedConfig;
    const plugin = (config.plugins[0] as NormalizedSvartzPlugin).forVault!({ vault: config, vaults: [config] }) as NormalizedSvartzPlugin;
    const note = (slug: string, extra = {}) => ({ slug, extension: ".md", ...extra });
    const ctx = {
      config,
      plugins: [plugin],
      files: [
        note("people/ada"),
        note("people/grace", { protection: { group: "staff", hidden: true } }),
        note("people/ada/notes"),
        note("people/Bad Handle"),
        note("people"),
        note("users/bob"),
        { slug: "people/photo", extension: ".png" },
      ],
      index: { entries: [{ slug: "people/ada", href: "/notes/people/ada/" }] },
      meta: new Map(),
    } as unknown as PluginContext;

    await plugin.emitArtifacts!.run(ctx);

    expect((ctx.compiler?.serverData.get("auth") as AuthServerData).userPages).toEqual({ ada: "/notes/people/ada/", grace: null });
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
    const ctx = { config: { mountPath, target: { type: "host" } }, plugins: [], files: [], meta: new Map() } as unknown as PluginContext;
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

    expect(work.server?.options).toMatchObject({ callbackMountPath: "/journal", userPageVault: "journal" });
    expect(await dialogEndpoint(work, "/work")).toBe("/journal/_svartz/auth");
    expect(resolve(vaults, "journal").server?.options).not.toHaveProperty("callbackMountPath");
    expect(resolve(vaults, "journal").server?.options).toMatchObject({ userPageVault: "journal" });
  });

  // Proves only the vault that runs sign-in reserves handles: another host vault's build records no user pages.
  it("records user pages only in the build of the vault that runs sign-in", async () => {
    const vaults = site(
      { id: "journal", plugins: [auth({ providers: { github } })] },
      { id: "work", plugins: [auth({ providers: { github } })] },
    );
    const recorded = async (id: string) => {
      const ctx = {
        config: vaults.find((vault) => vault.id === id),
        plugins: [],
        files: [{ slug: "users/ada", extension: ".md" }],
        index: { entries: [{ slug: "users/ada", href: `/${id}/users/ada/` }] },
        meta: new Map(),
      } as unknown as PluginContext;
      await resolve(vaults, id).emitArtifacts!.run(ctx);
      return (ctx.compiler?.serverData.get("auth") as AuthServerData).userPages;
    };

    expect(await recorded("journal")).toEqual({ ada: "/journal/users/ada/" });
    expect(await recorded("work")).toBeUndefined();
  });

  it("uses the callbackVault a vault names", async () => {
    const vaults = site(
      { id: "journal", plugins: [auth({ providers: { github } })] },
      { id: "work", plugins: [auth({ providers: { github }, callbackVault: "work" })] },
    );

    expect(resolve(vaults, "work").server?.options).not.toHaveProperty("callbackMountPath");
    expect(await dialogEndpoint(resolve(vaults, "work"), "/work")).toBe("/work/_svartz/auth");
  });

  it("keeps user pages in the one vault that runs sign-in, and has none when host vaults sign in through different vaults", () => {
    const shared = site(
      { id: "journal", plugins: [auth({ providers: { github } })] },
      { id: "work", plugins: [auth({ providers: { github } })] },
    );
    expect(resolve(shared, "journal").server?.options).toMatchObject({ userPageVault: "journal" });
    expect(resolve(shared, "work").server?.options).toMatchObject({ userPageVault: "journal" });

    // Each callback vault would allocate handles knowing only its own pages, so neither holds user pages.
    const split = site(
      { id: "journal", plugins: [auth({ providers: { github } })] },
      { id: "work", plugins: [auth({ providers: { github }, callbackVault: "work" })] },
    );
    expect(resolve(split, "journal").server?.options).not.toHaveProperty("userPageVault");
    expect(resolve(split, "work").server?.options).not.toHaveProperty("userPageVault");
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
    // Host vaults share accounts, so one list decides who administers them.
    ["lists other admins", [
      { id: "journal", plugins: [auth({ providers: { github }, admins: ["github:583231"] })] },
      { id: "work", plugins: [auth({ providers: { github } })] },
    ], /vault "work" lists different admins than vault "journal"/],
    ["lists one admin twice where another host vault lists two", [
      { id: "journal", plugins: [auth({ providers: { github }, admins: ["github:583231", "github:1"] })] },
      { id: "work", plugins: [auth({ providers: { github }, admins: ["github:583231", "github:583231"] })] },
    ], /vault "work" lists different admins than vault "journal"/],
    ["is its own, with other admins than another host vault", [
      { id: "journal", plugins: [auth({ providers: { github }, admins: ["github:583231"] })] },
      { id: "work", plugins: [auth({ providers: { github }, callbackVault: "work" })] },
    ], /vault "work" lists different admins than vault "journal"/],
    // A handle is one account's across the app, so its user page is in the same folder everywhere.
    ["keeps user pages in another folder", [
      { id: "journal", plugins: [auth({ providers: { github }, userPages: "people" })] },
      { id: "work", plugins: [auth({ providers: { github } })] },
    ], /vault "work" keeps user pages in another folder than vault "journal"/],
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

describe("the permission catalogue", () => {
  type Declaration = { slug: string; name: string; description: string; defaults?: Record<string, string> };
  const comment: Declaration = { slug: "guestbook:entries:write", name: "Sign", description: "Add an entry.", defaults: { "signed-in": "allow" } };
  const remove: Declaration = { slug: "guestbook:entries:delete", name: "Delete any entry", description: "Remove anyone's entry." };
  const guestbook = (...permissions: Declaration[]) => ({ id: "guestbook", permissions });
  type Vault = { id: string; type?: string; plugins: unknown[] };
  /** The catalogue auth's server module receives on `id`, once config resolution knows every vault. */
  const catalogueOf = (id: string, ...specs: Vault[]) => {
    const vaults = specs.map(({ id, type = "host", plugins }) => ({ id, mountPath: `/${id}`, target: { type }, plugins }) as unknown as ResolvedConfig);
    const vault = vaults.find((candidate) => candidate.id === id)!;
    const plugin = (vault.plugins as NormalizedSvartzPlugin[]).find((candidate) => candidate.id === "auth")!;
    return (plugin.forVault!({ vault, vaults }).server?.options as { permissions: unknown }).permissions;
  };

  it("collects what the vault's enabled plugins declare, at build time", () => {
    const off = { id: "visitors", disabled: true, permissions: [{ slug: "visitors:counts:read", name: "Count", description: "See counts." }] };

    expect(catalogueOf("notes", { id: "notes", type: "cloudflare-workers", plugins: [auth({ providers: { github } }), guestbook(comment, remove), off] }))
      .toEqual([comment, remove]);
  });

  it("also collects from the build's final plugins, so a theme preset's plugin can declare permissions", async () => {
    const plugin = auth({ providers: { github } });
    // What the build runs: the config's plugins plus one only the theme's preset brings.
    const ctx = { config: { id: "notes", mountPath: "/notes", target: { type: "cloudflare-workers" }, plugins: [plugin] }, plugins: [plugin, guestbook(comment)], files: [], meta: new Map() } as unknown as PluginContext;

    await plugin.emitArtifacts!.run(ctx);

    expect(ctx.compiler?.serverData.get("auth")).toEqual({ permissions: [comment], paths: [] });
  });

  it("fails the build for a malformed declaration that only the build's final plugins carry", async () => {
    const plugin = auth({ providers: { github } });
    const ctx = { config: { id: "notes", mountPath: "/notes", target: { type: "cloudflare-workers" }, plugins: [plugin] }, plugins: [plugin, guestbook({ ...comment, slug: "guestbook:entries:sign" })], files: [], meta: new Map() } as unknown as PluginContext;

    expect(() => plugin.emitArtifacts!.run(ctx)).toThrow(/use "namespace:feature:action"/);
  });

  it("fails a host vault's build when its final plugins declare a permission differently than another host vault's did", async () => {
    const plugin = auth({ providers: { github } });
    // Each vault's theme preset brings a guestbook; only the builds see them, and they disagree on a default.
    const build = (id: string, declaration: Declaration) => plugin.emitArtifacts!.run({
      config: { id, mountPath: `/${id}`, target: { type: "host" }, plugins: [plugin] }, plugins: [plugin, guestbook(declaration)], files: [], meta: new Map(),
    } as unknown as PluginContext);
    await build("journal", { ...remove, defaults: { guest: "deny" } });

    expect(() => build("work", { ...remove, defaults: { guest: "allow" } }))
      .toThrow(/vault "work" declares "guestbook:entries:delete" differently than vault "journal"/);
    // A rebuild that declares it alike passes: the vault's last build is what counts.
    expect(() => build("work", { ...remove, defaults: { guest: "deny" } })).not.toThrow();
  });

  it("fails a build whose final plugins declare a permission differently than the config's plugins did", () => {
    // journal's config declares the default; work's theme preset brings the same permission with another.
    const vaults = [
      { id: "journal", mountPath: "/journal", target: { type: "host" }, plugins: [auth({ providers: { github } }), guestbook({ ...remove, defaults: { guest: "deny" } })] },
      { id: "work", mountPath: "/work", target: { type: "host" }, plugins: [auth({ providers: { github } })] },
    ] as unknown as ResolvedConfig[];
    const work = vaults[1]!;
    const resolved = (work.plugins[0] as NormalizedSvartzPlugin).forVault!({ vault: work, vaults }) as NormalizedSvartzPlugin;

    expect(() => resolved.emitArtifacts!.run({
      config: work, plugins: [resolved, guestbook({ ...remove, defaults: { guest: "allow" } })], files: [], meta: new Map(),
    } as unknown as PluginContext)).toThrow(/vault "work" builds with "guestbook:entries:delete" declared differently than the config's plugins declare it/);
  });

  it("gives every host vault one catalogue, since they share accounts and grants", () => {
    const vaults: Vault[] = [
      { id: "journal", plugins: [auth({ providers: { github } }), guestbook(comment)] },
      { id: "work", plugins: [auth({ providers: { github } }), guestbook(comment, remove)] },
      { id: "blog", type: "cloudflare-workers", plugins: [auth({ providers: { github } })] },
    ];

    expect(catalogueOf("journal", ...vaults)).toEqual([comment, remove]);
    expect(catalogueOf("work", ...vaults)).toEqual([comment, remove]);
    expect(catalogueOf("blog", ...vaults)).toEqual([]);
  });

  it.each([
    ["isn't namespace:feature:action", { ...remove, slug: "guestbook:delete" }, /declares permission "guestbook:delete"; use "namespace:feature:action"/],
    ["has an action other than read, write or delete", { ...remove, slug: "guestbook:entries:purge" }, /declares permission "guestbook:entries:purge"/],
    ["is in another plugin's namespace", { ...remove, slug: "annotations:comments:delete" }, /a plugin declares only permissions starting "guestbook:"/],
    ["has no name", { ...remove, name: " " }, /"guestbook:entries:delete" needs a name/],
    ["has no description", { ...remove, description: "" }, /"guestbook:entries:delete" needs a description/],
    ["defaults an actor that isn't built in", { ...remove, defaults: { moderators: "allow" } }, /sets a default for "moderators"; defaults go to guest and signed-in/],
    ["defaults to unset", { ...remove, defaults: { guest: "unset" } }, /defaults guest to "unset"; use "allow" or "deny"/],
  ])("fails the build for a permission that %s", (_case, declaration, error) => {
    expect(() => catalogueOf("notes", { id: "notes", plugins: [auth({ providers: { github } }), guestbook(declaration)] })).toThrow(error);
  });

  it("fails the build when host vaults declare one permission differently", () => {
    expect(() => catalogueOf("work",
      { id: "journal", plugins: [auth({ providers: { github } }), guestbook(comment)] },
      { id: "work", plugins: [auth({ providers: { github } }), guestbook({ ...comment, defaults: { guest: "allow" } })] },
    )).toThrow(/vault "work" declares "guestbook:entries:write" differently than vault "journal"/);
  });
});
