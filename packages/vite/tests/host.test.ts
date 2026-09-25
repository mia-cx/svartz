import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ConfigEnv, UserConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { hostStylesPlugin, withSvartzHost } from "../src/host";

afterEach(() => vi.unstubAllEnvs());

it("keeps host Vite settings and supplies aliases for the secondary Kit build", async () => {
  vi.stubEnv("SVARTZ_THEME_MODULE_PATH", "/generated/theme.ts");
  vi.stubEnv("SVARTZ_THEME_SOURCE_ID", "@svartz/theme-local");
  vi.stubEnv("SVARTZ_THEME_SOURCE_PATH", "/themes/local/src/lib/index.ts");
  vi.stubEnv("SVARTZ_ARTIFACTS_MODULE_PATH", "/generated/artifacts.ts");
  vi.stubEnv("SVARTZ_TAILWIND_SOURCES_PATH", "/generated/sources.css");
  vi.stubEnv("SVARTZ_HOST_STYLE_MAP", "[]");
  const wrapped = withSvartzHost(({ mode }) => ({
    define: { __HOST_MODE__: JSON.stringify(mode) },
    resolve: { alias: { "host:module": "/host/module.ts" } },
  })) as (env: ConfigEnv) => Promise<UserConfig>;

  const config = await wrapped({ command: "build", mode: "production" });
  expect(config.define).toEqual({ __HOST_MODE__: '"production"' });
  expect(config.resolve?.alias).toMatchObject({
    "host:module": "/host/module.ts",
    "@svartz/theme-local": "/themes/local/src/lib/index.ts",
    "virtual:svartz/theme": "/generated/theme.ts",
    "virtual:svartz/artifacts": "/generated/artifacts.ts",
    "virtual:svartz/tailwind-sources.css": "/generated/sources.css",
  });
  expect(config.plugins?.some((plugin) => plugin && typeof plugin === "object" && "name" in plugin && plugin.name === "@tailwindcss/vite:scan")).toBe(true);
  expect(config.plugins?.some((plugin) => plugin && typeof plugin === "object" && "name" in plugin && plugin.name === "svartz:host-styles")).toBe(true);
});

it("collects imported CSS across Windows paths and accepts a custom route without the registry", async () => {
  const root = await mkdtemp(join(tmpdir(), "svartz-host-styles-"));
  try {
    const stylesPath = join(root, "styles.json");
    const output = join(root, "output");
    await mkdir(join(output, "server"), { recursive: true });
    await writeFile(join(output, "server", "entry.js"), "export const customRoute = true;\n");
    const plugin = hostStylesPlugin([{ modules: ["C:\\vault\\runtime.ts"], pagesRoot: "C:\\vault\\pages", path: stylesPath }]);
    if (typeof plugin.generateBundle !== "function" || typeof plugin.writeBundle !== "function") {
      throw new Error("Host style hooks are missing");
    }
    const chunk = (fileName: string, modules: Record<string, object>, imports: string[], dynamicImports: string[], css: string[]) => ({
      type: "chunk", fileName, modules, imports, dynamicImports,
      viteMetadata: { importedCss: new Set(css) },
    });
    await plugin.generateBundle.call({ environment: { name: "client" } } as never, {} as never, {
      "runtime.js": chunk("runtime.js", { "C:/vault/runtime.ts?import": {} }, ["shared.js"], ["layout.js", "styled.js", "other.js"], ["runtime.css"]),
      "shared.js": chunk("shared.js", {}, ["runtime.js"], [], ["shared.css"]),
      "layout.js": chunk("layout.js", {}, [], [], ["layout.css"]),
      "styled.js": chunk("styled.js", { "C:/vault/pages/styled.svelte": {} }, ["shared.js"], [], ["styled.css"]),
      "other.js": chunk("other.js", { "C:/vault/pages/other.svelte": {} }, [], [], ["other.css"]),
    } as never, false);
    expect(JSON.parse(await readFile(stylesPath, "utf8"))).toEqual({
      shared: ["layout.css", "runtime.css", "shared.css"],
      notes: {
        "pages/styled.svelte": ["styled.css"],
        "pages/other.svelte": ["other.css"],
      },
    });
    await plugin.writeBundle.call({ environment: { name: "client" } } as never, { dir: join(output, "client") } as never, {} as never);
    expect(await readFile(join(output, "server", "entry.js"), "utf8")).toBe("export const customRoute = true;\n");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("keeps an existing host Tailwind plugin without adding a second copy", async () => {
  const wrapped = withSvartzHost({ plugins: [tailwindcss()] }) as (env: ConfigEnv) => Promise<UserConfig>;
  const config = await wrapped({ command: "build", mode: "production" });
  const plugins = config.plugins?.flat(2) ?? [];
  expect(plugins.filter((plugin) => plugin && typeof plugin === "object" && "name" in plugin && plugin.name === "@tailwindcss/vite:scan")).toHaveLength(1);
});
