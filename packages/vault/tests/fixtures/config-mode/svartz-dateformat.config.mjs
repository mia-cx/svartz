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
      id: "docs",
      path: "../basic-vault",
      include: ["projects/**/*.md"],
      exclude: ["projects/svartz/**"],
      frontmatter: {
        publishedField: "published",
        dateFormat: "YYYY-MM-DD[T]HH:mm:ss",
      },
      target: { type: "static" },
    },
  ],
};
