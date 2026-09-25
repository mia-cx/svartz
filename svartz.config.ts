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
  ],
});
