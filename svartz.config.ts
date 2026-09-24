import { defineConfig } from "@svartz/config";

export default defineConfig({
  version: "1.0.0",
  defaults: {
    theme: "@svartz/theme-minimal",
  },
  vaults: [
    {
      id: "docs",
      path: "vaults/docs",
      target: {
        type: "static",
      },
      site: {
        title: "Svartz Documentation",
        description: "Documentation for the Svartz static publishing toolkit.",
      },
    },
    {
      // Kitchen-sink vault: every OFM feature a theme must render.
      id: "showcase",
      path: "vaults/showcase",
      target: {
        type: "static",
      },
      site: {
        title: "Backyard Weather Station",
        description: "A Svartz showcase vault that uses every Obsidian Markdown feature.",
      },
    },
    {
      // Showcase for @svartz/theme-wiki: a fictional game wiki.
      id: "showcase-wiki",
      path: "vaults/showcase-wiki",
      target: { type: "static" },
      theme: { base: "@svartz/theme-wiki" },
      site: {
        title: "Lanternfall Wiki",
        description: "A Svartz showcase for the wiki theme.",
      },
    },
    {
      // Showcase for @svartz/theme-blog: an allotment blog.
      id: "showcase-blog",
      path: "vaults/showcase-blog",
      target: { type: "static" },
      theme: { base: "@svartz/theme-blog" },
      site: {
        title: "Plot 14",
        description: "Notes from a first-time allotment: what grew, what didn't, and what I'd do again.",
        url: "https://plot14.example",
      },
    },
    {
      // Showcase for @svartz/theme-docs: part of the @svartz/core reference.
      id: "showcase-docs",
      path: "vaults/showcase-docs",
      target: { type: "static" },
      theme: {
        base: "@svartz/theme-docs",
        version: "1.0.0",
        routes: { folders: "api" },
        nav: { GitHub: "https://github.com/mia-cx/svartz", npm: "https://www.npmjs.com/package/@svartz/core" },
      },
      site: {
        title: "@svartz/core",
        description: "A Svartz showcase for the docs theme.",
      },
    },
    {
      // Showcase for @svartz/theme-api-docs: a REST and GraphQL shelter API.
      id: "showcase-api",
      path: "vaults/showcase-api",
      target: { type: "static" },
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
      },
    },
  ],
});
