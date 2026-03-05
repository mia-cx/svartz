import { defineConfig } from "@svartz/config";

export default defineConfig({
  version: "0.0.1",
  defaults: {},
  vaults: [
    {
      id: "docs",
      path: "vaults/docs",
      target: {
        type: "cloudflare-workers",
        name: "docs",
      },
    },
  ],
});
