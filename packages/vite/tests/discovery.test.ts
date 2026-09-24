import { expect, it } from "vitest";
import type { HostDiscoveryVault } from "../src/discovery";
import { renderHostRss, renderHostSitemap } from "../src/discovery";

const vaults = [
  {
    id: "blog",
    artifacts: {
      siteConfig: { title: "Blog", url: "https://example.com/site" },
      index: {
        entries: [
          { href: "/blog/hello/", title: "Hello", description: "Blog entry", path: "hello.md", properties: {}, createdAt: new Date("2020-01-01"), modifiedAt: new Date("2024-01-01") },
          { href: "/blog/secret/", title: "Secret", description: "Hidden", path: "secret.md", properties: { encrypted: true }, createdAt: new Date("2028-01-01"), modifiedAt: new Date("2028-01-01") },
          { href: "/blog/hidden/", title: "Hidden", description: "Unlisted", path: "hidden.md", properties: { hidden: true }, createdAt: new Date("2028-01-01"), modifiedAt: new Date("2028-01-01") },
        ],
        routes: { mountPath: "/blog", tags: ["/blog/tags/"], folders: [], feed: ["/blog/feed/"], all: ["/blog/", "/blog/feed/"] },
      },
    },
  },
  {
    id: "work",
    artifacts: {
      siteConfig: { title: "Work", url: "https://example.com/site" },
      index: {
        entries: [{ href: "/work/project/", title: "Project", description: "Work entry", path: "project.md", properties: {}, createdAt: new Date("2022-01-01"), modifiedAt: new Date("2025-01-01") }],
        routes: { mountPath: "/work", tags: [], folders: ["/work/folders/"], feed: ["/work/feed/"], all: ["/work/", "/work/feed/"] },
      },
    },
  },
] as unknown as HostDiscoveryVault[];

it("combines only selected published vault entries at canonical mounted URLs", () => {
  const rss = renderHostRss(vaults, ["work", "blog"], { title: "Portfolio", url: "https://example.com/site", limit: 2 });
  expect(rss).toContain("https://example.com/site/work/project/");
  expect(rss).toContain("https://example.com/site/blog/hello/");
  expect(rss.indexOf("/work/project/")).toBeLessThan(rss.indexOf("/blog/hello/"));
  expect(rss).not.toContain("Secret");
  expect(rss).not.toContain("Unlisted");
  const sitemap = renderHostSitemap(vaults, ["work"]);
  expect(sitemap).toContain("https://example.com/site/work/folders/");
  expect(sitemap).toContain("https://example.com/site/work/feed/");
  expect(sitemap).toContain("https://example.com/site/work/</loc>");
  expect(sitemap).not.toContain("/blog/");
  expect(renderHostSitemap(vaults, ["blog"])).not.toContain("/blog/hidden/");
});

it("rejects unknown selections and cross-host sitemaps", () => {
  expect(() => renderHostSitemap(vaults, ["missing"])).toThrow("Unknown host discovery vault");
  const otherHost = {
    ...vaults[1]!, artifacts: { ...vaults[1]!.artifacts, siteConfig: { title: "Work", url: "https://other.test" } },
  };
  expect(() => renderHostSitemap([vaults[0]!, otherHost], ["blog", "work"]))
    .toThrow("share one public host");
});
