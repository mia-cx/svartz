import { defineConfig } from "tsup";

export default defineConfig([
  { entry: ["src/index.ts", "src/server.ts", "src/browser.ts"], format: ["esm"], dts: true },
  {
    // The Split preview's worker ships whole, resolved for a worker: a site's bundler takes it as it is. The `worker`
    // condition matters to micromark's entity decoder, whose `browser` build needs a `document` workers lack.
    entry: ["src/preview-worker.ts"],
    format: ["esm"],
    platform: "browser",
    noExternal: [/./],
    esbuildOptions(options) {
      options.conditions = ["worker", "browser"];
    },
  },
]);
