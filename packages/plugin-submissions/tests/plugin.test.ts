import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { auth } from "@svartz/auth";
import {
  runStages,
  type NormalizedSvartzPlugin,
  type PluginContext,
  type ProcessedFile,
  type ResolvedConfig,
  type ServerContext,
} from "@svartz/core";
import { allocateRoutesPlugin, indexContent } from "@svartz/plugins";
import { afterEach, describe, expect, it } from "vitest";
import { submissions } from "../src/index";
import createHandler, { type BuildData } from "../src/server";

let repo: string | undefined;

afterEach(async () => {
  if (repo) await rm(repo, { recursive: true, force: true });
});

type Protection = ProcessedFile["protection"];

const note = (notePath: string, frontmatter: Record<string, unknown> = {}, protection?: Protection): ProcessedFile => ({
  path: notePath,
  extension: notePath.slice(notePath.lastIndexOf(".")),
  slug: "",
  content: "Text.\n",
  frontmatter,
  ...(protection ? { protection } : {}),
});

/**
 * A vault at `content/` with notes of several types. `people/` holds two notes asking for the same route, one routed
 * by its frontmatter slug and one hidden behind a password; `secret.svx` and `private/` are password-protected but listed.
 */
const vaultNotes = () => [
  note("guide.md"),
  note("people/Ada Lovelace.md"),
  note("people/ada lovelace.svx"),
  note("people/Grace.md", { slug: "hopper" }),
  note("people/Diary.md", {}, { group: "family", hidden: true }),
  note("secret.svx", {}, { group: "team", hidden: false }),
  note("tools/Field Guide.svx"),
  note("private/plans.md", {}, { group: "team", hidden: false }),
];

const config = (vault: string) => ({
  version: "1.0.0",
  id: "wiki",
  path: vault,
  outDir: "/out",
  include: [],
  exclude: [],
  publicationMode: "exclusion",
  linkResolution: "closest",
  theme: { base: "minimal" },
  frontmatter: {
    titleField: "title",
    descriptionField: "description",
    tagsField: "tags",
    aliasesField: "aliases",
    createdAtField: "created_at",
    updatedAtField: "updated_at",
    publishedField: "published_at",
  },
  site: { title: "Wiki" },
  mountPath: "/wiki",
  target: { type: "node" },
  plugins: [],
}) as ResolvedConfig;

/** Route and index the vault with the core plugins, then run the plugin's build hook, in a fresh one-commit repository. */
async function build(options: Partial<Parameters<typeof submissions>[0]> = {}) {
  repo = await realpath(await mkdtemp(path.join(os.tmpdir(), "svartz-submissions-")));
  const vault = path.join(repo, "content");
  await mkdir(vault);
  await writeFile(path.join(vault, "guide.md"), "# Guide\n");
  const git = (...args: string[]) => execFileSync("git", ["-C", repo!, ...args], { encoding: "utf8" }).trim();
  git("init", "--quiet");
  git("-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "--quiet", "--allow-empty", "-m", "Build");

  const ctx: PluginContext = { config: config(vault), files: vaultNotes(), artifacts: new Map(), meta: new Map() };
  const result = await runStages(
    [allocateRoutesPlugin(), indexContent(), submissions({ repo: "acme/wiki", ...options })],
    ctx,
    ["allocateRoutes", "indexContent", "emitArtifacts"],
  );
  expect(result.errors).toEqual([]);
  return { ctx, commit: git("rev-parse", "HEAD") };
}

describe("submissions build", () => {
  it("records each editable note's repository path and the build commit for the server only", async () => {
    const { ctx, commit } = await build();

    expect(ctx.compiler?.serverData.get("submissions")).toEqual({
      commit,
      pages: {
        "/wiki/guide/": "content/guide.md",
        "/wiki/people/ada-lovelace/": "content/people/Ada Lovelace.md",
        "/wiki/people/hopper/": "content/people/Grace.md",
      },
      // Every route a note holds or asks for, whatever its type or protection; hidden notes' without a link.
      routes: {
        guide: "/wiki/guide/",
        "people/ada-lovelace": "/wiki/people/ada-lovelace/",
        "people/ada-lovelace-2": "/wiki/people/ada-lovelace-2/",
        "people/hopper": "/wiki/people/hopper/",
        "people/grace": "/wiki/people/hopper/",
        "people/diary": null,
        secret: "/wiki/secret/",
        "tools/field-guide": "/wiki/tools/field-guide/",
        "private/plans": "/wiki/private/plans/",
      },
      // Protected notes' folders stay out: a new page there would be public.
      vaultRoot: "content",
      folders: ["", "people", "tools"],
    });
    expect(ctx.compiler?.browserResources.get("submissions")?.options).toEqual({
      endpoint: "/wiki/_svartz/submissions",
      pages: expect.arrayContaining(["/wiki/guide/", "/wiki/people/ada-lovelace/", "/wiki/people/hopper/"]),
      folders: ["", "people", "tools"],
    });
  });

  it("uses the configured vault folder over git's", async () => {
    const { ctx } = await build({ vaultRoot: "./docs/vault/" });

    expect(ctx.compiler?.serverData.get("submissions")).toMatchObject({
      pages: { "/wiki/guide/": "docs/vault/guide.md" },
    });
  });
});

describe("a new page's title, against the routes the build allocated", () => {
  const ORIGIN = "https://wiki.example";
  const BASE = "/wiki/_svartz/submissions";
  const EDITABLE = "A page with this title already exists. Choose another title, or edit that page.";
  const NOT_EDITABLE = "A page with this title already exists. Choose another title.";

  /** Build the vault, then send a new page to the server module built from it, without a GitHub token. */
  async function create(folder: string, title: string) {
    const { ctx } = await build();
    const handler = createHandler(
      { repo: "acme/wiki", labels: [], token: { env: "SVARTZ_GITHUB_TOKEN" }, guard: { rateLimit: { limit: 100, period: 60 } } },
      ctx.compiler!.serverData.get("submissions") as BuildData,
    );
    const request = new Request(`${ORIGIN}${BASE}/new/`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ submissionId: "1".repeat(32), folder, title, markdown: "# Page\n" }),
    });
    const response = await handler(request, {
      env: {},
      clientAddress: "203.0.113.7",
      vault: { id: "wiki", mountPath: "/wiki", site: { title: "Wiki" } },
      base: BASE,
      waitUntil: () => {},
    } as ServerContext);
    return [response!.status, await response!.json()];
  }

  it.each([
    ["a slug spelling of a note's name", "people", "ada-lovelace", "/wiki/people/ada-lovelace/", EDITABLE],
    ["a slug spelling in another case", "people", "Ada-Lovelace", "/wiki/people/ada-lovelace/", EDITABLE],
    ["the route a frontmatter slug claims", "people", "Hopper", "/wiki/people/hopper/", EDITABLE],
    ["a slug spelling of an .svx page's name", "tools", "field-guide", "/wiki/tools/field-guide/", NOT_EDITABLE],
    ["the route a clash moved a note to", "people", "Ada Lovelace 2", "/wiki/people/ada-lovelace-2/", NOT_EDITABLE],
    ["a password-protected page's route, linking its public URL", "", "Secret", "/wiki/secret/", NOT_EDITABLE],
  ])("refuses %s", async (_case, folder, title, route, message) => {
    expect(await create(folder, title)).toEqual([409, { error: "exists", message, existing: `${ORIGIN}${route}` }]);
  });

  it("refuses a hidden page's route without revealing where it is", async () => {
    expect(await create("people", "diary")).toEqual([409, { error: "exists", message: NOT_EDITABLE }]);
  });

  it("passes a free title on to GitHub", async () => {
    expect(await create("people", "Charles Babbage")).toEqual([503, expect.objectContaining({ error: "misconfigured" })]);
  });
});

describe("submissions guard config", () => {
  it("gives the editor the Turnstile site key and keeps the secret's name on the server", async () => {
    const turnstile = { siteKey: "0x4AAAAAAAtest", secret: { env: "TURNSTILE_SECRET" } };
    const { ctx } = await build({ guard: { turnstile } });

    expect(ctx.compiler?.browserResources.get("submissions")?.options).toMatchObject({
      endpoint: "/wiki/_svartz/submissions",
      turnstileSiteKey: "0x4AAAAAAAtest",
    });
  });

  it.each([
    ["a blank site key", { turnstile: { siteKey: " ", secret: { env: "TURNSTILE_SECRET" } } }, /siteKey/],
    ["an inlined secret", { turnstile: { siteKey: "0x4AAAAAAAtest", secret: "0x4AAAAAAAsecret" } }, /secret must name/],
    ["a blank secret name", { turnstile: { siteKey: "0x4AAAAAAAtest", secret: { env: "" } } }, /secret must name/],
    ["a fractional limit", { rateLimit: { limit: 2.5, period: 60 } }, /rateLimit/],
    ["a zero period", { rateLimit: { limit: 5, period: 0 } }, /rateLimit/],
  ])("refuses %s when the config loads", (_case, guard, message) => {
    expect(() => submissions({ repo: "acme/wiki", guard } as Parameters<typeof submissions>[0])).toThrow(message);
  });
});

describe("submissions sign-in config", () => {
  const turnstile = { siteKey: "0x4AAAAAAAtest", secret: { env: "TURNSTILE_SECRET" } };
  const signIn = auth({ providers: { github: { clientId: "fake-client-id", clientSecret: { env: "PRIVATE_GITHUB_SECRET" } } } });

  /** Resolve `plugin` for a vault the way config resolution does, once every vault is known. */
  function resolveFor(plugin: NormalizedSvartzPlugin, others: unknown[] = [signIn]) {
    const vault = { id: "wiki", mountPath: "/wiki", target: { type: "node" }, plugins: [...others, plugin] } as unknown as ResolvedConfig;
    return plugin.forVault!({ vault, vaults: [vault] });
  }

  it("requires sign-in on the server and skips Turnstile in the editor and the guard", async () => {
    const { ctx } = await build({ signIn: { required: true }, guard: { turnstile } });

    expect(ctx.compiler?.browserResources.get("submissions")?.options).not.toHaveProperty("turnstileSiteKey");
    const plugin = submissions({ repo: "acme/wiki", signIn: { required: true }, guard: { turnstile } });
    expect(plugin.server?.options).toMatchObject({ guard: { signInRequired: true } });
    expect(plugin.server?.options).not.toHaveProperty("guard.turnstile");
    expect(resolveFor(plugin)).toBe(plugin);
  });

  it("refuses required sign-in on a vault without auth", () => {
    expect(() => resolveFor(submissions({ repo: "acme/wiki", signIn: { required: true } }), []))
      .toThrow(/vault "wiki" requires sign-in for submissions without auth/);
  });

  it("refuses a required flag that isn't true or false", () => {
    expect(() => submissions({ repo: "acme/wiki", signIn: { required: "yes" } } as unknown as Parameters<typeof submissions>[0]))
      .toThrow(/signIn\.required/);
  });
});

describe("submissions credentials config", () => {
  const privateKey = { env: "SVARTZ_GITHUB_APP_KEY" };
  const serverOptions = (options: Partial<Parameters<typeof submissions>[0]>) =>
    submissions({ repo: "acme/wiki", ...options }).server?.options;

  it("opens pull requests with the default token, or with the App alone when one is set", () => {
    expect(serverOptions({})).toMatchObject({ token: { env: "SVARTZ_GITHUB_TOKEN" } });
    const asApp = serverOptions({ app: { id: 1234567, privateKey, installation: 89012345 } });
    expect(asApp).toMatchObject({ app: { id: 1234567, privateKey, installation: 89012345 } });
    expect(asApp).not.toHaveProperty("token");
  });

  it.each([
    ["both a token and an App", { token: { env: "SVARTZ_GITHUB_TOKEN" }, app: { id: 1234567, privateKey } }, /either token or app/],
    ["a blank token name", { token: { env: " " } }, /token must name/],
    ["an App without an ID", { app: { id: "", privateKey } }, /app\.id/],
    ["an App with a negative ID", { app: { id: -1, privateKey } }, /app\.id/],
    ["an inlined private key", { app: { id: 1234567, privateKey: "-----BEGIN RSA PRIVATE KEY-----" } }, /privateKey must name/],
    ["a blank private key name", { app: { id: "Iv23liExample", privateKey: { env: "" } } }, /privateKey must name/],
    ["an installation that isn't an ID", { app: { id: 1234567, privateKey, installation: "acme" } }, /app\.installation/],
  ])("refuses %s when the config loads", (_case, options, message) => {
    expect(() => submissions({ repo: "acme/wiki", ...options } as Parameters<typeof submissions>[0])).toThrow(message);
  });
});
