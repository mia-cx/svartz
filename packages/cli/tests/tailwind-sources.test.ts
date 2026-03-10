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

async function createPackage(root: string, name: string, dependencies?: Record<string, string>) {
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
  await mkdir(path.join(root, "src"), { recursive: true });
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

    expect(sourceGlobs).toContain(path.join(await realpath(themeRoot), "src", "**/*.{svelte,ts}"));
    expect(sourceGlobs).toContain(path.join(await realpath(uiRoot), "src", "**/*.{svelte,ts}"));
  });

  it("writes relative @source directives for the generated css bridge", () => {
    const cssFilePath = path.join(
      "/workspace/.svartz/vaults/docs",
      "tailwind-sources.css",
    );
    const cssSource = createTailwindSourcesCss(
      [
        "/workspace/themes/minimal/src/**/*.{svelte,ts}",
        "/workspace/node_modules/@svartz/ui/src/**/*.{svelte,ts}",
      ],
      cssFilePath,
    );

    expect(cssSource).toContain('@source "../../../themes/minimal/src/**/*.{svelte,ts}";');
    expect(cssSource).toContain(
      '@source "../../../node_modules/@svartz/ui/src/**/*.{svelte,ts}";',
    );
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
