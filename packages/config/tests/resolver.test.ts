import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import {
  resolveConfig,
  getVault,
  listVaults,
  VaultPathInvalid,
  VaultIdNotFound,
} from "../src/index";
import type { SvartzConfig, ResolvedSvartzConfig } from "../src/index";

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
    const resolved = await resolveConfig(minimalConfig, PKG_ROOT);
    expect(resolved.vaults[0]!.path).toBe(VALID_VAULT);
  });

  it("resolves outDir to default .svartz/vaults/<id> when not set", async () => {
    const resolved = await resolveConfig(minimalConfig, PKG_ROOT);
    const vault = resolved.vaults[0]!;
    expect(vault.outDir).toBe(resolve(PKG_ROOT, ".svartz/vaults/main"));
  });

  it("resolves custom outDir relative to config root", async () => {
    const config: SvartzConfig = {
      version: "1.0.0",
      vaults: [
        {
          id: "main",
          path: "tests/fixtures/valid-vault",
          outDir: "build/main",
          target: { type: "static" },
        },
      ],
    };
    const resolved = await resolveConfig(config, PKG_ROOT);
    expect(resolved.vaults[0]!.outDir).toBe(resolve(PKG_ROOT, "build/main"));
  });

  it("applies hardcoded defaults when no defaults or per-vault overrides", async () => {
    const resolved = await resolveConfig(minimalConfig, PKG_ROOT);
    const vault = resolved.vaults[0]!;
    expect(vault.include).toEqual([
      "**/*.md",
      "**/*.mdx",
      "**/*.{jpg,jpeg,png,gif,webp,avif,bmp,svg}",
      "**/*.{mp3,m4a,wav,ogg,flac,webm,3gp}",
      "**/*.{mp4,mov,mkv,ogv}",
      "**/*.pdf",
    ]);
    expect(vault.exclude).toEqual([]);
    expect(vault.linkResolution).toBe("closest");
    expect(vault.theme.base).toBe("@svartz/theme-minimal");
    expect(vault.theme).toEqual({ base: "@svartz/theme-minimal" });
  });

  it("applies hardcoded frontmatter defaults", async () => {
    const resolved = await resolveConfig(minimalConfig, PKG_ROOT);
    const fm = resolved.vaults[0]!.frontmatter;
    expect(fm.titleField).toBe("title");
    expect(fm.descriptionField).toBe("description");
    expect(fm.tagsField).toBe("tags");
    expect(fm.aliasesField).toBe("aliases");
    expect(fm.createdAtField).toBe("created_at");
    expect(fm.updatedAtField).toBe("updated_at");
    expect(fm.publishedField).toBe("published");
  });

  it("prefers per-vault values over defaults", async () => {
    const config: SvartzConfig = {
      version: "1.0.0",
      defaults: {
        include: ["**/*.md"],
        exclude: ["archive/**"],
        linkResolution: "shallowest" as const,
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
    const resolved = await resolveConfig(config, PKG_ROOT);
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
    const resolved = await resolveConfig(config, PKG_ROOT);
    expect(resolved.vaults[0]!.theme).toEqual({
      base: "@svartz/theme-docs",
    });
  });

  it("merges default and vault theme configs", async () => {
    const config: SvartzConfig = {
      version: "1.0.0",
      defaults: {
        theme: {
          base: "@svartz/theme-minimal",
          colors: { brand: "red", accent: "blue" },
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
    const resolved = await resolveConfig(config, PKG_ROOT);
    const theme = resolved.vaults[0]!.theme;
    expect(theme.base).toBe("@svartz/theme-docs");
    expect(theme.colors).toEqual({ accent: "green" });
  });

  it("merges frontmatter: vault overrides default", async () => {
    const config: SvartzConfig = {
      version: "1.0.0",
      defaults: {
        frontmatter: { titleField: "name", tagsField: "labels" },
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
    const resolved = await resolveConfig(config, PKG_ROOT);
    const fm = resolved.vaults[0]!.frontmatter;
    expect(fm.titleField).toBe("heading");
    expect(fm.tagsField).toBe("labels");
    expect(fm.descriptionField).toBe("description");
  });

  it("sets configDir on resolved config", async () => {
    const config: SvartzConfig = {
      version: "1.0.0",
      vaults: [
        {
          id: "v1",
          path: "tests/fixtures/valid-vault",
          target: { type: "static" as const },
        },
      ],
    };
    const resolved = await resolveConfig(config, PKG_ROOT);
    expect(resolved.configDir).toBe(PKG_ROOT);
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
      resolveConfig(config, PKG_ROOT),
    ).rejects.toThrow(VaultPathInvalid);

    try {
      await resolveConfig(config, PKG_ROOT);
    } catch (e) {
      expect((e as VaultPathInvalid)._tag).toBe("VaultPathInvalid");
      expect((e as VaultPathInvalid).vaultId).toBe("bad");
    }
  });
});

describe("getVault", () => {
  let resolved: ResolvedSvartzConfig;

  it("returns a vault by id", async () => {
    resolved = await resolveConfig(
      {
        version: "1.0.0",
        vaults: [
          {
            id: "docs",
            path: "tests/fixtures/valid-vault",
            target: { type: "static" as const },
          },
          {
            id: "wiki",
            path: "tests/fixtures/valid-vault",
            target: { type: "cloudflare-workers" as const, name: "wiki" },
          },
        ],
      },
      PKG_ROOT,
    );
    const vault = await getVault(resolved, "wiki");
    expect(vault.id).toBe("wiki");
    expect(vault.target).toEqual({ type: "cloudflare-workers", name: "wiki" });
  });

  it("throws VaultIdNotFound for unknown id", async () => {
    resolved = await resolveConfig(minimalConfig, PKG_ROOT);
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
    const resolved = await resolveConfig(
      {
        version: "1.0.0",
        vaults: [
          {
            id: "docs",
            path: "tests/fixtures/valid-vault",
            theme: "@svartz/theme-docs",
            target: { type: "static" as const },
          },
          {
            id: "wiki",
            path: "tests/fixtures/valid-vault",
            target: { type: "cloudflare-workers" as const, name: "wiki" },
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
