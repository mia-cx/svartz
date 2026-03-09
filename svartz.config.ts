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
    },
    {
      id: "obsidian-journal",
      path: "vaults/obsidian-journal",
      target: {
        type: "static",
      },
    },
    {
      id: "vault",
      path: "vaults/vault",
      target: {
        type: "static",
      },
    },
  ],
});
