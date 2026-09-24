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
  ],
});
