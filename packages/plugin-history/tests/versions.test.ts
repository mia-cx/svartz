/**
 * Previous versions read from git (`history({ source: "git" })`), through the build pipeline itself: Svartz's core
 * plugins and this one, on a vault in a temporary repository with real commits. Each page's HTML is read from the
 * page artifact the build hands SvelteKit, so the assertions cover exactly what prerenders.
 */
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { resolveConfig } from "@svartz/config";
import { getCompilerContributions, runStages, type PluginContext } from "@svartz/core";
import { createCorePlugins } from "@svartz/plugins";
import { afterEach, describe, expect, it } from "vitest";
import { history } from "../src/index";

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
  await runStages(ctx.plugins!, ctx);
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
  return { ctx, routes, versions, page, asset, everything, link };
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
});
