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
    routes: { mountPath: "/blog", tags: ["/blog/tags/"], folders: ["/blog/folders/", "/blog/earlier/"], feed: ["/blog/feed/"], all: ["/blog/", "/blog/feed/"] },
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
    await emitDiscovery().emitArtifacts!.run(ctx);
    const feed = String(ctx.artifacts.get("assets/rss.xml")?.contents);
    expect(feed).toContain("/blog/earlier/");
    expect(feed).not.toContain("/blog/later/");
    expect(feed).toContain("<content:encoded><![CDATA[<h1 id=\"earlier\">Earlier");
    expect(ctx.artifacts.has("assets/sitemap.xml")).toBe(false);
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
});
