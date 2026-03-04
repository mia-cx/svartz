export default {
  version: "1.0.0",
  workspace: { rootDir: "." },
  defaults: {
    vault: {
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
  },
  vaults: [
    {
      id: "docs",
      path: "tests/fixtures/valid-vault",
      theme: {
        base: "@svartz/theme-docs",
        colors: { accent: "oklch(0.74 0.16 190)" },
      },
      rootPath: "/docs",
      target: { type: "pages", projectName: "svartz-docs" },
    },
    {
      id: "wiki",
      path: "tests/fixtures/valid-vault",
      include: ["**/*.md"],
      exclude: ["private/**"],
      target: { type: "worker", name: "wiki" },
    },
  ],
};
