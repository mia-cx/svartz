import { fileURLToPath } from "node:url";
import { defineConfig } from "@svartz/config";
import { presentation } from "@svartz/plugins";
import cli from "./packages/cli/package.json" with { type: "json" };

/**
 * Writes the docs' API reference (`vaults/docs/reference/api/`, gitignored) from the packages' built types before the
 * docs vault's files are discovered, however its build was started. Once per process: a dev server's rebuilds, which
 * the written notes themselves trigger, reuse it. A failure fails the build rather than publishing docs without their
 * reference.
 */
let apiReferenceGenerated: Promise<unknown> | undefined;
const apiReference = () => ({
  id: "docs:api-reference",
  discoverFiles: {
    async run() {
      apiReferenceGenerated ??= import("./scripts/api-reference/index.mjs").then(({ generate }) =>
        generate({ root: fileURLToPath(new URL(".", import.meta.url)), vault: "vaults/docs", dir: "reference/api" }));
      await apiReferenceGenerated;
    },
    options: { enforce: "pre" as const, fatal: true },
  },
});

/** Svartz's own docs, and one demo per first-party theme, each a Worker on its own domain. */
const DOCS_DOMAIN = "svartz.dev";
/** The docs also answer here. Their canonical URLs name {@link DOCS_DOMAIN}, so search engines index one copy. */
const DOCS_MIRRORS = ["svartz.com", "svartz.app"];
const GITHUB = "https://github.com/mia-cx/svartz";

/**
 * A Worker answering on `domains`. Its `staging` environment deploys `<name>-staging` on the first domain moved below
 * `staging.svartz.dev`: `wiki.demo.svartz.dev` stages at `wiki.demo.staging.svartz.dev`. Pages keep their production
 * canonical URLs, so search engines never index staging.
 */
const worker = (name: string, ...domains: string[]) => ({
  type: "cloudflare-workers" as const,
  name,
  routes: domains.map((pattern) => ({ pattern, custom_domain: true })),
  env: {
    staging: {
      name: `${name}-staging`,
      routes: [{ pattern: domains[0]!.replace(DOCS_DOMAIN, `staging.${DOCS_DOMAIN}`), custom_domain: true }],
    },
  },
});

/** A theme demo: `wiki` deploys as `svartz-demo-wiki` at `wiki.demo.svartz.dev`. */
const demo = (theme: string) => ({
  target: worker(`svartz-demo-${theme}`, `${theme}.demo.${DOCS_DOMAIN}`),
  url: `https://${theme}.demo.${DOCS_DOMAIN}`,
});

const demos = {
  minimal: demo("minimal"),
  wiki: demo("wiki"),
  blog: demo("blog"),
  docs: demo("docs"),
  api: demo("api"),
  reference: demo("reference"),
};

export default defineConfig({
  version: "1.0.0",
  defaults: {
    theme: "@svartz/theme-minimal",
  },
  vaults: [
    {
      // Svartz's documentation, built with Svartz.
      id: "docs",
      path: "vaults/docs",
      target: worker("svartz-docs", DOCS_DOMAIN, ...DOCS_MIRRORS),
      plugins: [apiReference()],
      theme: {
        base: "@svartz/theme-docs",
        version: cli.version,
        nav: { GitHub: GITHUB, npm: "https://www.npmjs.com/package/svartz" },
      },
      site: {
        title: "Svartz",
        description: "Publish Obsidian vaults as fast, themeable SvelteKit sites.",
        url: `https://${DOCS_DOMAIN}`,
      },
    },
    {
      // Demo for @svartz/theme-minimal, and the kitchen sink: every OFM feature a theme must render.
      id: "showcase",
      path: "vaults/showcase",
      // Press P on a note to present it; reference/slides is a demo deck.
      plugins: [presentation()],
      target: demos.minimal.target,
      site: {
        title: "Backyard Weather Station",
        description: "A Svartz showcase vault that uses every Obsidian Markdown feature.",
        url: demos.minimal.url,
      },
      discovery: { llms: { optional: true } },
    },
    {
      // Demo for @svartz/theme-wiki: a fictional game wiki.
      id: "showcase-wiki",
      path: "vaults/showcase-wiki",
      target: demos.wiki.target,
      theme: { base: "@svartz/theme-wiki" },
      site: {
        title: "Lanternfall Wiki",
        description: "A Svartz showcase for the wiki theme.",
        url: demos.wiki.url,
      },
    },
    {
      // Demo for @svartz/theme-blog: an allotment blog.
      id: "showcase-blog",
      path: "vaults/showcase-blog",
      target: demos.blog.target,
      theme: { base: "@svartz/theme-blog" },
      site: {
        title: "Plot 14",
        description: "Notes from a first-time allotment: what grew, what didn't, and what I'd do again.",
        url: demos.blog.url,
      },
    },
    {
      // Demo for @svartz/theme-docs: part of the @svartz/core reference.
      id: "showcase-docs",
      path: "vaults/showcase-docs",
      target: demos.docs.target,
      theme: {
        base: "@svartz/theme-docs",
        version: "1.0.0",
        routes: { folders: "api" },
        nav: { GitHub: GITHUB, npm: "https://www.npmjs.com/package/@svartz/core" },
      },
      site: {
        title: "@svartz/core",
        description: "A Svartz showcase for the docs theme.",
        url: demos.docs.url,
      },
    },
    {
      // Demo for @svartz/theme-api-docs: a REST and GraphQL shelter API.
      id: "showcase-api",
      path: "vaults/showcase-api",
      target: demos.api.target,
      theme: {
        base: "@svartz/theme-api-docs",
        version: "v2",
        baseUrl: "https://api.harbour.example/v2",
        routes: { folders: "reference" },
        nav: { Status: "https://status.harbour.example", Changelog: "https://harbour.example/changelog" },
      },
      site: {
        title: "Harbour Shelter API",
        description: "A Svartz showcase for the API docs theme.",
        url: demos.api.url,
      },
    },
    {
      // Demo for composed reference themes, @svartz/theme-mcp-docs among them: guides, HTTP, GraphQL, and MCP tools
      // in one site.
      id: "showcase-reference",
      path: "vaults/showcase-reference",
      target: demos.reference.target,
      theme: {
        base: ["@svartz/theme-api-docs", "@svartz/theme-mcp-docs"],
        version: "v2",
        baseUrl: "https://api.harbour.example/v2",
        graphqlEndpoint: "https://api.harbour.example/graphql",
        routes: { folders: "reference" },
        nav: { Status: "https://status.harbour.example" },
      },
      site: {
        title: "Harbour developer docs",
        description: "A Svartz showcase for composing the API and MCP docs themes.",
        url: demos.reference.url,
      },
    },
  ],
});
