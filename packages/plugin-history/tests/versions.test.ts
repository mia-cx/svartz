/**
 * Previous versions read from git (`history({ source: "git" })`), through the build pipeline itself: Svartz's core
 * plugins and this one, on a vault in a temporary repository with real commits. Each page's HTML is read from the
 * page artifact the build hands SvelteKit, so the assertions cover exactly what prerenders.
 */
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { resolveConfig } from "@svartz/config";
import { getCompilerContributions, runStages, type PluginContext } from "@svartz/core";
import { createCorePlugins } from "@svartz/plugins";
import { afterEach, describe, expect, it, vi } from "vitest";
import { history } from "../src/index";

// Svartz's own code, by content, as the version cache keys it: a test changes it to stand for a new release.
const software = vi.hoisted(() => ({ fingerprint: "svartz-1" }));
vi.mock("../src/software", () => ({ softwareFingerprint: async () => software.fingerprint }));

const exec = promisify(execFile);
const EMAIL = "ada@example.com";
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

/** A repository whose vault is its `content/` folder, committing a day apart from 1 January 2026. */
async function repository() {
  const root = await mkdtemp(join(tmpdir(), "svartz-versions-"));
  roots.push(root);
  const vault = join(root, "content");
  await mkdir(join(vault, "posts"), { recursive: true });
  await exec("git", ["init", "-q", root]);
  // The build writes beside the vault, its version cache included.
  await writeFile(join(root, ".gitignore"), ".svartz/\n");
  let day = 0;
  return {
    root,
    vault,
    write: (path: string, text: string) => writeFile(join(vault, path), text),
    move: (from: string, to: string) => rename(join(vault, from), join(vault, to)),
    async commit(message: string, author = "Ada Lovelace") {
      day++;
      const date = `2026-01-${String(day).padStart(2, "0")}T10:00:00Z`;
      await exec("git", ["-C", root, "add", "-A"]);
      await exec("git", ["-C", root, "-c", `user.name=${author}`, "-c", `user.email=${EMAIL}`, "commit", "-qm", message], {
        env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
      });
    },
  };
}

const post = (body: string, frontmatter = "versions: true") => `---\ntitle: Hello\n${frontmatter}\n---\n\n${body}\n`;

/** Builds the vault at `vault` with `plugin`, as `svartz build` runs the pipeline, minus SvelteKit. */
async function build(vault: string, plugins: unknown[] = [history({ source: "git" })], options: Record<string, unknown> = {}) {
  const set = await resolveConfig(
    { version: "1.0.0", vaults: [{ id: "blog", path: vault, target: { type: "static" }, site: { title: "Blog" }, plugins, ...options }] },
    dirname(vault),
  );
  const config = set.vaults[0]!;
  const ctx: PluginContext = {
    config,
    plugins: [...createCorePlugins(), ...config.plugins],
    files: [],
    artifacts: new Map(),
    meta: new Map([["svartz:protectionReady", true]]),
  };
  const info = vi.spyOn(console, "info").mockImplementation(() => {});
  let lines: string[];
  try {
    await runStages(ctx.plugins!, ctx);
  } finally {
    lines = info.mock.calls.map((call) => String(call[0]));
    info.mockRestore();
  }
  /** How many versions this build compiled, and how many it reused from the cache, as it reports them. */
  const report = lines.find((line) => line.startsWith("[history]"));
  const counted = report && /compiled (\d+) versions?, reused (\d+)/.exec(report);
  const cache = counted ? { compiled: Number(counted[1]), reused: Number(counted[2]) } : undefined;
  const routes = ctx.index!.routes.all;
  /** The markup of the page component at `pathname`, as the build hands it to SvelteKit: a note's or a version's. */
  const page = (pathname: string) => {
    const source = ctx.artifacts.get(`pages/${pathname.replace(/^\/+|\/+$/g, "")}.svelte`)?.contents;
    if (typeof source !== "string") return undefined;
    const head = source.indexOf("</svelte:head>");
    return source.slice(head >= 0 ? head + "</svelte:head>".length : source.lastIndexOf("</script>") + "</script>".length).trim();
  };
  /** The bytes of the attachment the build publishes at `path` in the vault. */
  const asset = (path: string) => ctx.artifacts.get(`assets/${path}`)?.contents;
  const versions = routes.filter((route) => route.includes("/versions/"));
  const everything = [...ctx.artifacts.values()].map(({ contents }) => String(contents)).join("\n");
  const link = getCompilerContributions(ctx).browserResources.get("history")?.options;
  return { ctx, routes, versions, page, asset, everything, link, cache };
}

describe("previous versions from git", () => {
  // Proves an opted-in post lists its versions newest first, each opening its own page with the diff from the
  // version before and the post as it read then, and the post's own page links them; across a rename.
  it("lists every version of an opted-in post, each with its own page, across a rename", async () => {
    const repo = await repository();
    await repo.write("posts/old-name.md", post("First wording."));
    await repo.commit("Write the first draft");
    await repo.write("posts/old-name.md", post("Second wording."));
    await repo.commit("Reword it\n\nA longer explanation that never shows.", "Grace Hopper");
    await repo.move("posts/old-name.md", "posts/hello.md");
    await repo.commit("Rename the post");
    await repo.write("posts/hello.md", post("Third wording, with [a link](other.md)."));
    await repo.write("posts/other.md", "---\ntitle: Other\n---\n\nAnother post.\n");
    await repo.commit("Add a link <b>and</b> a second post");

    const { versions, page, link } = await build(repo.vault);

    const shas = (await exec("git", ["-C", repo.root, "log", "--format=%h", "--abbrev=7"])).stdout.trim().split("\n");
    expect(versions).toEqual([
      "/posts/hello/versions/",
      ...shas.map((sha) => `/posts/hello/versions/${sha}/`).sort(),
    ]);
    expect(link).toEqual({ pages: ["/posts/hello/"] });

    const listing = page("/posts/hello/versions/")!;
    expect([...listing.matchAll(/href="([^"]+)"/g)].map(([, href]) => href)).toEqual(["../", ...shas.map((sha) => `${sha}/`)]);
    expect(listing).toContain("Grace Hopper");
    expect(listing).toContain("Reword it");
    expect(listing).toContain("Rename the post");
    expect(listing).not.toContain("A longer explanation");
    expect(listing).toContain("Add a link &#60;b&#62;and&#60;/b&#62; a second post");
    expect(listing).not.toContain(EMAIL);

    // The rename's version follows the one before it at the old path.
    const renamed = page(`/posts/hello/versions/${shas[1]}/`)!;
    expect(renamed).toContain("The source is the same in both versions.");
    const latest = page(`/posts/hello/versions/${shas[0]}/`)!;
    expect(latest).toContain("<del>Second wording.</del>");
    expect(latest).toContain("<ins>Third wording, with [a link](other.md).</ins>");
    // Rendered with the build's Markdown steps, its link relative to the version's own page.
    expect(latest).toContain('"href":"../../../other/"');
    expect(latest).toContain('href="../../">Hello</a>');
    expect(latest).toContain(`<a href="../${shas[1]}/">Older version</a>`);
    const first = page(`/posts/hello/versions/${shas[3]}/`)!;
    expect(first).toContain("No earlier version");
    expect(first).toContain("<ins>First wording.</ins>");
  });

  // Proves a version renders through the vault's own steps, math included, exactly as the note renders: the version
  // that matches the note today holds the note's own markup.
  it("renders a version with the vault's own Markdown steps, as the note renders", async () => {
    const repo = await repository();
    await repo.write("posts/hello.md", post("No math yet."));
    await repo.commit("Write it");
    await repo.write("posts/hello.md", post("Now $x^2$ and ==highlighted== text.\n\n> [!note] A callout\n> Inside it."));
    await repo.commit("Add math");

    const { page } = await build(repo.vault);

    const shas = (await exec("git", ["-C", repo.root, "log", "--format=%h", "--abbrev=7"])).stdout.trim().split("\n");
    const note = page("/posts/hello/")!;
    expect(note).toContain('class="katex"');
    expect(page(`/posts/hello/versions/${shas[0]}/`)).toContain(note);
  });

  // Proves a version that embeds another note renders the embed exactly as the note's own page does, math included,
  // though the version's own text holds no math.
  it("renders a version's embeds with the build's steps, as the note renders them", async () => {
    const repo = await repository();
    await repo.write("posts/other.md", "---\ntitle: Other\n---\n\nA fraction: $\\frac{a}{b}$.\n");
    await repo.write("posts/hello.md", post("Nothing embedded yet."));
    await repo.commit("Write them");
    await repo.write("posts/hello.md", post("![[other]]"));
    await repo.commit("Embed the other post");

    const { page } = await build(repo.vault);

    const shas = (await exec("git", ["-C", repo.root, "log", "--format=%h", "--abbrev=7"])).stdout.trim().split("\n");
    const note = page("/posts/hello/")!;
    expect(note).toContain('class="katex"');
    expect(page(`/posts/hello/versions/${shas[0]}/`)).toContain(note.replaceAll('"../other/"', '"../../../other/"'));
  });

  // Proves a version's page shows the attachments it referenced: one the vault still holds (and no note references
  // now) at its own path, and one gone from the vault as that version's commit held it, so two versions that showed
  // different contents of it each show their own.
  it("publishes the attachments a shown version references, each version's own bytes", async () => {
    const repo = await repository();
    await mkdir(join(repo.vault, "media"));
    await repo.write("media/kept.svg", "<svg>kept</svg>");
    await repo.write("media/chart.svg", "<svg>first-chart</svg>");
    // Also from the site's root, as a responsive source: it names the same file, so it follows the file too.
    await repo.write("posts/hello.md", post('![Kept](../media/kept.svg)\n\n![[chart.svg]]\n\n<picture><source srcset="/media/chart.svg 1x"><img src="/media/chart.svg" alt="Root"></picture>'));
    await repo.commit("Draw it");
    await repo.write("media/chart.svg", "<svg>second-chart</svg>");
    await repo.write("posts/hello.md", post("![Kept](../media/kept.svg)\n\n![[chart.svg]]\n\nRedrawn."));
    await repo.commit("Redraw it");
    await rm(join(repo.vault, "media/chart.svg"));
    await repo.write("posts/hello.md", post("No charts any more."));
    await repo.commit("Drop the charts");

    const { page, asset } = await build(repo.vault);

    const shas = (await exec("git", ["-C", repo.root, "log", "--format=%h", "--abbrev=7"])).stdout.trim().split("\n");
    /** The bytes the image `name` on the version page at `pathname` shows, following its URL to the published file. */
    const shown = (pathname: string, name: string) => {
      const src = new RegExp(`"src":"([^"]*${name})"`).exec(page(pathname)!)![1]!;
      return String(asset(decodeURIComponent(new URL(src, `https://example.test${pathname}`).pathname.slice(1))));
    };
    for (const sha of [shas[1], shas[2]]) {
      expect(page(`/posts/hello/versions/${sha}/`)).toContain('"src":"../../../../media/kept.svg"');
      expect(shown(`/posts/hello/versions/${sha}/`, "kept.svg")).toBe("<svg>kept</svg>");
    }
    expect(shown(`/posts/hello/versions/${shas[2]}/`, "chart.svg")).toBe("<svg>first-chart</svg>");
    expect(shown(`/posts/hello/versions/${shas[1]}/`, "chart.svg")).toBe("<svg>second-chart</svg>");
    expect(asset("media/chart.svg")).toBeUndefined();
    // No root-relative URL is left pointing where the deleted file was, in a source or an image.
    expect(page(`/posts/hello/versions/${shas[2]}/`)).not.toMatch(/"\/media\/chart\.svg/);
    expect(page(`/posts/hello/versions/${shas[2]}/`)).toMatch(/srcset=\\*"\.\.\/files\/[0-9a-f]{12}\/chart\.svg 1x\\*"/);
  });

  // Proves nothing of a version the build would have hidden shows anywhere: not listed, not as the next version's
  // "before", not in any file the build emits, its attachments included; an attachment the vault excludes stays out
  // though a shown version references it; and a summary naming a file the site doesn't publish stays out.
  it("never shows a draft, private, protected or excluded version, nor a summary naming an unpublished file", async () => {
    const repo = await repository();
    await mkdir(join(repo.vault, "drafts"));
    await mkdir(join(repo.vault, "media"));
    await repo.write("drafts/hello.md", post("SECRET in an excluded folder."));
    await repo.write("drafts/secret.svg", "<svg>SECRET-ASSET-EXCLUDED</svg>");
    await repo.commit("Start in drafts");
    await repo.move("drafts/hello.md", "posts/hello.md");
    await repo.write("posts/hello.md", post("Public one.\n\n![Excluded](../drafts/secret.svg)"));
    await repo.commit("Publish it");
    await repo.write("posts/hello.md", post("SECRET draft wording.\n\n![Draft](../media/draft-only.svg)", "versions: true\ndraft: true"));
    await repo.write("media/draft-only.svg", "<svg>SECRET-ASSET-DRAFT</svg>");
    await repo.commit("Draft SECRET-SUMMARY");
    await repo.write("posts/hello.md", post("SECRET private wording.", "versions: true\nprivate: true"));
    await repo.commit("Hide it");
    await repo.write("posts/hello.md", post("SECRET protected wording.", "versions: true\npassword_group: friends"));
    await repo.commit("Protect it");
    await repo.write("posts/hello.md", post("Public two."));
    await repo.write("posts/diary.md", "---\nprivate: true\n---\n\nSECRET diary.\n");
    await repo.commit("Publish again and write in SECRET-DIARY");

    const { versions, page, asset, everything } = await build(repo.vault, [history({ source: "git" })], { exclude: ["drafts/**"] });

    const shas = (await exec("git", ["-C", repo.root, "log", "--format=%h", "--abbrev=7"])).stdout.trim().split("\n");
    expect(versions).toEqual(["/posts/hello/versions/", `/posts/hello/versions/${shas[0]}/`, `/posts/hello/versions/${shas[4]}/`].sort());
    expect(asset("drafts/secret.svg")).toBeUndefined();
    // The excluded chart's link shows unresolved, as a link to a missing note does, so nothing points at the file.
    expect(page(`/posts/hello/versions/${shas[4]}/`)).toMatch(/<span class="svartz-unresolved-link"[^>]*>Excluded<\/span>/);
    expect(asset("media/draft-only.svg")).toBeUndefined();
    expect(everything).not.toMatch(/SECRET|Start in drafts|Publish it|Hide it|Protect it/);
    expect(everything).not.toContain(EMAIL);
    const latest = page(`/posts/hello/versions/${shas[0]}/`)!;
    expect(latest).toContain("<del>Public one.</del>");
    expect(latest).toContain("<ins>Public two.</ins>");
  });

  // Proves the cap bounds a post's versions, and says older ones aren't listed; the oldest listed still diffs from
  // the version before it.
  it("lists only the latest maxVersions versions, and says so", async () => {
    const repo = await repository();
    for (const wording of ["One.", "Two.", "Three.", "Four."]) {
      await repo.write("posts/hello.md", post(wording));
      await repo.commit(`Say ${wording}`);
    }

    const { versions, page } = await build(repo.vault, [history({ source: "git", maxVersions: 2 })]);

    const shas = (await exec("git", ["-C", repo.root, "log", "--format=%h", "--abbrev=7"])).stdout.trim().split("\n");
    expect(versions).toEqual(["/posts/hello/versions/", `/posts/hello/versions/${shas[0]}/`, `/posts/hello/versions/${shas[1]}/`].sort());
    expect(page("/posts/hello/versions/")).toContain("Only the latest 2 versions are listed.");
    const oldest = page(`/posts/hello/versions/${shas[1]}/`)!;
    expect(oldest).toContain("<del>Two.</del>");
    expect(oldest).not.toContain("Older version");
  });

  // Proves a vault where no post has two versions to show builds exactly as it would without the plugin.
  it("adds nothing for a post that doesn't opt in, or has one version", async () => {
    const repo = await repository();
    await repo.write("posts/hello.md", post("One.", ""));
    await repo.write("posts/single.md", post("Only once."));
    await repo.commit("Write");
    await repo.write("posts/hello.md", post("Two.", ""));
    await repo.commit("Edit");

    const withPlugin = await build(repo.vault);
    const without = await build(repo.vault, []);

    expect(withPlugin.versions).toEqual([]);
    expect(withPlugin.link).toBeUndefined();
    expect(withPlugin.routes).toEqual(without.routes);
    expect([...withPlugin.ctx.artifacts.keys()]).toEqual([...without.ctx.artifacts.keys()]);
  });

  // Proves a shallow clone fails the build instead of showing a short history, saying how to fetch the rest.
  it("fails the build of a shallow clone, naming the vault and the checkout setting", async () => {
    const repo = await repository();
    for (const wording of ["One.", "Two."]) {
      await repo.write("posts/hello.md", post(wording));
      await repo.commit(`Say ${wording}`);
    }
    const clone = await mkdtemp(join(tmpdir(), "svartz-versions-shallow-"));
    roots.push(clone);
    await exec("git", ["clone", "-q", "--depth", "1", `file://${repo.root}`, clone]);

    const failure = await build(join(clone, "content")).catch((error: { errors?: { message: string }[] }) => error);

    expect((failure as { errors: { message: string }[] }).errors.map(({ message }) => message).join("\n")).toMatch(
      /\[history\] vault "blog" shows previous versions, but its repository is a shallow clone .*Fetch the full history: with actions\/checkout, set fetch-depth: 0/,
    );
  });

  // Proves a post's name is read as a name, never a pattern: `a?.md` lists its own versions, not those of `ab.md`,
  // which the pattern would match.
  it("reads a post's history by its exact name, wildcards and all", async () => {
    const repo = await repository();
    await repo.write("posts/a?.md", post("A question."));
    await repo.write("posts/ab.md", post("SECRET-OTHER-POST first.", "versions: false"));
    await repo.commit("Start both");
    await repo.write("posts/ab.md", post("SECRET-OTHER-POST second.", "versions: false"));
    await repo.commit("Change the other one");
    await repo.write("posts/a?.md", post("A better question."));
    await repo.commit("Reword the question");

    const { versions, page } = await build(repo.vault);
    const listing = versions.find((route) => route.endsWith("/versions/"))!;

    // Two versions of its own; the commit that changed only the other post isn't one.
    expect(versions.filter((route) => route.startsWith(listing) && route !== listing)).toHaveLength(2);
    expect(page(listing)).toContain("Reword the question");
    expect(page(listing)).not.toContain("Change the other one");
  });

  // Proves a version whose frontmatter the build couldn't read never shows: such a version may say `draft: true`
  // beside a value that breaks the block, and the build would refuse the note.
  it("never shows a version whose frontmatter can't be read", async () => {
    const repo = await repository();
    await repo.write("posts/hello.md", post("Public first."));
    await repo.commit("Publish it");
    await repo.write("posts/hello.md", post("SECRET-UNREADABLE draft.", "versions: true\ndraft: true\ntitle: Broken: colon: here"));
    await repo.commit("Draft a change");
    await repo.write("posts/hello.md", post("Public again."));
    await repo.commit("Publish again");

    const { versions, everything } = await build(repo.vault);

    expect(versions.filter((route) => route !== "/posts/hello/versions/")).toHaveLength(2);
    expect(everything).not.toContain("SECRET-UNREADABLE");
  });

  // Proves an old version a plugin can't read doesn't stop the build, since it can't be edited: its page shows its
  // changes and says it can't be shown as it read. A fatal error still stops the build.
  it("shows an old version a plugin can't read without its rendered page, unless the error is fatal", async () => {
    const repo = await repository();
    await repo.write("posts/hello.md", post("BREAKS-THE-PLUGIN once."));
    await repo.commit("Write it");
    await repo.write("posts/hello.md", post("Fine now."));
    await repo.commit("Fix it");
    /** A plugin that fails on any file holding the marker, fatally or not. */
    const breaking = (fatal: boolean) => ({
      id: "breaking",
      transformOfm: {
        options: { fatal },
        run: (ctx: PluginContext) => {
          if (ctx.files.some(({ content }) => content.includes("BREAKS-THE-PLUGIN"))) throw new Error("can't read this");
        },
      },
    });

    const { page } = await build(repo.vault, [history({ source: "git" }), breaking(false)]);
    const shas = (await exec("git", ["-C", repo.root, "log", "--format=%h", "--abbrev=7"])).stdout.trim().split("\n");

    expect(page(`/posts/hello/versions/${shas[1]}/`)).toContain("This version can't be shown as it read. Its changes are above.");
    expect(page(`/posts/hello/versions/${shas[1]}/`)).toContain("<ins>BREAKS-THE-PLUGIN once.</ins>");
    expect(page(`/posts/hello/versions/${shas[0]}/`)).not.toContain("can't be shown as it read");
    await expect(build(repo.vault, [history({ source: "git" }), breaking(true)])).rejects.toThrow();
  });
});

describe("the version cache", () => {
  /** A post with three versions, the newest linking `posts/other.md`. */
  async function threeVersions() {
    const repo = await repository();
    await repo.write("posts/other.md", "---\ntitle: Other\n---\n\nAnother post.\n");
    for (const wording of ["One.", "Two.", "Three, see [[other]]."]) {
      await repo.write("posts/hello.md", post(wording));
      await repo.commit(`Say ${wording}`);
    }
    return repo;
  }
  /** Every page and file the build hands SvelteKit, by key. */
  const emitted = ({ ctx }: Awaited<ReturnType<typeof build>>) =>
    new Map([...ctx.artifacts].map(([key, { contents }]) => [key, String(contents)]));
  /** The entries in the vault's version cache. */
  const entries = async (repo: { root: string }) => (await readdir(join(repo.root, ".svartz/vaults/blog/cache/versions"))).sort();

  // Proves a second build with nothing changed compiles no version, and hands SvelteKit exactly what the first did.
  it("compiles no version when nothing changed, and builds the same pages", async () => {
    const repo = await threeVersions();

    const first = await build(repo.vault);
    const second = await build(repo.vault);

    expect(first.cache).toEqual({ compiled: 3, reused: 0 });
    expect(second.cache).toEqual({ compiled: 0, reused: 3 });
    expect(emitted(second)).toEqual(emitted(first));
  });

  // Proves a new commit to the post compiles its new version alone: the post's own current text isn't in the key.
  it("compiles only the new version after a new commit to the post", async () => {
    const repo = await threeVersions();
    await build(repo.vault);
    await repo.write("posts/hello.md", post("Four, see [[other]]."));
    await repo.commit("Say four");

    expect((await build(repo.vault)).cache).toEqual({ compiled: 1, reused: 3 });
  });

  // Proves what a version's compile reads is in its key: the vault's config, the address of a note it links, and
  // Svartz's own code each compile the versions again, and a linked note's new address shows.
  it("compiles the versions again when the config, a linked note's address, or Svartz changes", async () => {
    const repo = await threeVersions();
    await build(repo.vault);

    expect((await build(repo.vault, [history({ source: "git" })], { site: { title: "Renamed blog" } })).cache).toEqual({ compiled: 3, reused: 0 });

    await repo.write("posts/other.md", "---\ntitle: Other\nslug: elsewhere\n---\n\nAnother post.\n");
    const moved = await build(repo.vault);
    const shas = (await exec("git", ["-C", repo.root, "log", "--format=%h", "--abbrev=7"])).stdout.trim().split("\n");
    expect(moved.cache).toEqual({ compiled: 3, reused: 0 });
    // The note's `slug` moves it within its folder, to `/posts/elsewhere/`.
    expect(moved.page(`/posts/hello/versions/${shas[0]}/`)).toContain('"href":"../../../elsewhere/"');

    software.fingerprint = "svartz-2";
    try {
      expect((await build(repo.vault)).cache).toEqual({ compiled: 3, reused: 0 });
    } finally {
      software.fingerprint = "svartz-1";
    }
  });

  // Proves visibility is decided before the cache is read: a version the vault excludes since never shows, though
  // its compiled page was cached, and the cache keeps only versions that show.
  it("never serves a version hidden since, and keeps only versions that show", async () => {
    const repo = await repository();
    await mkdir(join(repo.vault, "drafts"));
    await repo.write("drafts/hello.md", post("Drafted."));
    await repo.commit("Draft it");
    await repo.move("drafts/hello.md", "posts/hello.md");
    await repo.write("posts/hello.md", post("Published."));
    await repo.commit("Publish it");
    await repo.write("posts/hello.md", post("Edited."));
    await repo.commit("Edit it");
    const shas = (await exec("git", ["-C", repo.root, "log", "--format=%h", "--abbrev=7"])).stdout.trim().split("\n");

    const open = await build(repo.vault);
    expect(open.versions).toContain(`/posts/hello/versions/${shas[2]}/`);
    expect(await entries(repo)).toHaveLength(3);

    const closed = await build(repo.vault, [history({ source: "git" })], { exclude: ["drafts/**"] });
    expect(closed.versions).not.toContain(`/posts/hello/versions/${shas[2]}/`);
    expect(closed.everything).not.toContain("Drafted.");
    expect(await entries(repo)).toHaveLength(2);
  });

  // Proves a version a plugin couldn't read isn't cached as broken: the next build compiles it again.
  it("compiles a version that failed again on the next build", async () => {
    const repo = await threeVersions();
    await repo.write("posts/hello.md", post("BREAKS-THE-PLUGIN now."));
    await repo.commit("Break it");
    const breaking = {
      id: "breaking",
      transformOfm: {
        options: { fatal: false },
        run: (ctx: PluginContext) => {
          if (ctx.files.some(({ content }) => content.includes("BREAKS-THE-PLUGIN"))) throw new Error("can't read this");
        },
      },
    };
    await repo.write("posts/hello.md", post("Fixed."));
    await repo.commit("Fix it");

    const plugins = [history({ source: "git" }), breaking];
    expect((await build(repo.vault, plugins)).cache).toEqual({ compiled: 5, reused: 0 });
    expect((await build(repo.vault, plugins)).cache).toEqual({ compiled: 1, reused: 4 });
  });
});
