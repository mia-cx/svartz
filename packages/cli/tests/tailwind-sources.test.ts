import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ResolvedConfig } from "@svartz/config";
import {
  createTailwindSourcesCss,
  getGeneratedTailwindSourcesPath,
  getTailwindSourceGlobs,
} from "../src/tailwind-sources";

const tempDirs: string[] = [];

function createConfig(themeBase: string): ResolvedConfig {
  return {
    theme: { base: themeBase },
  } as unknown as ResolvedConfig;
}

async function createPackage(root: string, name: string, dependencies?: Record<string, string>, packed = false) {
  await mkdir(root, { recursive: true });
  await writeFile(
    path.join(root, "package.json"),
    JSON.stringify({
      name,
      type: "module",
      exports: {
        ".": "./index.js",
      },
      ...(dependencies ? { dependencies } : {}),
    }),
  );
  await writeFile(path.join(root, "index.js"), "export default {};\n");
  await mkdir(path.join(root, packed ? "dist" : "src"), { recursive: true });
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("tailwind source generation", () => {
  it("collects theme and dependency source globs from the app root", async () => {
    const appRoot = await mkdtemp(path.join(os.tmpdir(), "svartz-tailwind-"));
    tempDirs.push(appRoot);

    const themeRoot = path.join(appRoot, "node_modules", "@acme", "theme-published");
    const uiRoot = path.join(appRoot, "node_modules", "@acme", "ui");

    await createPackage(uiRoot, "@acme/ui");
    await createPackage(themeRoot, "@acme/theme-published", { "@acme/ui": "1.0.0" });

    const sourceGlobs = getTailwindSourceGlobs(appRoot, createConfig("@acme/theme-published"));

    expect(sourceGlobs).toContain(path.join(await realpath(themeRoot), "src", "**/*.{svelte,js,ts}"));
    expect(sourceGlobs).toContain(path.join(await realpath(uiRoot), "src", "**/*.{svelte,js,ts}"));
  });

  it("scans dist in packed theme and UI packages without src", async () => {
    const appRoot = await mkdtemp(path.join(os.tmpdir(), "svartz-tailwind-packed-"));
    tempDirs.push(appRoot);
    const themeRoot = path.join(appRoot, "node_modules", "@acme", "theme-published");
    const uiRoot = path.join(appRoot, "node_modules", "@acme", "ui");
    await createPackage(uiRoot, "@acme/ui", undefined, true);
    await createPackage(themeRoot, "@acme/theme-published", { "@acme/ui": "1.0.0" }, true);

    expect(getTailwindSourceGlobs(appRoot, createConfig("@acme/theme-published"))).toEqual([
      path.join(await realpath(themeRoot), "dist", "**/*.{svelte,js,ts}"),
      path.join(await realpath(uiRoot), "dist", "**/*.{svelte,js,ts}"),
    ]);
  });

  it("scans runtime component peers but skips dev-only and framework packages", async () => {
    const appRoot = await mkdtemp(path.join(os.tmpdir(), "svartz-tailwind-peers-"));
    tempDirs.push(appRoot);
    const themeRoot = path.join(appRoot, "node_modules", "@acme", "theme");
    const uiRoot = path.join(appRoot, "node_modules", "@acme", "ui");
    const devRoot = path.join(appRoot, "node_modules", "@acme", "build-tools");
    await createPackage(uiRoot, "@acme/ui", undefined, true);
    await createPackage(devRoot, "@acme/build-tools", undefined, true);
    await createPackage(themeRoot, "@acme/theme", undefined, true);
    await writeFile(path.join(themeRoot, "package.json"), JSON.stringify({
      name: "@acme/theme",
      exports: { ".": "./index.js" },
      peerDependencies: { "@acme/ui": "^1.0.0", svelte: "^5.0.0" },
      devDependencies: { "@acme/ui": "^1.0.0", "@acme/build-tools": "^1.0.0" },
    }));

    const globs = getTailwindSourceGlobs(appRoot, createConfig("@acme/theme"));
    expect(globs).toContain(path.join(await realpath(uiRoot), "dist", "**/*.{svelte,js,ts}"));
    expect(globs.some((glob) => glob.includes("build-tools"))).toBe(false);
    expect(globs.some((glob) => glob.includes("/svelte/"))).toBe(false);
  });

  it("writes relative @source directives for the generated css bridge", () => {
    const cssFilePath = path.join(
      "/workspace/.svartz/vaults/docs",
      "tailwind-sources.css",
    );
    const cssSource = createTailwindSourcesCss(
      [
        "/workspace/themes/minimal/src/**/*.{svelte,js,ts}",
        "/workspace/node_modules/@svartz/ui/src/**/*.{svelte,js,ts}",
      ],
      cssFilePath,
    );

    expect(cssSource).toContain('@source "../../../themes/minimal/src/**/*.{svelte,js,ts}";');
    expect(cssSource).toContain(
      '@source "../../../node_modules/@svartz/ui/src/**/*.{svelte,js,ts}";',
    );
  });

  it("adds the Tailwind entry and plugins for a host app", () => {
    const css = createTailwindSourcesCss(
      ["/workspace/node_modules/@svartz/ui/dist/**/*.svelte"],
      "/workspace/.svartz/host/tailwind-sources.css",
      true,
    );
    expect(css).toContain("@import 'tailwindcss';");
    expect(css).toContain('@source "../../node_modules/@svartz/ui/dist/**/*.svelte";');
    expect(css).toContain("@plugin '@tailwindcss/typography';");
  });

  it("uses the vault build root for the generated css file", () => {
    const generatedPath = getGeneratedTailwindSourcesPath(
      {
        id: "docs",
        outDir: "/workspace/.svartz/vaults/docs/dist",
      } as unknown as ResolvedConfig,
    );

    expect(generatedPath).toContain(path.join(".svartz", "vaults", "docs", "tailwind-sources.css"));
  });
});
