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

  describe("robots.txt", () => {
    /** A vault served at the origin root, `https://example.com/`, unless `config` or `meta` say otherwise. */
    const robotsFor = async (
      robots: Partial<ResolvedConfig["discovery"]["robots"]>,
      config: Partial<ResolvedConfig> = {},
      meta: Record<string, unknown> = {},
    ) => {
      const base = context();
      const ctx = context({
        mountPath: "",
        site: { title: "Blog & Work", url: "https://example.com" },
        discovery: { ...base.config.discovery, robots: {
          enabled: true, bots: true, search: true, training: true, rules: [], contentSignals: {}, ...robots,
        } },
        ...config,
      });
      for (const [key, value] of Object.entries(meta)) ctx.meta.set(key, value);
      await emitDiscovery().emitArtifacts!.run(ctx);
      return ctx.artifacts.get("assets/robots.txt")?.contents;
    };

    it.each([
      ["admits every crawler and names the absolute sitemap", {}, [
        "User-agent: *", "Disallow:", "", "Sitemap: https://example.com/sitemap.xml", "",
      ]],
      ["blocks every crawler", { bots: false, search: false, training: false }, [
        "User-agent: *", "Disallow: /", "", "Sitemap: https://example.com/sitemap.xml", "",
      ]],
      ["keeps search and agents while opting out of training, with content signals and a raw rule", {
        training: false,
        contentSignals: { search: true, aiInput: true, aiTrain: false },
        rules: [{ userAgent: ["Amazonbot", "YandexBot"], allow: ["/public/"], disallow: ["/drafts/"] }],
      }, [
        "User-agent: *", "Content-Signal: search=yes, ai-input=yes, ai-train=no", "Disallow:", "",
        "User-agent: GPTBot", "User-agent: ClaudeBot", "User-agent: Google-Extended", "User-agent: Applebot-Extended",
        "User-agent: CCBot", "User-agent: Meta-ExternalAgent", "User-agent: Bytespider",
        "Content-Signal: search=yes, ai-input=yes, ai-train=no", "Disallow: /", "",
        // A crawler with its own group never reads `*`'s, so each group repeats the signals.
        "User-agent: Amazonbot", "User-agent: YandexBot",
        "Content-Signal: search=yes, ai-input=yes, ai-train=no", "Disallow:", "Allow: /public/", "Disallow: /drafts/", "",
        "Sitemap: https://example.com/sitemap.xml", "",
      ]],
      ["admits only search and agent fetchers", { bots: false, search: true, training: false }, [
        "User-agent: *", "Disallow: /", "",
        "User-agent: Googlebot", "User-agent: bingbot", "User-agent: DuckDuckBot", "User-agent: Applebot",
        "User-agent: OAI-SearchBot", "User-agent: ChatGPT-User", "User-agent: Claude-SearchBot", "User-agent: Claude-User",
        "User-agent: PerplexityBot", "User-agent: Perplexity-User", "Disallow:", "",
        "Sitemap: https://example.com/sitemap.xml", "",
      ]],
      // A raw group merges with the generated group for the same agent. Beside an `Allow: /`, Google would pick the
      // allow over an equally long `Disallow: /` and crawl on, so an admitting group must hold no rule of its own.
      ["lets a raw rule block every crawler that bots admits", { rules: [{ userAgent: "*", disallow: ["/"] }] }, [
        "User-agent: *", "Disallow:", "",
        "User-agent: *", "Disallow:", "Disallow: /", "",
        "Sitemap: https://example.com/sitemap.xml", "",
      ]],
      // A crawler a rule names reads only that rule's group, so the group keeps its preset's block: the rule narrows
      // `bots: false` for Googlebot instead of opening the rest of the site to it.
      ["keeps a blocked crawler blocked outside what its raw rule names", {
        bots: false, search: false, training: false, rules: [{ userAgent: ["Googlebot", "Amazonbot"], allow: ["/public/"] }],
      }, [
        "User-agent: *", "Disallow: /", "",
        "User-agent: Googlebot", "User-agent: Amazonbot", "Disallow: /", "Allow: /public/", "",
        "Sitemap: https://example.com/sitemap.xml", "",
      ]],
      ["splits a raw rule's crawlers by the preset that covers them", {
        training: false, rules: [{ userAgent: ["googlebot", "GPTBot"], disallow: ["/drafts/"] }],
      }, [
        "User-agent: *", "Disallow:", "",
        "User-agent: GPTBot", "User-agent: ClaudeBot", "User-agent: Google-Extended", "User-agent: Applebot-Extended",
        "User-agent: CCBot", "User-agent: Meta-ExternalAgent", "User-agent: Bytespider", "Disallow: /", "",
        "User-agent: googlebot", "Disallow:", "Disallow: /drafts/", "",
        "User-agent: GPTBot", "Disallow: /", "Disallow: /drafts/", "",
        "Sitemap: https://example.com/sitemap.xml", "",
      ]],
      ["lets a raw rule block part of a preset that admits its crawler", {
        bots: false, search: true, training: false, rules: [{ userAgent: "Googlebot", disallow: ["/drafts/"] }],
      }, [
        "User-agent: *", "Disallow: /", "",
        "User-agent: Googlebot", "User-agent: bingbot", "User-agent: DuckDuckBot", "User-agent: Applebot",
        "User-agent: OAI-SearchBot", "User-agent: ChatGPT-User", "User-agent: Claude-SearchBot", "User-agent: Claude-User",
        "User-agent: PerplexityBot", "User-agent: Perplexity-User", "Disallow:", "",
        "User-agent: Googlebot", "Disallow:", "Disallow: /drafts/", "",
        "Sitemap: https://example.com/sitemap.xml", "",
      ]],
    ])("%s", async (_name, robots, lines) => {
      const output = String(await robotsFor(robots));
      expect(output).toBe(lines.join("\n"));
      expect(output).not.toContain("Allow: /\n");
    });

    it("leaves out the sitemap line without a sitemap", async () => {
      const base = context().config.discovery;
      expect(await robotsFor({}, { discovery: { ...base, sitemap: { enabled: false }, robots: {
        enabled: true, bots: true, search: true, training: true, rules: [], contentSignals: {},
      } } })).toBe("User-agent: *\nDisallow:\n");
    });

    it.each([
      ["a host route", {}, { reservedRoutes: new Set(["robots.txt"]) }],
      ["a vault mount", { mountPath: "/blog" }, {}],
      ["a deployment base", {}, { "svartz:deploymentBase": "/site" }],
      ["a path in the public URL", { site: { title: "Blog", url: "https://example.com/site" } }, {}],
    ])("writes no robots.txt below the origin root: %s", async (_name, config, meta) => {
      expect(await robotsFor({}, config, meta)).toBeUndefined();
    });
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
