import { describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PluginContext, ProcessedFile } from "@svartz/core";
import { discoverFiles } from "../src/discover-files";
import { parseFrontmatter } from "../src/parse-frontmatter";
import { filterUnpublished } from "../src/filter-unpublished";
import { resolveLinks } from "../src/resolve-links";
import { transformEmbeds } from "../src/transform-embeds";
import { indexContent } from "../src/index-content";
import { emitArtifacts } from "../src/emit-artifacts";

const note = (
  path: string,
  content: string,
  frontmatter: Record<string, unknown> = {},
): ProcessedFile => ({
  path,
  slug: path.replace(/\.md$/, ""),
  extension: ".md",
  content,
  frontmatter,
});

const asset = (path: string): ProcessedFile => ({
  path,
  slug: path,
  extension: path.slice(path.lastIndexOf(".")),
  content: "",
  sourcePath: `/vault/${path}`,
});

const context = (
  files: ProcessedFile[],
  publicationMode: "exclusion" | "inclusion" = "exclusion",
  include: string[] = [],
  exclude: string[] = [],
  path = "/vault",
  outDir = "/out",
): PluginContext =>
  ({
    config: {
      id: "test",
      version: "1.0.0",
      path,
      outDir,
      include,
      exclude,
      publicationMode,
      frontmatter: {
        publishedField: "published_at",
        aliasesField: "aliases",
        titleField: "title",
        descriptionField: "description",
        tagsField: "tags",
        createdAtField: "created_at",
        updatedAtField: "updated_at",
      },
      linkResolution: "closest",
      theme: { base: "minimal" },
      target: { type: "static" },
      plugins: [],
      passwordGroups: {},
    },
    files,
    artifacts: new Map(),
    meta: new Map(),
  }) as PluginContext;

describe("v1 publication boundary", () => {
  it("fails closed for missing protected groups or passwords after publication filtering", () => {
    const unknown = context([note("locked.md", "SECRET", { password_group: "friends" })]);
    expect(() => filterUnpublished().filterUnpublished!.run(unknown)).toThrow(/undefined password group/);

    const missing = context([note("locked.md", "SECRET", { password_group: "friends" })]);
    Object.assign(missing.config.passwordGroups, { friends: { env: "SVARTZ_TEST_PROTECTED_PASSWORD" } });
    expect(() => filterUnpublished().filterUnpublished!.run(missing)).toThrow(/SVARTZ_TEST_PROTECTED_PASSWORD/);

    const unpublished = context([note("private.md", "SECRET", { private: true, password_group: "friends" })]);
    filterUnpublished().filterUnpublished!.run(unpublished);
    expect(unpublished.files).toEqual([]);
  });

  it("marks public protected notes without putting password values on files", () => {
    vi.stubEnv("SVARTZ_TEST_PROTECTED_PASSWORD", "not-a-public-value");
    try {
      const ctx = context([note("locked.md", "SECRET", { password_group: "friends", hide_locked: true })]);
      Object.assign(ctx.config.passwordGroups, { friends: { env: "SVARTZ_TEST_PROTECTED_PASSWORD" } });
      expect(() => filterUnpublished().filterUnpublished!.run(ctx)).toThrow(/encrypted publication pipeline/);
      ctx.meta.set("svartz:protectionReady", true);
      filterUnpublished().filterUnpublished!.run(ctx);
      expect(ctx.files[0]?.protection).toEqual({ group: "friends", hidden: true });
      const firstToken = (ctx.meta.get("svartz:protectedGroupTokens") as Map<string, string>).get("friends");
      filterUnpublished().filterUnpublished!.run(ctx);
      expect((ctx.meta.get("svartz:protectedGroupTokens") as Map<string, string>).get("friends")).toBe(firstToken);
      expect(JSON.stringify(ctx.files[0]?.protection)).not.toContain("not-a-public-value");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("keeps protected embed bodies inside their password group", () => {
    const publicNote = note("public.md", "![[friends]]");
    const friends = note("friends.md", "FRIENDS_SECRET ![[family]]", { title: "Friends" });
    friends.protection = { group: "friends", hidden: false };
    const family = note("family.md", "FAMILY_SECRET", { title: "Hidden family" });
    family.protection = { group: "family", hidden: true };
    const ctx = context([publicNote, friends, family]);
    ctx.meta.set("sourceBodies", new Map(ctx.files.map((file) => [file.path, file.content])));

    transformEmbeds().transformEmbeds!.run(ctx);

    expect(publicNote.content).toContain("data-svartz-locked");
    expect(publicNote.content).toContain("Friends");
    expect(publicNote.content).not.toContain("FRIENDS_SECRET");
    expect(publicNote.content).not.toContain("FAMILY_SECRET");
    expect(friends.content).toContain("data-svartz-locked");
    expect(friends.content).not.toContain("FAMILY_SECRET");
    expect(friends.content).not.toContain("Hidden family");
  });

  it("indexes only public metadata and assets while retaining protected routes", () => {
    vi.stubEnv("SVARTZ_TEST_PROTECTED_PASSWORD", "secret-password");
    try {
      const ctx = context([
        note("public.md", "[[locked]] ![Public](media/public.png)"),
        note("locked.md", "BODY_SECRET ![Private](media/private.png)", {
          title: "Locked title", description: "DESCRIPTION_SECRET", tags: ["secret-tag"],
          aliases: ["SECRET_ALIAS"], password_group: "friends", created_at: "2026-01-01",
        }),
        note("secret-folder/hidden.md", "HIDDEN_SECRET", { title: "HIDDEN_TITLE", password_group: "friends", hide_locked: true }),
        asset("media/public.png"),
        asset("media/private.png"),
      ]);
      Object.assign(ctx.config.passwordGroups, { friends: { env: "SVARTZ_TEST_PROTECTED_PASSWORD" } });
      ctx.meta.set("svartz:protectionReady", true);
      filterUnpublished().filterUnpublished!.run(ctx);
      resolveLinks().resolveLinks!.run(ctx);
      indexContent().indexContent!.run(ctx);

      const index = ctx.index!;
      expect(index.entries.map((entry) => entry.slug)).toEqual(["locked", "public"]);
      expect(index.entries[0]).toMatchObject({
        href: "/locked/", title: "Locked title", locked: true, path: "",
        properties: {}, content: "", tags: [], aliases: [], links: [],
      });
      expect(index.entries[0]?.createdAt).toBeUndefined();
      expect(index.routes.notes).toContain("/secret-folder/hidden/");
      expect(index.folders).not.toContainEqual(expect.objectContaining({ slug: "secret-folder" }));
      expect(index.search.map((entry) => entry.slug)).toEqual(["public"]);
      expect(index.graph).toEqual({ public: [] });
      expect(index.assets.map((item) => item.path)).toEqual(["media/public.png"]);
      expect(JSON.stringify(index)).not.toMatch(/BODY_SECRET|DESCRIPTION_SECRET|HIDDEN_SECRET|HIDDEN_TITLE|SECRET_ALIAS|secret-tag|private\.png|secret-password/);
      const protectedEntries = ctx.meta.get("svartz:protectedEntries") as Map<string, unknown[]>;
      expect(protectedEntries.get("friends")).toHaveLength(2);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("never sends protected note source or private assets to the public emitter", async () => {
    vi.stubEnv("SVARTZ_TEST_PROTECTED_PASSWORD", "secret-password");
    const root = await mkdtemp(join(tmpdir(), "svartz-protected-emitter-"));
    try {
      const ctx = context([
        {
          ...note("locked.md", "<h1>EXECUTABLE_SECRET</h1> ![Private](media/private.png)", {
            title: "Locked", password_group: "friends",
          }),
          path: "locked.svx", extension: ".svx",
        },
        asset("media/private.png"),
      ], "exclusion", [], [], root, join(root, "dist"));
      Object.assign(ctx.config.passwordGroups, { friends: { env: "SVARTZ_TEST_PROTECTED_PASSWORD" } });
      ctx.meta.set("svartz:protectionReady", true);
      filterUnpublished().filterUnpublished!.run(ctx);
      indexContent().indexContent!.run(ctx);
      await emitArtifacts().emitArtifacts!.run(ctx);

      expect([...ctx.artifacts.keys()].sort()).toEqual(["index.ts", "pages/locked.svelte", "search.ts"]);
      expect(ctx.artifacts.get("pages/locked.svelte")?.contents).toMatch(/svartzProtected.*__svartz\/protected\/[A-Za-z0-9_-]+\.json/);
      expect(ctx.artifacts.get("pages/locked.svelte")?.contents).toContain("<div data-svartz-protected-note></div>");
      expect([...ctx.artifacts.values()].map((item) => String(item.contents)).join(""))
        .not.toMatch(/EXECUTABLE_SECRET|private\.png|secret-password|friends/);
    } finally {
      vi.unstubAllEnvs();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("keeps a public note's frontmatter social image but not a private note's image", () => {
    const ctx = context([
      note("public.md", "", { socialImage: "media/cover.png" }),
      note("private.md", "", { private: true, socialImage: "media/secret.png" }),
      asset("media/cover.png"),
      asset("media/secret.png"),
    ]);
    filterUnpublished().filterUnpublished!.run(ctx);
    expect(ctx.files.map((file) => file.path)).toEqual(["public.md", "media/cover.png"]);
  });

  it("retains only the effective public frontmatter image", () => {
    vi.stubEnv("SVARTZ_TEST_PROTECTED_PASSWORD", "secret-password");
    try {
      const ctx = context([
        note("public.md", "", { socialImage: "media/hero.png", image: "media/unused.png" }),
        note("locked.md", "", { password_group: "friends", socialImage: "media/locked.png" }),
        asset("media/hero.png"), asset("media/unused.png"), asset("media/locked.png"),
      ]);
      Object.assign(ctx.config.passwordGroups, { friends: { env: "SVARTZ_TEST_PROTECTED_PASSWORD" } });
      ctx.meta.set("svartz:protectionReady", true);
      filterUnpublished().filterUnpublished!.run(ctx);
      expect(ctx.files.map((file) => file.path)).toEqual(["public.md", "locked.md", "media/hero.png"]);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("does not publish assets mentioned only in hidden comments", () => {
    const ctx = context([
      note("public.md", "%% ![[secret.pdf]] %%\n<!-- <img src=\"media/hidden.png\"> -->\n<div><!-- <img src=\"media/nested.png\"> --></div>\n\n![Shown](media/visible.png)"),
      asset("secret.pdf"), asset("media/hidden.png"), asset("media/nested.png"), asset("media/visible.png"),
    ]);
    filterUnpublished().filterUnpublished!.run(ctx);
    expect(ctx.files.map((file) => file.path)).toEqual(["public.md", "media/visible.png"]);
  });

  it("keeps visible assets between comment markers in code spans", () => {
    const ctx = context([
      note("public.md", '`<!--` ![Shown](media/x.png) `-->` and `%%` ![Other](media/y.png) `%%`'),
      asset("media/x.png"), asset("media/y.png"),
    ]);
    filterUnpublished().filterUnpublished!.run(ctx);
    expect(ctx.files.map((file) => file.path)).toEqual(["public.md", "media/x.png", "media/y.png"]);
  });

  it("does not let a code span close an Obsidian comment early", () => {
    const ctx = context([
      note("public.md", "%% hidden `%%` ![[secret.pdf]] %%\n![Shown](media/visible.png)"),
      asset("secret.pdf"), asset("media/visible.png"),
    ]);
    filterUnpublished().filterUnpublished!.run(ctx);
    expect(ctx.files.map((file) => file.path)).toEqual(["public.md", "media/visible.png"]);
  });

  it("retains reference-style assets and rewrites their definitions", () => {
    const ctx = context([
      note("note.md", "![Photo][hero]\n\n[hero]: media/photo.png#view"),
      asset("media/photo.png"),
    ]);
    filterUnpublished().filterUnpublished!.run(ctx);
    expect(ctx.files.map((file) => file.path)).toEqual(["note.md", "media/photo.png"]);
    resolveLinks().resolveLinks!.run(ctx);
    expect(ctx.files[0]!.content).toContain("[hero]: ../media/photo.png#view");
  });

  it("retains a reference asset whose destination starts on the next line", () => {
    const ctx = context([note("note.md", "![Photo][hero]\n\n[hero]:\n  media/photo.png"), asset("media/photo.png")]);
    filterUnpublished().filterUnpublished!.run(ctx);
    expect(ctx.files.map((file) => file.path)).toEqual(["note.md", "media/photo.png"]);
    resolveLinks().resolveLinks!.run(ctx);
    expect(ctx.files[0]!.content).toContain("[hero]:\n  ../media/photo.png");
  });

  it("keeps query strings and fragments when rewriting asset URLs", () => {
    const ctx = context([
      note("note.md", '![Image](media/photo.png?width=2#crop) <iframe src="media/manual.pdf#page=3"></iframe>'),
      asset("media/photo.png"), asset("media/manual.pdf"),
    ]);
    filterUnpublished().filterUnpublished!.run(ctx);
    resolveLinks().resolveLinks!.run(ctx);
    expect(ctx.files[0]!.content).toContain("![Image](../media/photo.png?width=2#crop)");
    expect(ctx.files[0]!.content).toContain('src="../media/manual.pdf#page=3"');
  });

  it("escapes authored asset fragments in generated link attributes", () => {
    const ctx = context([note("note.md", '[[manual.pdf#x" autofocus="true]]'), asset("manual.pdf")]);
    parseFrontmatter().parseFrontmatter!.run(ctx);
    filterUnpublished().filterUnpublished!.run(ctx);
    resolveLinks().resolveLinks!.run(ctx);
    expect(ctx.files[0]!.content).toContain('href="../manual.pdf#x&quot; autofocus=&quot;true"');
  });

  it("includes attachment URLs in responsive images and media tags", () => {
    const ctx = context([
      note("locked.md", '<picture><source srcset="media/small.webp 1x, media/large.webp 2x"><img src="media/fallback.png"></picture><video poster="media/poster.jpg" src="media/clip.mp4"></video><a href="media/file.pdf">Download</a>', { password_group: "friends" }),
      ...["small.webp", "large.webp", "fallback.png", "poster.jpg", "clip.mp4", "file.pdf", "unused.png"].map((name) => asset(`media/${name}`)),
    ]);
    vi.stubEnv("SVARTZ_TEST_PROTECTED_PASSWORD", "secret-password");
    try {
      Object.assign(ctx.config.passwordGroups, { friends: { env: "SVARTZ_TEST_PROTECTED_PASSWORD" } });
      ctx.meta.set("svartz:protectionReady", true);
      filterUnpublished().filterUnpublished!.run(ctx);
      const selected = (ctx.meta.get("svartz:protectedAssetPaths") as Map<string, Set<string>>).get("friends");
      expect([...selected ?? []].sort()).toEqual([
        "media/clip.mp4", "media/fallback.png", "media/file.pdf", "media/large.webp",
        "media/poster.jpg", "media/small.webp",
      ]);
      expect(ctx.files.map((file) => file.path)).not.toContain("media/unused.png");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("fails closed when a note declares malformed frontmatter", () => {
    const ctx = context([note("private.md", "---\nprivate: [\n---\nSecret")]);
    expect(() => parseFrontmatter().parseFrontmatter!.run(ctx)).toThrow("Invalid frontmatter in private.md");
  });

  it("applies note overrides after patterns in draft, published_at, private order", () => {
    const ctx = context(
      [
        note("ordinary.md", ""),
        note("excluded.md", "", { draft: true, published_at: "2099-01-01", private: false }),
        note("private.md", "", { published_at: "2099-01-01", private: true }),
        note("draft.md", "", { draft: true }),
        note("not-a-draft.md", "", { draft: "true", private: "true" }),
      ],
      "exclusion",
      [],
      ["excluded.md", "private.md"],
    );

    filterUnpublished().filterUnpublished!.run(ctx);
    expect(ctx.files.map((file) => file.path)).toEqual([
      "ordinary.md",
      "excluded.md",
      "not-a-draft.md",
    ]);
  });

  it("publishes only inclusion matches or published_at overrides", () => {
    const ctx = context(
      [
        note("posts/yes.md", ""),
        note("posts/no.md", "", { private: true }),
        note("notes/no.md", ""),
        note("notes/override.md", "", { published_at: "2099-01-01" }),
      ],
      "inclusion",
      ["posts/**"],
      ["posts/no.md"],
    );
    filterUnpublished().filterUnpublished!.run(ctx);
    expect(ctx.files.map((file) => file.path)).toEqual([
      "posts/yes.md",
      "notes/override.md",
    ]);
  });

  it("uses a custom publication field when published_at is blank", () => {
    const ctx = context([note("note.md", "Published", { published_at: "", go_live: "2026-01-01" })], "inclusion");
    Object.assign(ctx.config.frontmatter, { publishedField: "go_live" });
    filterUnpublished().filterUnpublished!.run(ctx);
    expect(ctx.files.map((file) => file.path)).toEqual(["note.md"]);
  });

  it("does not publish a draft whose custom publication field is false", () => {
    const ctx = context([note("draft.md", "Hidden", { draft: true, published_at: "", go_live: false })], "inclusion");
    Object.assign(ctx.config.frontmatter, { publishedField: "go_live" });
    filterUnpublished().filterUnpublished!.run(ctx);
    expect(ctx.files).toEqual([]);
  });

  it("chooses a note-relative attachment before a vault-root namesake", () => {
    const ctx = context([
      note("posts/public.md", "![Image](media/photo.png)"),
      asset("media/photo.png"),
      asset("posts/media/photo.png"),
    ]);
    filterUnpublished().filterUnpublished!.run(ctx);
    expect(ctx.files.map((file) => file.path)).toEqual([
      "posts/public.md",
      "posts/media/photo.png",
    ]);
    resolveLinks().resolveLinks!.run(ctx);
    expect(ctx.files[0]!.content).toContain("![Image](../media/photo.png)");
  });

  it("keeps only assets referenced by public content, including outside include patterns", () => {
    const ctx = context(
      [
        note("posts/public.md", "![Image](media/photo.png) ![Space](media/my%20photo.png) ![[song.mp3]] <audio src=\"media/clip.mp3\"></audio> [[private]]\n\n```md\n![Unused](media/code-only.png)\n```"),
        note("private.md", "![Hidden](media/secret.png)", { private: true }),
        asset("media/photo.png"),
        asset("media/my photo.png"),
        asset("media/song.mp3"),
        asset("media/clip.mp3"),
        asset("media/secret.png"),
        asset("media/orphan.png"),
        asset("media/blocked.png"),
        asset("media/code-only.png"),
      ],
      "inclusion",
      ["posts/**"],
      ["media/blocked.png"],
    );
    ctx.files[0]!.content += " ![[blocked.png]]";
    ctx.meta.set("sourceBodies", new Map(ctx.files.filter((file) => file.extension === ".md").map((file) => [file.path, file.content])));

    filterUnpublished().filterUnpublished!.run(ctx);
    expect(ctx.files.map((file) => file.path)).toEqual([
      "posts/public.md",
      "media/photo.png",
      "media/my photo.png",
      "media/song.mp3",
      "media/clip.mp3",
    ]);
    expect([...((ctx.meta.get("sourceBodies") as Map<string, string>).keys())]).toEqual(["posts/public.md"]);

    resolveLinks().resolveLinks!.run(ctx);
    expect(ctx.files[0]!.links).toEqual([]);
    expect(ctx.files[0]!.content).toContain("![Image](../../media/photo.png)");
    expect(ctx.files[0]!.content).toContain("![Space](../../media/my%20photo.png)");
    expect(ctx.files[0]!.content).toContain("<audio src=\"../../media/clip.mp3\">");
    indexContent().indexContent!.run(ctx);
    expect(Object.keys(ctx.index!.graph)).toEqual(["posts/public"]);
    expect(ctx.index!.assets.map((entry) => entry.path)).toEqual([
      "media/clip.mp3",
      "media/my photo.png",
      "media/photo.png",
      "media/song.mp3",
    ]);
  });

  it("discovers overrides before filtering and emits only public attachments", async () => {
    const root = await mkdtemp(join(tmpdir(), "svartz-publication-"));
    const vault = join(root, "vault");
    try {
      await Promise.all([
        mkdir(join(vault, "posts"), { recursive: true }),
        mkdir(join(vault, "hidden"), { recursive: true }),
        mkdir(join(vault, "media"), { recursive: true }),
      ]);
      await Promise.all([
        writeFile(join(vault, "posts/public.md"), "# Public\n![Image](media/photo.png)\n![[photo.png]]\n![[bridge]]\n![[private]]"),
        writeFile(join(vault, "posts/bridge.md"), "# Bridge\n![[private]]"),
        writeFile(join(vault, "hidden/override.md"), "---\ndraft: true\npublished_at: 2099-01-01\n---\n# Override"),
        writeFile(join(vault, "private.md"), "---\nprivate: true\n---\nPRIVATE_MARKER ![[secret.png]]"),
        writeFile(join(vault, "media/photo.png"), new Uint8Array([1, 2, 3])),
        writeFile(join(vault, "media/secret.png"), new Uint8Array([4, 5, 6])),
        writeFile(join(vault, "media/orphan.png"), new Uint8Array([7, 8, 9])),
      ]);

      const ctx = context([], "inclusion", ["posts/**"], [], vault, join(root, "dist"));
      await discoverFiles().discoverFiles!.run(ctx);
      parseFrontmatter().parseFrontmatter!.run(ctx);
      filterUnpublished().filterUnpublished!.run(ctx);
      expect(ctx.files.map((file) => file.path)).toEqual([
        "hidden/override.md",
        "media/photo.png",
        "posts/bridge.md",
        "posts/public.md",
      ]);

      resolveLinks().resolveLinks!.run(ctx);
      expect(ctx.files.find((file) => file.path === "posts/public.md")?.content).toContain("![Image](../../media/photo.png)");
      transformEmbeds().transformEmbeds!.run(ctx);
      indexContent().indexContent!.run(ctx);
      await emitArtifacts().emitArtifacts!.run(ctx);

      expect([...ctx.artifacts.keys()].sort()).toEqual([
        "assets/media/photo.png",
        "index.ts",
        "pages/hidden/override.svelte",
        "pages/posts/bridge.svelte",
        "pages/posts/public.svelte",
        "search.ts",
      ]);
      expect(await readFile(join(root, "artifacts/assets/media/photo.png"))).toEqual(Buffer.from([1, 2, 3]));
      expect(JSON.stringify(ctx.index)).not.toContain("PRIVATE_MARKER");
      expect([...ctx.artifacts.values()].map((item) => String(item.contents)).join("")).not.toContain("PRIVATE_MARKER");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
