import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import {
  resolveConfigPaths,
  getVault,
  listVaults,
  VaultPathInvalid,
  VaultIdNotFound,
} from "../src/index.js";
import type { SvartzConfig, ResolvedSvartzConfig } from "../src/index.js";

const PKG_ROOT = resolve(__dirname, "..");
const VALID_VAULT = resolve(__dirname, "fixtures/valid-vault");

const minimalConfig: SvartzConfig = {
  version: "1.0.0",
  vaults: [
    {
      id: "main",
      path: "tests/fixtures/valid-vault",
      target: { type: "static" as const },
    },
  ],
};

describe("resolveConfigPaths", () => {
  it("resolves vault path to absolute", async () => {
    const resolved = await resolveConfigPaths(minimalConfig, PKG_ROOT);
    expect(resolved.vaults[0]!.path).toBe(VALID_VAULT);
  });

  it("applies hardcoded defaults when no defaults or per-vault overrides", async () => {
    const resolved = await resolveConfigPaths(minimalConfig, PKG_ROOT);
    const vault = resolved.vaults[0]!;
    expect(vault.include).toEqual(["**/*.md", "**/*.{jpg,webp,png,avif}"]);
    expect(vault.exclude).toEqual([]);
    expect(vault.linkResolution).toBe("closest");
    expect(vault.rootPath).toBe("/");
    expect(vault.theme.base).toBe("@svartz/theme-minimal");
    expect(vault.theme.config).toEqual({});
  });

  it("applies hardcoded frontmatter defaults", async () => {
    const resolved = await resolveConfigPaths(minimalConfig, PKG_ROOT);
    const fm = resolved.vaults[0]!.frontmatter;
    expect(fm.titleField).toBe("title");
    expect(fm.descriptionField).toBe("description");
    expect(fm.tagsField).toBe("tags");
    expect(fm.aliasesField).toBe("aliases");
    expect(fm.createdAtField).toBe("created_at");
    expect(fm.updatedAtField).toBe("updated_at");
    expect(fm.publishedField).toBe("published");
  });

  it("applies build defaults", async () => {
    const resolved = await resolveConfigPaths(minimalConfig, PKG_ROOT);
    expect(resolved.defaults.build.concurrency).toBe(10);
    expect(resolved.defaults.build.maxRetries).toBe(3);
  });

  it("prefers per-vault values over defaults", async () => {
    const config: SvartzConfig = {
      version: "1.0.0",
      defaults: {
        vault: {
          include: ["**/*.md"],
          exclude: ["archive/**"],
          linkResolution: "shallowest" as const,
        },
      },
      vaults: [
        {
          id: "v1",
          path: "tests/fixtures/valid-vault",
          include: ["*.mdx"],
          linkResolution: "absolute" as const,
          target: { type: "static" as const },
        },
      ],
    };
    const resolved = await resolveConfigPaths(config, PKG_ROOT);
    const vault = resolved.vaults[0]!;
    expect(vault.include).toEqual(["*.mdx"]);
    expect(vault.exclude).toEqual(["archive/**"]);
    expect(vault.linkResolution).toBe("absolute");
  });

  it("normalizes string theme to object", async () => {
    const config: SvartzConfig = {
      version: "1.0.0",
      vaults: [
        {
          id: "v1",
          path: "tests/fixtures/valid-vault",
          theme: "@svartz/theme-docs",
          target: { type: "static" as const },
        },
      ],
    };
    const resolved = await resolveConfigPaths(config, PKG_ROOT);
    expect(resolved.vaults[0]!.theme).toEqual({
      base: "@svartz/theme-docs",
      config: {},
    });
  });

  it("merges default and vault theme configs", async () => {
    const config: SvartzConfig = {
      version: "1.0.0",
      defaults: {
        vault: {
          theme: {
            base: "@svartz/theme-minimal",
            colors: { brand: "red", accent: "blue" },
          },
        },
      },
      vaults: [
        {
          id: "v1",
          path: "tests/fixtures/valid-vault",
          theme: {
            base: "@svartz/theme-docs",
            colors: { accent: "green" },
          },
          target: { type: "static" as const },
        },
      ],
    };
    const resolved = await resolveConfigPaths(config, PKG_ROOT);
    const theme = resolved.vaults[0]!.theme;
    expect(theme.base).toBe("@svartz/theme-docs");
    expect(theme.config).toEqual({
      colors: { accent: "green" },
    });
  });

  it("merges frontmatter: vault overrides default", async () => {
    const config: SvartzConfig = {
      version: "1.0.0",
      defaults: {
        vault: {
          frontmatter: { titleField: "name", tagsField: "labels" },
        },
      },
      vaults: [
        {
          id: "v1",
          path: "tests/fixtures/valid-vault",
          frontmatter: { titleField: "heading" },
          target: { type: "static" as const },
        },
      ],
    };
    const resolved = await resolveConfigPaths(config, PKG_ROOT);
    const fm = resolved.vaults[0]!.frontmatter;
    expect(fm.titleField).toBe("heading");
    expect(fm.tagsField).toBe("labels");
    expect(fm.descriptionField).toBe("description");
  });

  it("resolves workspace.rootDir relative to configDir", async () => {
    const config: SvartzConfig = {
      version: "1.0.0",
      workspace: { rootDir: "tests/fixtures" },
      vaults: [
        {
          id: "v1",
          path: "valid-vault",
          target: { type: "static" as const },
        },
      ],
    };
    const resolved = await resolveConfigPaths(config, PKG_ROOT);
    expect(resolved.workspace.rootDir).toBe(
      resolve(PKG_ROOT, "tests/fixtures"),
    );
    expect(resolved.vaults[0]!.path).toBe(VALID_VAULT);
  });

  it("throws VaultPathInvalid for non-existent vault path", async () => {
    const config: SvartzConfig = {
      version: "1.0.0",
      vaults: [
        {
          id: "bad",
          path: "nonexistent-vault-path",
          target: { type: "static" as const },
        },
      ],
    };
    await expect(
      resolveConfigPaths(config, PKG_ROOT),
    ).rejects.toThrow(VaultPathInvalid);

    try {
      await resolveConfigPaths(config, PKG_ROOT);
    } catch (e) {
      expect((e as VaultPathInvalid)._tag).toBe("VaultPathInvalid");
      expect((e as VaultPathInvalid).vaultId).toBe("bad");
    }
  });
});

describe("getVault", () => {
  let resolved: ResolvedSvartzConfig;

  it("returns a vault by id", async () => {
    resolved = await resolveConfigPaths(
      {
        version: "1.0.0",
        vaults: [
          {
            id: "docs",
            path: "tests/fixtures/valid-vault",
            target: { type: "pages" as const, projectName: "docs" },
          },
          {
            id: "wiki",
            path: "tests/fixtures/valid-vault",
            target: { type: "worker" as const, name: "wiki" },
          },
        ],
      },
      PKG_ROOT,
    );
    const vault = await getVault(resolved, "wiki");
    expect(vault.id).toBe("wiki");
    expect(vault.target).toEqual({ type: "worker", name: "wiki" });
  });

  it("throws VaultIdNotFound for unknown id", async () => {
    resolved = await resolveConfigPaths(minimalConfig, PKG_ROOT);
    await expect(getVault(resolved, "nope")).rejects.toThrow(VaultIdNotFound);
    try {
      await getVault(resolved, "nope");
    } catch (e) {
      expect((e as VaultIdNotFound)._tag).toBe("VaultIdNotFound");
      expect((e as VaultIdNotFound).vaultId).toBe("nope");
    }
  });
});

describe("listVaults", () => {
  it("returns summaries for all vaults", async () => {
    const resolved = await resolveConfigPaths(
      {
        version: "1.0.0",
        vaults: [
          {
            id: "docs",
            path: "tests/fixtures/valid-vault",
            theme: "@svartz/theme-docs",
            target: { type: "pages" as const, projectName: "docs" },
          },
          {
            id: "wiki",
            path: "tests/fixtures/valid-vault",
            target: { type: "worker" as const, name: "wiki" },
          },
        ],
      },
      PKG_ROOT,
    );
    const summaries = listVaults(resolved);
    expect(summaries).toHaveLength(2);
    expect(summaries[0]!.id).toBe("docs");
    expect(summaries[0]!.themeBase).toBe("@svartz/theme-docs");
    expect(summaries[1]!.themeBase).toBe("@svartz/theme-minimal");
  });
});
