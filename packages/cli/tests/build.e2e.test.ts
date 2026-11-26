import { access, cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { execFile, spawn } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";
import os from "node:os";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { deriveProtectionKey, openProtectedPayload, type ProtectedEnvelope, type ProtectedGroupPayload } from "@svartz/core";
import { getGeneratedHostStylesPath, getGeneratedHostRegistryPath } from "@svartz/vite";
import { chromium } from "playwright";
import { withVaultBuildLock } from "../src/build-lock";

const execFileAsync = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
/** A small static vault of the tests' own, so the repo's published vaults can change freely. */
const FIXTURE = "packages/cli/tests/fixtures/static-vault";
const VAULT_ID = "static-e2e";
const VAULT_ROOT = resolve(ROOT, ".svartz/vaults", VAULT_ID);
const DIST_ROOT = resolve(VAULT_ROOT, "dist");
const DIST_INDEX_PATH = resolve(DIST_ROOT, "index.html");
const DIST_NOT_FOUND_PATH = resolve(DIST_ROOT, "404.html");
const DIST_SITEMAP_PATH = resolve(DIST_ROOT, "sitemap.xml");

/** Runs `command` in the repository root, answering what it printed. */
async function run(command: string, args: string[]) {
  const { stdout } = await execFileAsync(command, args, {
    cwd: ROOT,
    env: process.env,
    maxBuffer: 20 * 1024 * 1024,
  });
  return stdout;
}

async function pnpm(args: string[]) {
  await run("corepack", ["pnpm", ...args]);
}

/** Builds the fixture vault as a static site, with `vault` overriding its config. */
async function buildFixture(vault: Record<string, unknown> = {}) {
  const configPath = resolve(ROOT, ".svartz-fixture-e2e.config.ts");
  try {
    await writeFile(configPath, `export default ${JSON.stringify({
      version: "1.0.0",
      vaults: [{ id: VAULT_ID, path: FIXTURE, target: { type: "static" }, site: { title: "Fixture" }, ...vault }],
    })};\n`);
    await run(process.execPath, ["packages/cli/dist/index.js", "build", "--config", configPath]);
  } finally {
    await rm(configPath, { force: true });
  }
}

describe("svartz CLI", () => {
  // Each build syncs the root's per-vault scripts and tasks from its config, so put back the ones the root config makes.
  const manifests = ["package.json", "turbo.json"].map((name) => resolve(ROOT, name));
  let manifestSources: string[] = [];
  beforeAll(async () => {
    manifestSources = await Promise.all(manifests.map((file) => readFile(file, "utf8")));
  });
  afterEach(async () => {
    await Promise.all(manifests.map((file, index) => writeFile(file, manifestSources[index]!)));
  });

  beforeAll(
    async () => {
      await pnpm(["--filter", "@svartz/core", "build"]);
      await pnpm(["--filter", "@svartz/config", "build"]);
      await pnpm(["--filter", "@svartz/plugins", "build"]);
      await pnpm(["--filter", "@svartz/vite", "build"]);
      await pnpm(["--filter", "svartz", "build"]);
    },
    240_000,
  );

  it(
    "builds a prerendered static vault from a clean output directory",
    async () => {
      await rm(DIST_ROOT, { recursive: true, force: true });

      await buildFixture();

      await expect(access(DIST_INDEX_PATH)).resolves.toBeUndefined();
      await expect(access(DIST_NOT_FOUND_PATH)).resolves.toBeUndefined();
      await expect(access(DIST_SITEMAP_PATH)).rejects.toMatchObject({ code: "ENOENT" });
      const guides = await readFile(resolve(DIST_ROOT, "folders/guides/index.html"), "utf8");
      expect(guides).toContain("Create Plugin");
      const utilities = await readFile(resolve(DIST_ROOT, "folders/plugins/utilities/index.html"), "utf8");
      expect(utilities).toContain("parse");
      const tag = await readFile(resolve(DIST_ROOT, "tags/guides/index.html"), "utf8");
      expect(tag).toContain("Create Plugin");

      const html = await readFile(DIST_INDEX_PATH, "utf8");
      expect(html).toContain("<title>");
      expect(html).toContain("data:image/png;base64,");
      expect(html).toContain("<h1");
      expect(html).not.toContain('aria-live="polite">Loading');
    },
    240_000,
  );

  it("links styled notes in the standalone shell without loading JavaScript", async () => {
    const notePath = resolve(ROOT, FIXTURE, "standalone-style.svx");
    const otherPath = resolve(ROOT, FIXTURE, "unrelated-style.svx");
    try {
      await writeFile(notePath, "<h1 class='standalone-tone'>Standalone style</h1><style>.standalone-tone { color: rgb(12, 34, 56); }</style>\n");
      await writeFile(otherPath, "<h1 class='unrelated-tone'>Unrelated style</h1><style>.unrelated-tone { color: rgb(78, 90, 12); }</style>\n");
      await buildFixture();
      const manifest = JSON.parse(await readFile(getGeneratedHostStylesPath(getGeneratedHostRegistryPath(VAULT_ROOT), VAULT_ID), "utf8")) as {
        shared: string[]; notes: Record<string, string[]>;
      };
      const styles = [...manifest.shared, ...manifest.notes["pages/standalone-style.svelte"]!];
      expect(styles.length).toBeGreaterThan(0);
      const css = (await Promise.all(styles.map((file) =>
        readFile(resolve(DIST_ROOT, file), "utf8")))).join("\n");
      expect(css).toMatch(/#0c2238|rgb\(12,\s*34,\s*56\)/);
      const html = await readFile(resolve(DIST_ROOT, "standalone-style/index.html"), "utf8");
      expect(html).toContain("Standalone style");
      expect(styles.some((file) => html.includes(file))).toBe(true);
      expect(manifest.notes["pages/unrelated-style.svelte"]?.length).toBeGreaterThan(0);
      expect(manifest.notes["pages/unrelated-style.svelte"]?.some((file) => html.includes(file))).toBe(false);
    } finally {
      await rm(notePath, { force: true });
      await rm(otherPath, { force: true });
    }
  }, 240_000);

  it("links CSS for every standalone vault built in one CLI process", async () => {
    const configPath = resolve(ROOT, ".svartz-multi-style-e2e.config.ts");
    const notePath = resolve(ROOT, FIXTURE, "multi-vault-style.svx");
    const ids = [VAULT_ID, `${VAULT_ID}-other`];
    try {
      await writeFile(notePath, "<h1 class='multi-tone'>Styled vault</h1><style>.multi-tone { color: rgb(12, 34, 56); }</style>\n");
      await writeFile(configPath, `export default {
        version: "1.0.0",
        vaults: ${JSON.stringify(ids)}.map((id) => ({ id, path: "${FIXTURE}",
          target: { type: "static" }, site: { title: id, url: "https://example.test" } })),
      };\n`);
      await run(process.execPath, ["packages/cli/dist/index.js", "build", "--config", configPath]);
      for (const id of ids) {
        const manifest = JSON.parse(await readFile(getGeneratedHostStylesPath(getGeneratedHostRegistryPath(resolve(ROOT, ".svartz/vaults", id)), id), "utf8")) as {
          shared: string[]; notes: Record<string, string[]>;
        };
        const styles = [...manifest.shared, ...manifest.notes["pages/multi-vault-style.svelte"]!];
        expect(styles.length).toBeGreaterThan(0);
        const html = await readFile(resolve(ROOT, `.svartz/vaults/${id}/dist/multi-vault-style/index.html`), "utf8");
        expect(styles.some((file) => html.includes(file))).toBe(true);
      }
    } finally {
      await rm(configPath, { force: true });
      await rm(notePath, { force: true });
    }
  }, 240_000);

  // Proves a vault with `theme.versions` publishes each git ref's docs below its id, with a picker that keeps the reader
  // on their page and a notice on deprecated pages, composed API and MCP themes alike, and reuses a snapshot's build.
  it("builds versioned reference docs from git refs", async () => {
    const repo = await mkdtemp(resolve(os.tmpdir(), "svartz-versions-"));
    const configPath = resolve(ROOT, ".svartz-versions-e2e.config.ts");
    const dist = resolve(ROOT, ".svartz/vaults/versions-e2e/dist");
    const git = (...args: string[]) => execFileAsync("git", ["-C", repo, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", ...args]);
    const build = (versions: unknown, target = "static") => writeFile(configPath, `export default ${JSON.stringify({
      version: "1.0.0",
      vaults: [{ id: "versions-e2e", path: resolve(repo, "docs"), target: { type: target }, site: { title: "Versions" },
        theme: { base: ["@svartz/theme-api-docs", "@svartz/theme-mcp-docs"], routes: { folders: "reference" }, versions } }],
    })};\n`).then(() => run(process.execPath, ["packages/cli/dist/index.js", "build", "--config", configPath]));
    const versions = [{ id: "v2", status: "latest" }, { id: "v1", ref: "docs-v1", status: "deprecated" }];
    try {
      // v1 lacks the set_notification tool and words get-pet differently; the working tree is v2.
      await git("init", "-q");
      await cp(resolve(ROOT, "vaults/showcase-reference"), resolve(repo, "docs"), { recursive: true });
      await rm(resolve(repo, "docs/mcp/set-notification.md"));
      const getPet = resolve(repo, "docs/rest/get-pet.md");
      await writeFile(getPet, `${await readFile(getPet, "utf8")}\nVersion one wording.\n`);
      await git("add", "-A");
      await git("commit", "-qm", "v1");
      await git("tag", "docs-v1");
      await rm(resolve(repo, "docs"), { recursive: true });
      await cp(resolve(ROOT, "vaults/showcase-reference"), resolve(repo, "docs"), { recursive: true });
      // v2 gives get-pet an alias, an ordinary permanent redirect.
      await writeFile(getPet, (await readFile(getPet, "utf8")).replace("---\n", "---\naliases: [rest/fetch-pet]\n"));

      // A build waiting on another's lock reads no version yet, so it can't swap files out from under that build.
      const snapshots = resolve(ROOT, ".svartz/vaults/versions-e2e/versions");
      await rm(snapshots, { recursive: true, force: true });
      let first!: Promise<string>;
      await withVaultBuildLock(ROOT, async () => {
        first = build(versions);
        await new Promise((done) => setTimeout(done, 5_000));
        await expect(access(snapshots)).rejects.toMatchObject({ code: "ENOENT" });
      });
      expect(await first).toContain('vault "versions-e2e@v1": built, and cached');
      const links = (html: string) => [...html.matchAll(/<a href="([^"]*)"[^>]*><span class="id[^"]*">([^<]*)/g)].map(([, href, id]) => [id, href]);

      const latest = await readFile(resolve(dist, "rest/get-pet/index.html"), "utf8");
      expect(latest).not.toContain("Version one wording.");
      expect(links(latest)).toEqual([["v2", "/rest/get-pet/"], ["v1", "/v1/rest/get-pet/"]]);
      // The latest version answers under its own id too, so a link to v2 keeps pointing at v2 once v3 ships.
      expect(await readFile(resolve(dist, "v2/rest/get-pet/index.html"), "utf8")).toMatch(/http-equiv="refresh" content="0;url=\/rest\/get-pet\/"/);
      // An MCP page only v2 has: v1's link lands on v1's home page.
      expect(links(await readFile(resolve(dist, "mcp/set-notification/index.html"), "utf8"))).toEqual([["v2", "/mcp/set-notification/"], ["v1", "/v1/"]]);
      const old = await readFile(resolve(dist, "v1/rest/get-pet/index.html"), "utf8");
      expect(old).toContain("Version one wording.");
      expect(old).toMatch(/Version v1 is deprecated\. <a href="\/rest\/get-pet\/"[^>]*>(?:<!--[^>]*-->)?Read this page in v2, the latest version/);
      await expect(access(resolve(dist, "v1/mcp/set-notification"))).rejects.toMatchObject({ code: "ENOENT" });

      expect(await build(versions)).toContain('vault "versions-e2e@v1": reused its build from the cache');
      await expect(build([...versions, { id: "v0", ref: "no-such-ref" }])).rejects.toThrow('git has no ref "no-such-ref"');

      // Cloudflare Pages takes the catch-all's prerendered redirects into `_redirects` with their status: an alias stays
      // permanent, and v2's own id is temporary, so no browser keeps sending /v2/ to the latest version once v3 ships.
      await build(versions, "cloudflare-pages");
      const redirects = await readFile(resolve(ROOT, ".svartz/vaults/versions-e2e/.svelte-kit/cloudflare/_redirects"), "utf8");
      expect(redirects).toContain("/rest/fetch-pet/ /rest/get-pet/ 308");
      expect(redirects).toContain("/v2/rest/get-pet/ /rest/get-pet/ 307");
    } finally {
      await rm(configPath, { force: true });
      await rm(repo, { recursive: true, force: true });
    }
  }, 240_000);

  describe("composes reference themes", () => {
    const configPath = resolve(ROOT, ".svartz-compose-e2e.config.ts");
    const compositePath = resolve(ROOT, ".svartz-compose-e2e-theme");
    const dist = resolve(ROOT, ".svartz/vaults/compose-e2e/dist");

    /** Builds the reference showcase with this theme `base`, then reads a REST and an MCP page. */
    async function buildReference(base: string | readonly string[]) {
      try {
        await writeFile(configPath, `export default {
          version: "1.0.0",
          vaults: [{ id: "compose-e2e", path: "vaults/showcase-reference", target: { type: "static" },
            theme: { base: ${JSON.stringify(base)}, version: "v2", routes: { folders: "reference" } },
            site: { title: "Composed reference" } }],
        };\n`);
        await run(process.execPath, ["packages/cli/dist/index.js", "build", "--config", configPath]);
        return {
          rest: await readFile(resolve(dist, "rest/get-pet/index.html"), "utf8"),
          mcp: await readFile(resolve(dist, "mcp/find-pets/index.html"), "utf8"),
        };
      } finally {
        await rm(configPath, { force: true });
      }
    }

    function expectReferencePages({ rest, mcp }: { rest: string; mcp: string }) {
      expect(rest).toContain("sv-reference-badge");
      expect(rest).toContain(">GET");
      expect(rest).toContain("Retrieve a pet");
      expect(rest).toContain("curl -X GET");
      expect(rest).toContain('id="explorer-tree"');
      expect(mcp).toContain("find_pets");
    }

    it("composes every theme a theme.base list names", async () => {
      expectReferencePages(await buildReference(["@svartz/theme-api-docs", "@svartz/theme-mcp-docs"]));
    }, 240_000);

    it("builds a composite theme package as a single base", async () => {
      const compose = (entry: string) => [
        `import { extensions as api } from '@svartz/theme-api-docs${entry}';`,
        `import { extensions as mcp } from '@svartz/theme-mcp-docs${entry}';`,
        `import { composeThemes } from '@svartz/theme-minimal${entry}';`,
        "export const extensions = [...api, ...mcp];",
        "export default (config) => composeThemes(extensions, config);",
        "",
      ].join("\n");
      try {
        await mkdir(compositePath, { recursive: true });
        await writeFile(resolve(compositePath, "package.json"), JSON.stringify({
          name: "@acme/reference-theme", type: "module", exports: { ".": "./index.js", "./runtime": "./runtime.js" },
        }));
        await writeFile(resolve(compositePath, "index.js"), compose(""));
        await writeFile(resolve(compositePath, "runtime.js"), compose("/runtime"));
        expectReferencePages(await buildReference(compositePath));
      } finally {
        await rm(compositePath, { recursive: true, force: true });
      }
    }, 240_000);
  });

  it("builds social images and favicon variants for a static vault", async () => {
    await buildFixture({ target: { type: "static", basePath: "/site" }, site: { title: "Docs", url: "https://example.test/site" } });
    // Crawlers never fetch /site/robots.txt, so a deployment below the origin root leaves it to the origin.
    await expect(access(resolve(DIST_ROOT, "robots.txt"))).rejects.toMatchObject({ code: "ENOENT" });
    await access(resolve(DIST_ROOT, "__svartz/social/index.png"));
    await access(resolve(DIST_ROOT, "__svartz/favicon.svg"));
    await access(resolve(DIST_ROOT, "__svartz/favicon-32.png"));
    await access(resolve(DIST_ROOT, "__svartz/apple-touch-icon.png"));
    await access(DIST_NOT_FOUND_PATH);
    await access(resolve(VAULT_ROOT, "artifacts/runtime-theme.ts"));
    await access(resolve(VAULT_ROOT, "artifacts/runtime-artifacts.ts"));
    const html = await readFile(resolve(DIST_ROOT, "index.html"), "utf8");
    expect(html).toContain("https://example.test/site/__svartz/social/index.png");
    expect(html).toContain('<link rel="canonical" href="https://example.test/site/"');
    expect(html).toContain('property="og:url" content="https://example.test/site/"');
    expect(html).toContain('href="https://example.test/site/__svartz/favicon.svg"');
    expect(html).not.toContain("/site/site/");
    expect(html).toContain('property="og:title"');
    expect(html).toContain("Static fixture home");
    const noteHtml = await readFile(resolve(DIST_ROOT, "guides/create-plugin/index.html"), "utf8");
    expect(noteHtml).toContain('<link rel="canonical" href="https://example.test/site/guides/create-plugin/"');
    expect(noteHtml).toContain('property="og:image" content="https://example.test/site/__svartz/social/guides/create-plugin.png"');
    expect(noteHtml).not.toContain("/site/site/");
    const sitemap = await readFile(DIST_SITEMAP_PATH, "utf8");
    expect(sitemap).toContain("<loc>https://example.test/site/</loc>");
    expect(sitemap).toContain("<loc>https://example.test/site/tags/guides/</loc>");
    expect(sitemap).not.toContain("404.html");
  }, 240_000);

  it("writes robots.txt for a vault at the origin root", async () => {
    await buildFixture({
      site: { title: "Docs", url: "https://example.test" },
      discovery: { robots: {
        training: false,
        contentSignals: { search: true, aiInput: true, aiTrain: false },
        rules: [{ userAgent: "Amazonbot", disallow: ["/drafts/"] }],
      } },
    });
    // A static target's output root is the origin root: this file is served as https://example.test/robots.txt.
    expect(await readFile(resolve(DIST_ROOT, "robots.txt"), "utf8")).toBe([
      "User-agent: *", "Content-Signal: search=yes, ai-input=yes, ai-train=no", "Disallow:", "",
      "User-agent: GPTBot", "User-agent: ClaudeBot", "User-agent: Google-Extended", "User-agent: Applebot-Extended",
      "User-agent: CCBot", "User-agent: Meta-ExternalAgent", "User-agent: Bytespider",
      "Content-Signal: search=yes, ai-input=yes, ai-train=no", "Disallow: /", "",
      "User-agent: Amazonbot", "Content-Signal: search=yes, ai-input=yes, ai-train=no", "Disallow: /drafts/", "",
      "Sitemap: https://example.test/sitemap.xml", "",
    ].join("\n"));
  }, 240_000);

  it("renders a mounted static vault below a standalone deployment base", async () => {
    await buildFixture({
      mountPath: "/blog", target: { type: "static", basePath: "/site" }, site: { title: "Docs", url: "https://example.test/site" },
    });
    const html = await readFile(resolve(DIST_ROOT, "blog/index.html"), "utf8");
    expect(html).toContain("Static fixture home");
    expect(html).toContain('href="https://example.test/site/blog/"');
    const registry = await readFile(resolve(VAULT_ROOT, ".svartz/host/runtime.ts"), "utf8");
    expect(registry).toContain('basePath: "/site"');
  }, 240_000);

  it("publishes a post's previous versions from git on a static vault, and nothing until a post opts in", async () => {
    const repo = await mkdtemp(resolve(os.tmpdir(), "svartz-versions-e2e-"));
    const vault = resolve(repo, "content");
    const configPath = resolve(ROOT, ".svartz-versions-e2e.config.ts");
    const dist = resolve(ROOT, ".svartz/vaults/versions-e2e/dist");
    const post = (frontmatter: string, body: string) => writeFile(resolve(vault, "posts/hello.md"), `---\ntitle: Hello\n${frontmatter}---\n\n${body}\n`);
    let day = 0;
    const commit = async (message: string) => {
      const date = `2026-01-${String(++day).padStart(2, "0")}T10:00:00Z`;
      await execFileAsync("git", ["-C", repo, "add", "-A"]);
      await execFileAsync("git", ["-C", repo, "-c", "user.name=Ada Lovelace", "-c", "user.email=ada@example.com", "commit", "-qm", message], {
        env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
      });
    };
    /** What each build said about its versions: how many it compiled, and how many it reused from the cache. */
    const reports: (string | undefined)[] = [];
    /** Builds the vault with `plugins`, then reads every file it emitted, without SvelteKit's per-build version stamp. */
    const build = async (plugins: string) => {
      await writeFile(configPath, `import { history } from ${JSON.stringify(resolve(ROOT, "packages/plugin-history/dist/index.js"))};
        export default { version: "1.0.0", vaults: [{ id: "versions-e2e", path: ${JSON.stringify(vault)},
          target: { type: "static" }, site: { title: "Versions" }, exclude: ["private/**"], plugins: ${plugins} }] };\n`);
      const { stdout } = await execFileAsync(process.execPath, ["packages/cli/dist/index.js", "build", "--config", configPath], {
        cwd: ROOT, env: process.env, maxBuffer: 20 * 1024 * 1024,
      });
      reports.push(stdout.split("\n").find((line) => line.startsWith("[history]")));
      const stamp = (JSON.parse(await readFile(resolve(dist, "_app/version.json"), "utf8")) as { version: string }).version;
      const files = await readdir(dist, { recursive: true, withFileTypes: true });
      return new Map(await Promise.all(files.filter((file) => file.isFile()).map(async (file) => {
        const path = resolve(file.parentPath, file.name);
        // The stamp, the global SvelteKit names after it, and the CSP hashes of the inline scripts holding both, which
        // are compared themselves.
        const contents = (await readFile(path, "utf8")).replaceAll(stamp, "<version>")
          .replace(/__sveltekit_[a-z0-9]+/g, "__sveltekit").replace(/'sha256-[A-Za-z0-9+/=]+'/g, "'sha256'");
        return [path.slice(dist.length), contents] as const;
      })));
    };
    try {
      await mkdir(resolve(vault, "posts"), { recursive: true });
      await execFileAsync("git", ["init", "-q", repo]);
      await post("", "First wording.");
      await commit("Write it");
      await post("", "Second wording.");
      await commit("Reword it");

      // With no post asking for its versions, the plugin changes no emitted file.
      const without = await build("[]");
      expect(await build('[history({ source: "git" })]')).toEqual(without);

      // Charts only versions show: one stays in the vault, one is redrawn and then deleted, one the vault excludes.
      await mkdir(resolve(vault, "media"));
      await mkdir(resolve(vault, "private"));
      await writeFile(resolve(vault, "media/chart.svg"), '<svg xmlns="http://www.w3.org/2000/svg">kept</svg>');
      await writeFile(resolve(vault, "media/gone.svg"), '<svg xmlns="http://www.w3.org/2000/svg">gone-one</svg>');
      await writeFile(resolve(vault, "private/secret.svg"), "<svg>SECRET-EXCLUDED</svg>");
      await post("versions: true\n", "Third wording, $x^2$.\n\n![Kept](../media/chart.svg)\n\n![Gone](../media/gone.svg)\n\n![Excluded](../private/secret.svg)");
      await commit("Publish its versions");
      await writeFile(resolve(vault, "media/draft-only.svg"), "<svg>SECRET-DRAFT</svg>");
      await post("versions: true\ndraft: true\n", "SECRET draft wording.\n\n![Draft](../media/draft-only.svg)");
      await commit("Draft SECRET-SUMMARY");
      await writeFile(resolve(vault, "media/gone.svg"), '<svg xmlns="http://www.w3.org/2000/svg">gone-two</svg>');
      await post("versions: true\n", "Fourth wording.\n\n![Gone](../media/gone.svg)");
      await commit("Redraw it");
      await rm(resolve(vault, "media/gone.svg"));
      await post("versions: true\n", "Fifth wording.");
      await commit("Finish it");
      const emitted = await build('[history({ source: "git" })]');

      const [finish, redraw, draft, publish, reword, write] = (await execFileAsync("git", ["-C", repo, "log", "--format=%h", "--abbrev=7"])).stdout.trim().split("\n");
      const listing = emitted.get("/posts/hello/versions/index.html")!;
      expect(listing).toContain("<title>Versions of Hello | Versions</title>");
      expect(listing).toContain('<meta name="robots" content="noindex"');
      expect([...listing.matchAll(/<a href="([0-9a-f]+\/)"/g)].map(([, href]) => href)).toEqual([finish, redraw, publish, reword, write].map((sha) => `${sha}/`));
      const latest = emitted.get(`/posts/hello/versions/${finish}/index.html`)!;
      expect(latest).toContain("<del>Fourth wording.</del>");
      expect(latest).toContain("<ins>Fifth wording.</ins>");
      expect(latest).toContain("<p>Fifth wording.</p>");
      expect(emitted.has(`/posts/hello/versions/${draft}/index.html`)).toBe(false);
      // The version with charts renders its math with KaTeX, as the note would, and finds the chart still in the vault.
      const charted = emitted.get(`/posts/hello/versions/${publish}/index.html`)!;
      expect(charted).toContain('class="katex"');
      expect(charted).toContain('src="../../../../media/chart.svg"');
      expect(emitted.get("/media/chart.svg")).toContain("kept");
      // Each version shows the deleted chart as its own commit held it.
      const gone = (sha: string | undefined) => {
        const page = `/posts/hello/versions/${sha}/`;
        const src = /src="([^"]*gone\.svg)"/.exec(emitted.get(`${page}index.html`)!)![1]!;
        return emitted.get(decodeURIComponent(new URL(src, `https://example.test${page}`).pathname));
      };
      expect(gone(publish)).toContain("gone-one");
      expect(gone(redraw)).toContain("gone-two");
      expect(emitted.has("/media/gone.svg")).toBe(false);
      expect(emitted.has("/private/secret.svg")).toBe(false);
      expect(emitted.has("/media/draft-only.svg")).toBe(false);
      for (const [path, contents] of emitted) expect(contents, path).not.toMatch(/SECRET|ada@example\.com/);

      // A second build compiles no version, reusing each from the cache, and emits the same files. The cache holds
      // nothing of the hidden draft.
      expect(reports.at(-1)).toMatch(/compiled 5 versions, reused 0 from the cache/);
      const again = await build('[history({ source: "git" })]');
      expect(reports.at(-1)).toMatch(/compiled 0 versions, reused 5 from the cache/);
      expect(again).toEqual(emitted);
      const cached = resolve(ROOT, ".svartz/vaults/versions-e2e/cache/versions");
      const entries = await readdir(cached);
      expect(entries).toHaveLength(5);
      for (const entry of entries) expect(await readFile(resolve(cached, entry), "utf8"), entry).not.toMatch(/SECRET|ada@example\.com/);
    } finally {
      await rm(configPath, { force: true });
      await rm(repo, { recursive: true, force: true });
      await rm(resolve(ROOT, ".svartz/vaults/versions-e2e"), { recursive: true, force: true });
    }
  }, 480_000);

  it("publishes protected SVX as sealed static output only", async () => {
    const configPath = resolve(ROOT, ".svartz-protected-e2e.config.ts");
    const dist = resolve(ROOT, ".svartz/vaults/protected-e2e/dist");
    const previousPassword = process.env.SVARTZ_TEST_PROTECTED_PASSWORD;
    const previousSecondPassword = process.env.SVARTZ_TEST_SECOND_PASSWORD;
    process.env.SVARTZ_TEST_PROTECTED_PASSWORD = "e2e-only-password";
    process.env.SVARTZ_TEST_SECOND_PASSWORD = "second-e2e-password";
    try {
      await writeFile(configPath, `export default {
        version: "1.0.0",
        passwordGroups: { friends: { env: "SVARTZ_TEST_PROTECTED_PASSWORD" }, family: { env: "SVARTZ_TEST_SECOND_PASSWORD" } },
        vaults: [{ id: "protected-e2e", path: "packages/cli/tests/fixtures/protected-vault",
          target: { type: "static" }, site: { title: "Protected fixture" } }],
      };\n`);
      await run(process.execPath, ["packages/cli/dist/index.js", "build", "--config", configPath]);

      const html = await readFile(resolve(dist, "locked/index.html"), "utf8");
      expect(html).toContain("Unlock note");
      expect(html).not.toContain("PRIVATE_BODY_MARKER");
      expect(html).toContain('http-equiv="content-security-policy"');
      expect(html).toContain("script-src 'self' blob:");
      await expect(access(resolve(dist, "photo.svg"))).rejects.toMatchObject({ code: "ENOENT" });
      const payloadFiles = await readdir(resolve(dist, "__svartz/protected"));
      expect(payloadFiles).toHaveLength(2);
      const envelopes = await Promise.all(payloadFiles.map(async (file) => {
        expect(file).toMatch(/^[A-Za-z0-9_-]+\.json$/);
        return JSON.parse(await readFile(resolve(dist, "__svartz/protected", file), "utf8")) as ProtectedEnvelope;
      }));
      let payload: ProtectedGroupPayload | undefined;
      for (const envelope of envelopes) {
        const key = await deriveProtectionKey("e2e-only-password", envelope.salt);
        try {
          payload = JSON.parse(new TextDecoder().decode(await openProtectedPayload(key, envelope, envelope.id))) as ProtectedGroupPayload;
          break;
        } catch { /* The other group has a different password. */ }
      }
      if (!payload) throw new Error("Friends group was not sealed with its configured password");
      expect(payload.js).toContain("PRIVATE_BODY_MARKER");
      expect(payload.search.map((item: { slug: string }) => item.slug)).toEqual(["locked"]);
      expect(payload.graph.index).toContain("locked");
      expect(payload.assets[0].path).toBe("photo.svg");

      for (const directory of [dist, resolve(ROOT, ".svartz/vaults/protected-e2e/artifacts"), resolve(ROOT, ".svartz/vaults/protected-e2e/.svelte-kit/output")]) {
        const files = await readdir(directory, { recursive: true, withFileTypes: true });
        for (const file of files) {
          if (!file.isFile()) continue;
          const contents = await readFile(resolve(file.parentPath, file.name));
          expect(contents.toString("utf8")).not.toMatch(
            /PRIVATE_BODY_MARKER|PRIVATE_DESCRIPTION_MARKER|PRIVATE_ASSET_MARKER|PRIVATE_HIDDEN_TITLE_MARKER|PRIVATE_HIDDEN_BODY_MARKER|PRIVATE_MERMAID_MARKER|SECOND_PRIVATE_MARKER|e2e-only-password|second-e2e-password/,
          );
        }
      }

      const server = createServer(async (request, response) => {
        const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
        const file = resolve(dist, `.${pathname}`, pathname.endsWith("/") ? "index.html" : "");
        try {
          const body = await readFile(file);
          const type = file.endsWith(".html") ? "text/html" : file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : file.endsWith(".json") ? "application/json" : "application/octet-stream";
          response.writeHead(200, { "content-type": type });
          response.end(body);
        } catch {
          response.writeHead(404);
          response.end();
        }
      });
      server.listen(0, "127.0.0.1");
      await once(server, "listening");
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Static server has no port");
      const browserPort = address.port + 1;
      const browserProfile = await mkdtemp(resolve(os.tmpdir(), "svartz-static-browser-"));
      const browserProcess = spawn(chromium.executablePath(), [
        "--headless=new", "--no-sandbox", "--disable-dev-shm-usage",
        `--remote-debugging-port=${browserPort}`,
        `--user-data-dir=${browserProfile}`,
      ], { stdio: "ignore" });
      try {
        let browser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | undefined;
        for (let attempt = 0; attempt < 50; attempt++) {
          try {
            browser = await chromium.connectOverCDP(`http://127.0.0.1:${browserPort}`);
            break;
          } catch {
            if (browserProcess.exitCode !== null) throw new Error("Chromium exited before CDP was ready");
            await new Promise((done) => setTimeout(done, 100));
          }
        }
        if (!browser) throw new Error("Chromium CDP did not become ready");
        try {
          const page = await browser.contexts()[0]!.newPage();
          // Desktop width: on phones the minimal theme moves the explorer into a closed drawer.
          await page.setViewportSize({ width: 1280, height: 800 });
          const cdp = await page.context().newCDPSession(page);
          await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true });
          const errors: string[] = [];
          page.on("pageerror", (error) => errors.push(error.message));
          page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
          await page.goto(`http://127.0.0.1:${address.port}/tags/guides/`);
          await page.getByRole("heading", { level: 1, name: "guides" }).waitFor();
          // The prerendered button takes a click before hydration gives it its handler, so press until the dialog opens.
          const search = page.getByRole("combobox", { name: "Search notes" });
          await expect.poll(async () => {
            if (!await search.isVisible()) await page.getByRole("button", { name: /^Search/ }).click();
            return search.isVisible();
          }, { timeout: 30_000, interval: 500 }).toBe(true);
          expect(errors).toEqual([]);
          await page.goto(`http://127.0.0.1:${address.port}/`);
          await page.locator("pre.svartz-mermaid svg").waitFor({ timeout: 10_000 });
          await page.getByRole("navigation", { name: "Explorer" }).getByRole("link", { name: "Locked title", exact: true }).click();
          await page.getByLabel("Password").fill("e2e-only-password");
          await page.getByRole("button", { name: "Unlock note" }).click();
          await page.getByText("PRIVATE_BODY_MARKER").waitFor({ timeout: 10_000 });
          await page.locator("pre.svartz-mermaid svg").waitFor({ timeout: 10_000 });
          expect(await page.getByRole("button", { name: "Count: 0" }).count()).toBe(1);
          await page.getByRole("navigation", { name: "Explorer" }).getByRole("link", { name: "Second locked title" }).click();
          await page.getByLabel("Password").fill("second-e2e-password");
          await page.getByRole("button", { name: "Unlock note" }).click();
          await page.getByText("SECOND_PRIVATE_MARKER").waitFor({ timeout: 10_000 });
          await page.getByRole("button", { name: "Lock note" }).click();
          await page.getByLabel("Password").waitFor();
          await page.getByRole("navigation", { name: "Explorer" }).getByRole("link", { name: "Locked title", exact: true }).click();
          await page.getByText("PRIVATE_BODY_MARKER").waitFor({ timeout: 10_000 });
          expect(errors).toEqual([]);
          await cdp.detach();
          await page.close();
        } finally {
          await browser.close();
        }
      } finally {
        browserProcess.kill("SIGTERM");
        if (browserProcess.exitCode === null) await once(browserProcess, "exit");
        await rm(browserProfile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
        server.close();
        await once(server, "close");
      }
    } finally {
      await rm(configPath, { force: true });
      await rm(resolve(ROOT, ".svartz/vaults/protected-e2e"), { recursive: true, force: true });
      if (previousPassword === undefined) delete process.env.SVARTZ_TEST_PROTECTED_PASSWORD;
      else process.env.SVARTZ_TEST_PROTECTED_PASSWORD = previousPassword;
      if (previousSecondPassword === undefined) delete process.env.SVARTZ_TEST_SECOND_PASSWORD;
      else process.env.SVARTZ_TEST_SECOND_PASSWORD = previousSecondPassword;
    }
  }, 240_000);
});
