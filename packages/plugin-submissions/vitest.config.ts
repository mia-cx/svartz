import { svelte } from "@sveltejs/vite-plugin-svelte";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig, type Plugin } from "vitest/config";

/**
 * Micromark's entity decoder in its `worker` build, as tsup bundles the preview worker: its `browser` build needs a
 * `document`, which the worker lacks. Both Vite and its dependency pre-bundling load the one in place of the other.
 */
const DOM_DECODER = /decode-named-character-reference[\\/]index\.dom\.js$/;
const WORKER_DECODER = 'export * from "./index.js";';
const workerEntities: Plugin = {
  name: "submissions:worker-entities",
  load: (id) => (DOM_DECODER.test(id) ? WORKER_DECODER : undefined),
};

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "node",
          environment: "node",
          include: ["tests/**/*.test.ts"],
          exclude: ["tests/**/*.browser.test.ts"],
        },
      },
      {
        // The Split preview's tests render through @svartz/ui's Svelte content components.
        plugins: [svelte(), workerEntities],
        optimizeDeps: {
          // Found only once Split starts the worker; bundled up front so Vite doesn't reload the page mid-test.
          include: ["@svartz/plugins/preview"],
          esbuildOptions: {
            plugins: [{
              name: "submissions:worker-entities",
              setup(build) {
                build.onLoad({ filter: DOM_DECODER }, () => ({ contents: WORKER_DECODER }));
              },
            }],
          },
        },
        test: {
          name: "browser",
          include: ["tests/**/*.browser.test.ts"],
          browser: {
            enabled: true,
            provider: playwright(),
            instances: [{ browser: "chromium", headless: true }],
          },
        },
      },
    ],
  },
});
