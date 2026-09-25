import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { resolveConfig } from "@svartz/config";
import { resolveThemePackageRoot, resolveThemeRuntimeImportId } from "@svartz/vite";
import {
  getConfigWatchDescriptors,
  getThemeWatchDescriptors,
  isLocalWorkspacePackage,
  matchesWatchDescriptor,
  uniqBuildFilters,
} from "../src/dev-watch";

const tempDirs: string[] = [];

async function createWorkspaceFixture() {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "svartz-workspace-"));
  tempDirs.push(workspaceRoot);

  const appRoot = path.join(workspaceRoot, "apps", "web");
  const localThemeRoot = path.join(workspaceRoot, "themes", "local");
  const rootNodeModules = path.join(workspaceRoot, "node_modules", "@acme");

  await mkdir(appRoot, { recursive: true });
  await mkdir(localThemeRoot, { recursive: true });
  await mkdir(rootNodeModules, { recursive: true });
  await writeFile(path.join(appRoot, "package.json"), JSON.stringify({ name: "@acme/web" }));
  await writeFile(
    path.join(localThemeRoot, "package.json"),
    JSON.stringify({ name: "@acme/theme-local", main: "./index.js" }),
  );
  await writeFile(path.join(localThemeRoot, "index.js"), "module.exports = {};\n");
  await symlink(localThemeRoot, path.join(rootNodeModules, "theme-local"));

  return {
    appRoot,
    localThemeRoot: await realpath(localThemeRoot),
    workspaceRoot: await realpath(workspaceRoot),
  };
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("CLI dev watch helpers", () => {
  it("watches explicit config files exactly", () => {
    const [descriptor] = getConfigWatchDescriptors("/workspace", "/workspace/svartz.config.ts");
    expect(descriptor).toEqual(
      expect.objectContaining({
        path: "/workspace/svartz.config.ts",
        exact: true,
      }),
    );
  });

  it("matches nested files within watched directories", () => {
    expect(
      matchesWatchDescriptor(
        "/workspace/packages/vite/src/index.ts",
        {
          path: "/workspace/packages/vite/src",
          label: "@svartz/vite source",
        },
      ),
    ).toBe(true);
  });

  it("does not match sibling paths outside the watched root", () => {
    expect(
      matchesWatchDescriptor(
        "/workspace/packages/vite/tests/index.test.ts",
        {
          path: "/workspace/packages/vite/src",
          label: "@svartz/vite source",
        },
      ),
    ).toBe(false);
  });

  it("deduplicates rebuild filters while preserving order", () => {
    expect(uniqBuildFilters(["@svartz/vite", "@svartz/core", "@svartz/vite"])).toEqual([
      "@svartz/vite",
      "@svartz/core",
    ]);
  });

  it("resolves theme package roots from the app root", async () => {
    const { appRoot, localThemeRoot } = await createWorkspaceFixture();

    expect(resolveThemePackageRoot("@acme/theme-local", appRoot)).toBe(localThemeRoot);
  });

  it("treats only non-node_modules packages inside the workspace as local themes", async () => {
    const { appRoot, localThemeRoot, workspaceRoot } = await createWorkspaceFixture();

    const resolvedThemeRoot = resolveThemePackageRoot("@acme/theme-local", appRoot);

    expect(resolvedThemeRoot).toBe(localThemeRoot);
    expect(isLocalWorkspacePackage(localThemeRoot, workspaceRoot)).toBe(true);
    expect(
      isLocalWorkspacePackage(path.join(workspaceRoot, "node_modules", "@acme", "theme-local"), workspaceRoot),
    ).toBe(false);
  });

  it("watches local theme source and builds by package name", async () => {
    const { appRoot, localThemeRoot, workspaceRoot } = await createWorkspaceFixture();
    await mkdir(path.join(localThemeRoot, "src"));

    const descriptors = getThemeWatchDescriptors(localThemeRoot, appRoot, workspaceRoot);
    expect(descriptors).toContainEqual(expect.objectContaining({
      path: path.join(localThemeRoot, "src"),
      buildFilters: ["@acme/theme-local"],
    }));
    expect(descriptors.some((descriptor) =>
      matchesWatchDescriptor(path.join(localThemeRoot, "src", "index.ts"), descriptor),
    )).toBe(true);
    expect(getThemeWatchDescriptors(localThemeRoot, appRoot, workspaceRoot, false)[0]?.buildFilters)
      .toEqual([]);
  });

  it("uses the same project-relative theme in config and Vite", async () => {
    const { appRoot, localThemeRoot, workspaceRoot } = await createWorkspaceFixture();
    await mkdir(path.join(workspaceRoot, "vault"));
    const resolved = await resolveConfig({
      version: "1.0.0",
      vaults: [{
        id: "docs",
        path: "vault",
        theme: "./themes/local",
        target: { type: "static" },
      }],
    }, workspaceRoot);
    const vault = resolved.vaults[0]!;

    expect(vault.theme.base).toBe(localThemeRoot);
    expect(resolveThemeRuntimeImportId(vault, appRoot)).toBe(
      pathToFileURL(path.join(localThemeRoot, "index.js")).href,
    );
    expect(getThemeWatchDescriptors(vault.theme.base, appRoot, workspaceRoot)[0]?.buildFilters).toEqual(
      ["@acme/theme-local"],
    );
  });

  it("watches an external absolute theme without a workspace build filter", async () => {
    const { appRoot, workspaceRoot } = await createWorkspaceFixture();
    const externalThemeRoot = path.join(await mkdtemp(path.join(os.tmpdir(), "svartz-external-theme-")), "theme");
    tempDirs.push(path.dirname(externalThemeRoot));
    await mkdir(externalThemeRoot);
    await writeFile(path.join(externalThemeRoot, "package.json"), JSON.stringify({
      name: "@acme/theme-external", main: "./index.js",
    }));
    await writeFile(path.join(externalThemeRoot, "index.js"), "module.exports = {};\n");

    const descriptors = getThemeWatchDescriptors(externalThemeRoot, appRoot, workspaceRoot);
    expect(descriptors).toEqual([{ path: await realpath(externalThemeRoot), label: `${externalThemeRoot} source` }]);
    expect(matchesWatchDescriptor(path.join(externalThemeRoot, "index.js"), descriptors[0]!)).toBe(true);
  });
});
