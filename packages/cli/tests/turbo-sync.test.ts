import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ResolvedConfigSet } from "@svartz/config";
import { syncManagedTurboFiles } from "../src/turbo-sync";

const tempDirs: string[] = [];

async function createPackage(root: string, name: string) {
  await mkdir(root, { recursive: true });
  await writeFile(
    path.join(root, "package.json"),
    JSON.stringify({
      name,
      type: "module",
      exports: {
        ".": "./index.js",
      },
    }),
  );
  await writeFile(path.join(root, "index.js"), "export default {};\n");
}

async function createWorkspaceFixture() {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "svartz-turbo-sync-"));
  tempDirs.push(workspaceRoot);

  await mkdir(path.join(workspaceRoot, "apps", "web"), { recursive: true });
  await mkdir(path.join(workspaceRoot, "vaults", "docs"), { recursive: true });
  await mkdir(path.join(workspaceRoot, "vaults", "obsidian-journal"), { recursive: true });
  await mkdir(path.join(workspaceRoot, "vaults", "vault"), { recursive: true });

  const localThemeRoot = path.join(workspaceRoot, "themes", "minimal");
  await createPackage(localThemeRoot, "@svartz/theme-minimal");

  const nodeModulesThemeDir = path.join(workspaceRoot, "node_modules", "@svartz");
  await mkdir(nodeModulesThemeDir, { recursive: true });
  await symlink(localThemeRoot, path.join(nodeModulesThemeDir, "theme-minimal"));

  const publishedThemeRoot = path.join(workspaceRoot, "node_modules", "@acme", "theme-published");
  await createPackage(publishedThemeRoot, "@acme/theme-published");

  await writeFile(
    path.join(workspaceRoot, "package.json"),
    JSON.stringify(
      {
        name: "fixture",
        private: true,
        scripts: {
          build: "turbo build",
          lint: "turbo lint",
        },
      },
      null,
      2,
    ) + "\n",
  );

  await writeFile(
    path.join(workspaceRoot, "turbo.json"),
    JSON.stringify(
      {
        $schema: "https://turbo.build/schema.json",
        tasks: {
          build: {
            dependsOn: ["^build"],
          },
        },
      },
      null,
      2,
    ) + "\n",
  );

  return {
    workspaceRoot: await realpath(workspaceRoot),
  };
}

function createResolvedConfig(
  workspaceRoot: string,
  vaults: readonly Array<{ id: string; themeBase?: string }>,
): ResolvedConfigSet {
  return {
    version: "1.0.0",
    configDir: workspaceRoot,
    build: {
      concurrency: 10,
      maxRetries: 3,
    },
    vaults: vaults.map((vault) => ({
      id: vault.id,
      path: path.join(workspaceRoot, "vaults", vault.id),
      outDir: path.join(workspaceRoot, ".svartz", "vaults", vault.id, "dist"),
      theme: {
        base: vault.themeBase ?? "@svartz/theme-minimal",
      },
    })),
  } as unknown as ResolvedConfigSet;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("managed Turbo sync", () => {
  it("writes managed svartz scripts and turbo tasks for resolved vaults", async () => {
    const { workspaceRoot } = await createWorkspaceFixture();
    const config = createResolvedConfig(workspaceRoot, [
      { id: "docs" },
      { id: "obsidian-journal", themeBase: "@acme/theme-published" },
    ]);

    await syncManagedTurboFiles(config);

    const packageJson = JSON.parse(await readFile(path.join(workspaceRoot, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const turboJson = JSON.parse(await readFile(path.join(workspaceRoot, "turbo.json"), "utf8")) as {
      tasks: Record<string, Record<string, unknown>>;
    };

    expect(packageJson.scripts["svartz:build"]).toBe("svartz run-managed-task svartz:build");
    expect(packageJson.scripts["svartz:build:docs"]).toBe("svartz build --vault docs");
    expect(packageJson.scripts["svartz:preview:obsidian-journal"]).toBe(
      "svartz preview --vault obsidian-journal",
    );
    expect(packageJson.scripts["svartz:dev"]).toBe(
      "turbo run svartz:dev:docs svartz:dev:obsidian-journal",
    );

    expect(turboJson.tasks["//#svartz:build"]).toEqual({
      dependsOn: ["//#svartz:build:docs", "//#svartz:build:obsidian-journal"],
    });
    expect(turboJson.tasks["//#svartz:build:docs"]).toEqual({
      inputs: [
        "apps/web/**",
        "package.json",
        "pnpm-lock.yaml",
        "svartz.config.*",
        ".svartzrc.*",
        "vaults/docs/**",
      ],
      outputs: [".svartz/vaults/docs/dist/**"],
    });
    expect(turboJson.tasks["//#svartz:build:obsidian-journal"]).toEqual({
      inputs: [
        "apps/web/**",
        "package.json",
        "pnpm-lock.yaml",
        "svartz.config.*",
        ".svartzrc.*",
        "vaults/obsidian-journal/**",
      ],
      outputs: [".svartz/vaults/obsidian-journal/dist/**"],
    });
    expect(turboJson.tasks["//#svartz:preview:docs"]).toEqual({
      dependsOn: ["//#svartz:build:docs"],
      cache: false,
      persistent: true,
    });
    expect(turboJson.tasks["//#svartz:dev:docs"]).toEqual({
      cache: false,
      persistent: true,
    });
  });

  it("prunes stale managed entries while preserving unmanaged ones", async () => {
    const { workspaceRoot } = await createWorkspaceFixture();
    await writeFile(
      path.join(workspaceRoot, "package.json"),
      JSON.stringify(
        {
          name: "fixture",
          private: true,
          scripts: {
            build: "turbo build",
            "svartz:build:old-vault": "svartz build --vault old-vault",
            custom: "echo ok",
          },
        },
        null,
        2,
      ) + "\n",
    );
    await writeFile(
      path.join(workspaceRoot, "turbo.json"),
      JSON.stringify(
        {
          $schema: "https://turbo.build/schema.json",
          tasks: {
            build: {
              dependsOn: ["^build"],
            },
            "//#svartz:build:old-vault": {
              dependsOn: ["svartz#build"],
            },
            custom: {
              cache: false,
            },
          },
        },
        null,
        2,
      ) + "\n",
    );

    await syncManagedTurboFiles(createResolvedConfig(workspaceRoot, [{ id: "docs" }]));

    const packageJson = JSON.parse(await readFile(path.join(workspaceRoot, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const turboJson = JSON.parse(await readFile(path.join(workspaceRoot, "turbo.json"), "utf8")) as {
      tasks: Record<string, Record<string, unknown>>;
    };

    expect(packageJson.scripts.custom).toBe("echo ok");
    expect(packageJson.scripts["svartz:build:old-vault"]).toBeUndefined();
    expect(packageJson.scripts["svartz:build:docs"]).toBe("svartz build --vault docs");

    expect(turboJson.tasks.custom).toEqual({ cache: false });
    expect(turboJson.tasks["//#svartz:build:old-vault"]).toBeUndefined();
    expect(turboJson.tasks["//#svartz:build:docs"]).toBeDefined();
  });

  it("is a no-op after the first sync", async () => {
    const { workspaceRoot } = await createWorkspaceFixture();
    const config = createResolvedConfig(workspaceRoot, [{ id: "docs" }, { id: "vault" }]);

    await syncManagedTurboFiles(config);

    const initialPackageJson = await readFile(path.join(workspaceRoot, "package.json"), "utf8");
    const initialTurboJson = await readFile(path.join(workspaceRoot, "turbo.json"), "utf8");

    await syncManagedTurboFiles(config);

    await expect(readFile(path.join(workspaceRoot, "package.json"), "utf8")).resolves.toBe(
      initialPackageJson,
    );
    await expect(readFile(path.join(workspaceRoot, "turbo.json"), "utf8")).resolves.toBe(
      initialTurboJson,
    );
  });
});
