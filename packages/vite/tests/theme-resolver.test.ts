import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
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
  resolveThemeRuntimeImportId,
} from "../src/theme-resolver";

const tempDirs: string[] = [];

function createConfig(themeBase: string) {
  return {
    theme: { base: themeBase },
  } as unknown as ResolvedConfig;
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
      "  layouts: { defaultPage: './DefaultPage.svelte', notePage: './NotePage.svelte' },",
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
    expect(source).toContain(
      'import { matchThemeRoute, resolveThemeRouteToArtifactKey } from "@svartz/core";',
    );
    expect(source).toContain(
      "export const theme = typeof _themeExport === 'function' ? _themeExport(_themeConfig) : _themeExport;",
    );
    expect(source).toContain("return matchThemeRoute(routes, input);");
    expect(source).toContain("return resolveThemeRouteToArtifactKey(routes, input);");
  });

  it("keeps the built-in fallback theme import rooted in @svartz/vite", () => {
    expect(resolveThemeRuntimeImportId(createConfig(BUILTIN_THEME_MODULE_ID))).toBe(
      BUILTIN_THEME_MODULE_ID,
    );
  });

  it("resolves non-default themes from the provided app root", async () => {
    const themeName = "@acme/theme-published";
    const { tempDir, themeRoot } = await createThemeFixture(themeName);

    const runtimeImportId = resolveThemeRuntimeImportId(createConfig(themeName), tempDir);
    const loadedTheme = await loadThemeModule((id) => import(id), createConfig(themeName), tempDir);

    expect(runtimeImportId.startsWith("file://")).toBe(true);
    expect(resolveThemePackageRoot(themeName, tempDir)).toBe(themeRoot);
    expect(loadedTheme.id).toBe(themeName);
  });
});
