import { describe, expect, it } from "vitest";
import type { Index, PluginContext, ResolvedConfig } from "@svartz/core";
import { emitDiscovery } from "../src/emit-discovery";

function context(config: Partial<ResolvedConfig> = {}): PluginContext {
  const entries = [
    { slug: "later", href: "/blog/later/", path: "later.md", title: "Later & safer", description: "A <summary>", properties: {}, createdAt: new Date("2025-01-01"), modifiedAt: new Date("2025-01-04"), publishedAt: new Date("2030-01-01") },
    { slug: "earlier", href: "/blog/earlier/", path: "earlier.md", title: "Earlier", description: "Second", properties: {}, createdAt: new Date("2024-01-01"), modifiedAt: new Date("2026-01-01") },
    { slug: "secret", href: "/blog/secret/", path: "secret.md", title: "Secret", description: "Do not list", properties: { encrypted: true }, createdAt: new Date("2027-01-01"), modifiedAt: new Date("2027-01-01") },
    { slug: "hidden", href: "/blog/hidden/", path: "hidden.md", title: "Hidden", description: "Do not list", properties: { hidden: true }, createdAt: new Date("2027-01-01"), modifiedAt: new Date("2027-01-01") },
  ];
  const index = {
    entries,
    routes: { mountPath: "/blog", tags: ["/blog/tags/"], folders: ["/blog/folders/", "/blog/earlier/"], feed: ["/blog/feed/"], theme: ["/blog/about/"], all: ["/blog/", "/blog/feed/", "/blog/about/"] },
  } as unknown as Index;
  return {
    config: {
      id: "blog",
      outDir: "/tmp/svartz-test/dist",
      site: { title: "Blog & Work", url: "https://example.com/site" },
      mountPath: "/blog",
      discovery: {
        feed: { enabled: true, limit: 10, content: "summary", sort: "published" },
        sitemap: { enabled: true },
        dateSources: ["frontmatter", "git", "filesystem"],
      },
      ...config,
    } as ResolvedConfig,
    files: [
      { path: "later.md", slug: "later", extension: ".md", content: "# Later\n\n**Body**" },
      { path: "earlier.md", slug: "earlier", extension: ".md", content: "# Earlier" },
    ],
    index,
    artifacts: new Map(),
    meta: new Map(),
  };
}

describe("discovery output", () => {
  it("uses published canonical URLs, dates, XML escaping, and mount/base paths", async () => {
    const ctx = context();
    await emitDiscovery().emitArtifacts!.run(ctx);
    const feed = String(ctx.artifacts.get("assets/rss.xml")?.contents);
    const sitemap = String(ctx.artifacts.get("assets/sitemap.xml")?.contents);
    expect(feed).toContain("https://example.com/site/blog/later/");
    expect(feed).toContain("Later &amp; safer");
    expect(feed).toContain("A &lt;summary&gt;");
    expect(feed.indexOf("/blog/later/")).toBeLessThan(feed.indexOf("/blog/earlier/"));
    expect(feed).not.toContain("Secret");
    expect(feed).not.toContain("Hidden");
    expect(feed).not.toContain("<content:encoded>");
    expect(sitemap).toContain("https://example.com/site/blog/tags/");
    expect(sitemap).toContain("https://example.com/site/blog/feed/");
    expect(sitemap).toContain("https://example.com/site/blog/about/");
    expect(sitemap).toContain("https://example.com/site/blog/</loc>");
    expect(sitemap.match(/example.com\/site\/blog\/earlier\//g)).toHaveLength(1);
    expect(sitemap).not.toContain("secret");
    expect(sitemap).not.toContain("hidden");
  });

  it("supports a full-content limited feed sorted by modification date", async () => {
    const ctx = context({ discovery: {
      feed: { enabled: true, limit: 1, content: "full", sort: "modified" },
      sitemap: { enabled: false }, dateSources: ["filesystem"],
    } });
    ctx.files[1]!.content = "# Earlier\n\n[Later](../later/) ![Photo](./media/photo.png)";
    await emitDiscovery().emitArtifacts!.run(ctx);
    const feed = String(ctx.artifacts.get("assets/rss.xml")?.contents);
    expect(feed).toContain("/blog/earlier/");
    expect(feed).not.toContain("<item><title>Later");
    expect(feed).toContain("<content:encoded><![CDATA[<h1 id=\"earlier\">Earlier");
    expect(feed).toContain('href="https://example.com/site/blog/later/"');
    expect(feed).toContain('src="https://example.com/site/blog/earlier/media/photo.png"');
    expect(ctx.artifacts.has("assets/sitemap.xml")).toBe(false);
  });

  it("resolves responsive image URLs and keeps malformed authored URLs in full feeds", async () => {
    const ctx = context({ discovery: {
      feed: { enabled: true, limit: 1, content: "full", sort: "modified" },
      sitemap: { enabled: false }, dateSources: ["filesystem"],
    } });
    ctx.files[1]!.content = '<picture><source srcset="./small.webp 1x, ./large.webp 2x"><img src="http://[" srcset="data:image/png;base64,AAAA 1x, ./photo\u00a0one.png 2x"></picture><a href="http://[">Broken</a>';
    await emitDiscovery().emitArtifacts!.run(ctx);
    const feed = String(ctx.artifacts.get("assets/rss.xml")?.contents);
    expect(feed).toContain('srcset="https://example.com/site/blog/earlier/small.webp 1x, https://example.com/site/blog/earlier/large.webp 2x"');
    expect(feed).toContain('srcset="data:image/png;base64,AAAA 1x, https://example.com/site/blog/earlier/photo%C2%A0one.png 2x"');
    expect(feed).toContain('href="http://["');
    expect(feed).toContain('src="http://["');
  });

  it("keeps the authored home page modification date in the sitemap", async () => {
    const ctx = context();
    const index = ctx.index!;
    ctx.index = { ...index, entries: [...index.entries, {
      ...index.entries[0]!, slug: "index", href: "/blog/", path: "index.md",
      modifiedAt: new Date("2026-05-04"),
    }] };
    await emitDiscovery().emitArtifacts!.run(ctx);
    expect(String(ctx.artifacts.get("assets/sitemap.xml")?.contents))
      .toContain("<loc>https://example.com/site/blog/</loc><lastmod>2026-05-04T00:00:00.000Z</lastmod>");
  });

  it("requires a public URL only for enabled production output", async () => {
    const ctx = context({ site: { title: "Blog" } });
    await expect(emitDiscovery().emitArtifacts!.run(ctx)).rejects.toThrow("needs site.url");
    ctx.meta.set("svartz:mode", "development");
    await emitDiscovery().emitArtifacts!.run(ctx);
    expect(ctx.artifacts.size).toBe(0);
  });

  it("leaves manually owned discovery routes alone", async () => {
    const ctx = context();
    ctx.meta.set("reservedRoutes", new Set(["rss.xml"]));
    await emitDiscovery().emitArtifacts!.run(ctx);
    expect(ctx.artifacts.has("assets/rss.xml")).toBe(false);
    expect(ctx.artifacts.has("assets/sitemap.xml")).toBe(true);
  });

  it.each(["rss.xml", "sitemap.xml"])("rejects a vault asset at the generated %s path", async (name) => {
    const ctx = context();
    ctx.files.push({ path: name, slug: name, extension: ".xml", content: "user asset" });
    await expect(emitDiscovery().emitArtifacts!.run(ctx)).rejects.toThrow(
      `Published vault asset "${name}" conflicts with a generated Svartz discovery file.`,
    );
  });

  it.each(["rss.xml", "sitemap.xml"])("ignores a protected-only %s asset", async (name) => {
    const ctx = context();
    ctx.files.push({ path: name, slug: name, extension: ".xml", content: "private asset" });
    ctx.meta.set("svartz:publicAssetPaths", new Set<string>());
    await emitDiscovery().emitArtifacts!.run(ctx);
    expect(ctx.artifacts.has(`assets/${name}`)).toBe(true);
  });

  it.each(["rss.xml", "sitemap.xml"])("still rejects a publicly emitted %s asset", async (name) => {
    const ctx = context();
    ctx.files.push({ path: name, slug: name, extension: ".xml", content: "public asset" });
    ctx.meta.set("svartz:publicAssetPaths", new Set([name]));
    await expect(emitDiscovery().emitArtifacts!.run(ctx)).rejects.toThrow(`Published vault asset "${name}"`);
  });
});
