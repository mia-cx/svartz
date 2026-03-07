export default {
  version: "1.0.0",
  defaults: {
    build: {
      concurrency: 2,
      maxRetries: 2,
    },
  },
  vaults: [
    {
      id: "basic-vault",
      path: "../basic-vault",
      include: ["**/*.md"],
      exclude: ["projects/svartz/**"],
      frontmatter: {
        publishedField: "published",
      },
      target: { type: "static" },
    },
    {
      id: "obsidian-journal",
      path: "../obsidian-journal",
      include: ["**/*.md"],
      exclude: ["Templates/**"],
      frontmatter: {
        publishedField: "published",
      },
      target: { type: "static" },
    }
  ],
};
