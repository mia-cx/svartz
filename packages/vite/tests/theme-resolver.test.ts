import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ResolvedConfig } from "@svartz/core";
import { CONTRACT_VERSION } from "@svartz/core";
import {
  BUILTIN_THEME_MODULE_ID,
  createThemeVirtualModuleSource,
  loadThemeModule,
  resolveThemePackageRoot,
  resolveThemeRuntimeImport,
} from "../src/theme-resolver";

const tempDirs: string[] = [];

function createConfig(themeBase: string | readonly string[], themeConfig: Record<string, unknown> = {}) {
  return {
    theme: { base: themeBase, ...themeConfig },
  } as unknown as ResolvedConfig;
}

async function writePackage(root: string, name: string, files: Record<string, string>) {
  await mkdir(root, { recursive: true });
  await writeFile(path.join(root, "package.json"), JSON.stringify({
    name, type: "module", exports: { ".": "./index.js", "./runtime": "./runtime.js" },
  }));
  await Promise.all(Object.entries(files).map(([file, source]) => writeFile(path.join(root, file), source)));
}

/**
 * A host with two composable themes. Only the first theme installs theme-minimal,
 * as under pnpm's strict layout; its `composeThemes` records what it composed.
 */
async function createComposableHost() {
  const hostRoot = await mkdtemp(path.join(os.tmpdir(), "svartz-compose-host-"));
  tempDirs.push(hostRoot);
  const composer = (entry: string) => `export const composeThemes = (extensions, config) => ({
    id: extensions[0].id, version: "1.0.0", contractVersion: ${JSON.stringify(CONTRACT_VERSION)},
    layouts: { defaultPage: { default: {} }, notePage: { default: {} } },
    routes: [{ id: "note", pattern: "/:slug", layoutSlot: "notePage", priority: 1 }],
    composed: { entry: ${JSON.stringify(entry)}, extensions: extensions.map((extension) => extension.id), config },
  });\n`;
  const extensions = (id: string) => `export const extensions = [{ id: ${JSON.stringify(id)} }];\n`;
  const themeA = path.join(hostRoot, "node_modules/@acme/theme-a");
  await writePackage(themeA, "@acme/theme-a", { "index.js": extensions("@acme/theme-a"), "runtime.js": extensions("@acme/theme-a") });
  await writePackage(path.join(themeA, "node_modules/@svartz/theme-minimal"), "@svartz/theme-minimal", {
    "index.js": composer("build"), "runtime.js": composer("runtime"),
  });
  await writePackage(path.join(hostRoot, "node_modules/@acme/theme-b"), "@acme/theme-b", {
    "index.js": extensions("@acme/theme-b"), "runtime.js": extensions("@acme/theme-b"),
  });
  return hostRoot;
}

async function createThemeFixture(themeName: string) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "svartz-theme-"));
  tempDirs.push(tempDir);

  const themeRoot = path.join(tempDir, "node_modules", themeName);
  await mkdir(themeRoot, { recursive: true });
  await writeFile(
    path.join(themeRoot, "package.json"),
    JSON.stringify({
      name: themeName,
      type: "module",
      exports: {
        ".": "./index.js",
      },
    }),
  );
  await writeFile(
    path.join(themeRoot, "index.js"),
    [
      "export default {",
      `  id: ${JSON.stringify(themeName)},`,
      "  version: '1.0.0',",
      `  contractVersion: ${JSON.stringify(CONTRACT_VERSION)},`,
      "  layouts: { defaultPage: { default: {} }, notePage: { default: {} } },",
      "  routes: [{ id: 'note', pattern: '/:slug', layoutSlot: 'notePage', priority: 1 }],",
      "};",
      "",
    ].join("\n"),
  );

  return { tempDir, themeRoot: await realpath(themeRoot) };
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("@svartz/vite theme bridge", () => {
  it("builds a virtual theme module that re-exports the real theme package", () => {
    const source = createThemeVirtualModuleSource("@svartz/theme-minimal");

    expect(source).toContain('import * as themeModule from "@svartz/theme-minimal";');
    expect(source).toMatch(/import \{ matchThemeRoute, materializeTheme, resolveThemeRouteToArtifactKey \} from ".*\/core\/dist\/index\.js";/);
    expect(source).toContain("export const ready = materializeTheme(_manifest).then");
    expect(source).not.toContain("await materializeTheme(_manifest)");
    expect(source).toContain("return matchThemeRoute(routes, input);");
    expect(source).toContain("return resolveThemeRouteToArtifactKey(routes, input);");
  });

  it("prepares lazy components while keeping route exports live", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "svartz-lazy-theme-"));
    tempDirs.push(tempDir);
    const manifestPath = path.join(tempDir, "manifest.mjs");
    const runtimePath = path.join(tempDir, "runtime.mjs");
    await writeFile(manifestPath, `export default {
      id: "lazy-test", version: "1.0.0", contractVersion: "1.0.0",
      layouts: { defaultPage: { default: {} }, notePage: { default: {} } },
      routes: [{ id: "tag", pattern: "/tags/:slug", layoutSlot: "defaultPage",
        component: () => Promise.resolve({ default: { loaded: true } }) }],
    };`);
    await writeFile(runtimePath, createThemeVirtualModuleSource(pathToFileURL(manifestPath).href));

    const runtime = await import(pathToFileURL(runtimePath).href);
    await runtime.ready;

    expect(runtime.theme.routes).toBe(runtime.routes);
    expect(runtime.resolveRuntimeRoute({ pathname: "/tags/guides/" })?.route.component)
      .toEqual({ default: { loaded: true } });
  });

  it("uses the built-in theme's SSR runtime entry", () => {
    expect(resolveThemeRuntimeImport(createConfig(BUILTIN_THEME_MODULE_ID))).toMatch(/^file:\/\/.*\/dist\/runtime\.js$/);
  });

  it("resolves the built-in theme from Svartz when a host has no theme dependency", async () => {
    const hostRoot = await mkdtemp(path.join(os.tmpdir(), "svartz-host-theme-"));
    tempDirs.push(hostRoot);

    expect(resolveThemePackageRoot(BUILTIN_THEME_MODULE_ID, hostRoot)).toContain("theme");
    expect(resolveThemeRuntimeImport(createConfig(BUILTIN_THEME_MODULE_ID), hostRoot))
      .toMatch(/\/dist\/runtime\.js$/);
  });

  it("loads an unbuilt local source manifest for the artifact pipeline", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "svartz-theme-source-"));
    tempDirs.push(tempDir);
    const sourcePath = path.join(tempDir, "index.ts");
    await writeFile(sourcePath, `export default {
      id: "source-theme", version: "1.0.0", contractVersion: "1.0.0",
      layouts: { defaultPage: { default: {} }, notePage: { default: {} } },
      routes: [{ id: "note", pattern: "/:slug", layoutSlot: "notePage", priority: 1 }],
    };`);

    const theme = await loadThemeModule(
      () => Promise.reject(new Error("packaged theme should not load")),
      createConfig("@unbuilt/theme"), tempDir, { "@unbuilt/theme": sourcePath },
    );
    expect(theme.id).toBe("source-theme");
  });

  it("resolves non-default themes from the provided app root", async () => {
    const themeName = "@acme/theme-published";
    const { tempDir, themeRoot } = await createThemeFixture(themeName);

    const loadedTheme = await loadThemeModule((id) => import(id), createConfig(themeName), tempDir);

    expect(resolveThemeRuntimeImport(createConfig(themeName), tempDir)).toMatch(/^file:\/\//);
    expect(resolveThemePackageRoot(themeName, tempDir)).toBe(themeRoot);
    expect(loadedTheme.id).toBe(themeName);
  });

  it("loads an absolute theme outside the app root", async () => {
    const themeName = "@acme/theme-external";
    const { themeRoot, tempDir } = await createThemeFixture(themeName);
    const appRoot = path.join(tempDir, "app");
    await mkdir(appRoot);

    expect(resolveThemePackageRoot(themeRoot, appRoot)).toBe(themeRoot);
    expect((await loadThemeModule((id) => import(id), createConfig(themeRoot), appRoot)).id).toBe(themeName);
  });

  it("loads an explicit directory theme with only package exports", async () => {
    const themeRoot = await mkdtemp(path.join(os.tmpdir(), "svartz-exports-theme-"));
    tempDirs.push(themeRoot);
    await mkdir(path.join(themeRoot, "dist"));
    await writeFile(path.join(themeRoot, "package.json"), JSON.stringify({
      name: "@acme/exports-theme", type: "module",
      exports: { ".": { import: "./dist/index.js" }, "./runtime": "./browser/entry.js" },
    }));
    await mkdir(path.join(themeRoot, "browser"));
    await writeFile(path.join(themeRoot, "browser/entry.js"), "export const runtime = true;\n");
    await writeFile(path.join(themeRoot, "dist/index.js"), `export default {
      id: "exports-theme", version: "1.0.0", contractVersion: "1.0.0",
      layouts: { defaultPage: { default: {} }, notePage: { default: {} } },
      routes: [{ id: "note", pattern: "/:slug", layoutSlot: "notePage", priority: 1 }],
    };`);

    expect(resolveThemePackageRoot(themeRoot, os.tmpdir())).toBe(themeRoot);
    expect(resolveThemeRuntimeImport(createConfig(themeRoot), os.tmpdir()))
      .toBe(pathToFileURL(path.join(themeRoot, "browser/entry.js")).href);
    expect((await loadThemeModule((id) => import(id), createConfig(themeRoot), os.tmpdir())).id)
      .toBe("exports-theme");
  });

  it("composes a theme list's build extensions with the first theme's theme-minimal", async () => {
    const hostRoot = await createComposableHost();
    const config = createConfig(["@acme/theme-a", "@acme/theme-b"], { version: "v2" });

    const theme = await loadThemeModule((id) => import(id), config, hostRoot);

    expect(theme.id).toBe("@acme/theme-a");
    expect((theme as unknown as { composed: unknown }).composed).toEqual({
      entry: "build", extensions: ["@acme/theme-a", "@acme/theme-b"], config: { version: "v2" },
    });
  });

  it("generates a runtime theme module that composes a theme list", async () => {
    const hostRoot = await createComposableHost();
    const config = createConfig(["@acme/theme-a", "@acme/theme-b"], { version: "v2" });
    const runtimePath = path.join(hostRoot, "theme.mjs");
    await writeFile(runtimePath, createThemeVirtualModuleSource(resolveThemeRuntimeImport(config, hostRoot), { version: "v2" }));

    const runtime = await import(pathToFileURL(runtimePath).href);
    await runtime.ready;

    expect(runtime.theme.composed).toEqual({
      entry: "runtime", extensions: ["@acme/theme-a", "@acme/theme-b"], config: { version: "v2" },
    });
  });

  it("rejects a listed theme that exports no extensions", async () => {
    const hostRoot = await createComposableHost();
    const { themeRoot } = await createThemeFixture("@acme/theme-plain");

    await expect(loadThemeModule((id) => import(id), createConfig(["@acme/theme-a", themeRoot]), hostRoot))
      .rejects.toThrow(`Theme "${themeRoot}" isn't a composable theme; it exports no \`extensions\`.`);
  });

  it("fails on a missing configured theme instead of falling back", async () => {
    const missing = createConfig("@acme/theme-missing");
    await expect(loadThemeModule((id) => import(id), missing, os.tmpdir())).rejects.toThrow(
      'Could not resolve theme "@acme/theme-missing"',
    );
  });
});
