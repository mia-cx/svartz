export default {
  version: "1.0.0",
  defaults: {
    include: ["**/*.md"],
    exclude: ["archive/**"],
    linkResolution: "closest",
    theme: {
      base: "@svartz/theme-minimal",
      colors: { brand: "oklch(0.62 0.19 264)" },
    },
    frontmatter: {
      titleField: "name",
    },
  },
  build: {
    concurrency: 5,
    maxRetries: 2,
  },
  vaults: [
    {
      id: "docs",
      path: "../valid-vault",
      theme: {
        base: "@svartz/theme-docs",
        colors: { accent: "oklch(0.74 0.16 190)" },
      },
      target: { type: "static" },
    },
    {
      id: "wiki",
      path: "../valid-vault",
      include: ["**/*.md"],
      exclude: ["private/**"],
      target: { type: "cloudflare-workers", name: "wiki" },
    },
  ],
};
