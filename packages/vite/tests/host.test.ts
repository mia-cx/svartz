import { afterEach, expect, it, vi } from "vitest";
import type { ConfigEnv, UserConfig } from "vite";
import { withSvartzHost } from "../src/host";

afterEach(() => vi.unstubAllEnvs());

it("keeps host Vite settings and supplies aliases for the secondary Kit build", async () => {
  vi.stubEnv("SVARTZ_THEME_MODULE_PATH", "/generated/theme.ts");
  vi.stubEnv("SVARTZ_ARTIFACTS_MODULE_PATH", "/generated/artifacts.ts");
  vi.stubEnv("SVARTZ_TAILWIND_SOURCES_PATH", "/generated/sources.css");
  const wrapped = withSvartzHost(({ mode }) => ({
    define: { __HOST_MODE__: JSON.stringify(mode) },
    resolve: { alias: { "host:module": "/host/module.ts" } },
  })) as (env: ConfigEnv) => Promise<UserConfig>;

  const config = await wrapped({ command: "build", mode: "production" });
  expect(config.define).toEqual({ __HOST_MODE__: '"production"' });
  expect(config.resolve?.alias).toMatchObject({
    "host:module": "/host/module.ts",
    "virtual:svartz/theme": "/generated/theme.ts",
    "virtual:svartz/artifacts": "/generated/artifacts.ts",
    "virtual:svartz/tailwind-sources.css": "/generated/sources.css",
  });
});
