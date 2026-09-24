import { describe, it, expect } from "vitest";
import { mkdtemp, mkdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import {
  resolveConfig,
  getVault,
  listVaults,
  VaultPathInvalid,
  VaultMountConflict,
  VaultBuildRootConflict,
  VaultBuildRootResolutionFailed,
  VaultIdConflict,
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
  it("passes only password environment names into resolved vaults", async () => {
    const config: SvartzConfig = {
      ...minimalConfig,
      passwordGroups: { friends: { env: "SVARTZ_FRIENDS_PASSWORD" } },
    };
    const resolved = await resolveConfig(config, PKG_ROOT);
    expect(resolved.vaults[0]?.passwordGroups).toEqual({ friends: { env: "SVARTZ_FRIENDS_PASSWORD" } });
  });

  it("inherits analytics defaults and lets a vault select another provider", async () => {
    const config: SvartzConfig = {
      ...minimalConfig,
      defaults: { analytics: { provider: "plausible" } },
      vaults: [
        minimalConfig.vaults[0]!,
        { id: "other", path: "tests/fixtures/valid-vault", target: { type: "static" }, analytics: { provider: "google", tagId: "G-123" } },
      ],
    };
    const resolved = await resolveConfig(config, PKG_ROOT);
    expect(resolved.vaults.map((vault) => vault.analytics)).toEqual([
      { provider: "plausible" },
      { provider: "google", tagId: "G-123" },
    ]);
  });

  it("rejects duplicate vault ids before artifact paths collide", async () => {
    const config: SvartzConfig = {
      version: "1.0.0",
      vaults: [
        { id: "same", path: "tests/fixtures/valid-vault", mountPath: "/blog", target: { type: "host" } },
        { id: "same", path: "tests/fixtures/valid-vault", mountPath: "/work", target: { type: "host" } },
      ],
    };
    await expect(resolveConfig(config, PKG_ROOT)).rejects.toThrow(VaultIdConflict);
  });
  it.each([["/blog", "/blog"], ["/blog", "/blog/work"], ["", "/blog"]])(
    "rejects overlapping host mounts %s and %s",
    async (firstMount, secondMount) => {
      const config: SvartzConfig = {
        version: "1.0.0",
        vaults: [
          { id: "blog", path: "tests/fixtures/valid-vault", mountPath: firstMount, target: { type: "host" } },
          { id: "work", path: "tests/fixtures/valid-vault", mountPath: secondMount, target: { type: "host" } },
        ],
      };
      await expect(resolveConfig(config, PKG_ROOT)).rejects.toThrow(VaultMountConflict);
    },
  );

  it("accepts separate host mounts", async () => {
    const config: SvartzConfig = {
      version: "1.0.0",
      vaults: [
        { id: "blog", path: "tests/fixtures/valid-vault", mountPath: "/blog", target: { type: "host" } },
        { id: "work", path: "tests/fixtures/valid-vault", mountPath: "/work", target: { type: "host" } },
      ],
    };
    expect((await resolveConfig(config, PKG_ROOT)).vaults.map((vault) => vault.mountPath)).toEqual(["/blog", "/work"]);
  });
  it.each([
    ["shared/blog", "shared/blog"],
    ["shared/blog", "shared/blog/nested"],
  ])("rejects overlapping build roots %s and %s", async (firstRoot, secondRoot) => {
    const config: SvartzConfig = {
      version: "1.0.0",
      vaults: [
        { id: "blog", path: "tests/fixtures/valid-vault", outDir: `${firstRoot}/dist`, target: { type: "host" }, mountPath: "/blog" },
        { id: "work", path: "tests/fixtures/valid-vault", outDir: `${secondRoot}/dist`, target: { type: "host" }, mountPath: "/work" },
      ],
    };
    await expect(resolveConfig(config, PKG_ROOT)).rejects.toThrow(VaultBuildRootConflict);
  });
  it("rejects build roots that meet through a symlink ancestor", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "svartz-build-roots-"));
    try {
      await mkdir(resolve(root, "real"));
      await symlink(resolve(root, "real"), resolve(root, "linked"), "dir");
      const config: SvartzConfig = {
        version: "1.0.0",
        vaults: [
          { id: "blog", path: VALID_VAULT, outDir: "linked/blog/dist", target: { type: "host" }, mountPath: "/blog" },
          { id: "work", path: VALID_VAULT, outDir: "real/blog/dist", target: { type: "host" }, mountPath: "/work" },
        ],
      };
      await expect(resolveConfig(config, root)).rejects.toThrow(VaultBuildRootConflict);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it("rejects build roots that meet through a dangling symlink ancestor", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "svartz-dangling-build-roots-"));
    try {
      await symlink(resolve(root, "real"), resolve(root, "linked"), "dir");
      const config: SvartzConfig = {
        version: "1.0.0",
        vaults: [
          { id: "blog", path: VALID_VAULT, outDir: "linked/blog/dist", target: { type: "host" }, mountPath: "/blog" },
          { id: "work", path: VALID_VAULT, outDir: "real/blog/dist", target: { type: "host" }, mountPath: "/work" },
        ],
      };
      await expect(resolveConfig(config, root)).rejects.toThrow(VaultBuildRootConflict);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it("reports build-root filesystem failures through the tagged error channel", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "svartz-invalid-build-root-"));
    try {
      await symlink("loop", resolve(root, "loop"), "dir");
      const config: SvartzConfig = {
        version: "1.0.0",
        vaults: [
          { id: "blog", path: VALID_VAULT, outDir: "loop/blog/dist", target: { type: "host" }, mountPath: "/blog" },
        ],
      };
      await expect(resolveConfig(config, root)).rejects.toMatchObject({
        _tag: "VaultBuildRootResolutionFailed", vaultId: "blog", path: resolve(root, "loop/blog"),
      } satisfies Partial<VaultBuildRootResolutionFailed>);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it("resolves vault path to absolute", async () => {
    const resolved = await resolveConfig(minimalConfig, PKG_ROOT);
    expect(resolved.vaults[0]!.path).toBe(VALID_VAULT);
  });

  it("resolves outDir to default .svartz/vaults/<id> when not set", async () => {
    const resolved = await resolveConfig(minimalConfig, PKG_ROOT);
    const vault = resolved.vaults[0]!;
    expect(vault.outDir).toBe(resolve(PKG_ROOT, ".svartz/vaults/main/dist"));
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

  it("normalizes a vault mount independently of the deployment base", async () => {
    const config: SvartzConfig = {
      version: "1.0.0",
      defaults: { mountPath: "/notes/" },
      vaults: [{
        id: "main",
        path: "tests/fixtures/valid-vault",
        mountPath: "blog/posts/",
        target: { type: "static", basePath: "/site" },
      }],
    };
    const resolved = await resolveConfig(config, PKG_ROOT);
    expect(resolved.vaults[0]!.mountPath).toBe("/blog/posts");
    expect(resolved.vaults[0]!.target.basePath).toBe("/site");
  });

  it("applies hardcoded defaults when no defaults or per-vault overrides", async () => {
    const resolved = await resolveConfig(minimalConfig, PKG_ROOT);
    const vault = resolved.vaults[0]!;
    expect(vault.include).toEqual([]);
    expect(vault.publicationMode).toBe("exclusion");
    expect(vault.exclude).toEqual([".trash/**", "**/.trash/**"]);
    expect(vault.linkResolution).toBe("closest");
    expect(vault.theme.base).toBe("@svartz/theme-minimal");
    expect(vault.theme).toEqual({ base: "@svartz/theme-minimal" });
    expect(vault.discovery.feed).toEqual({ enabled: false, limit: 10, content: "summary", sort: "published" });
    expect(vault.discovery.sitemap.enabled).toBe(false);
    expect(vault.discovery.socialImages.enabled).toBe(false);
    expect(vault.discovery.favicon.enabled).toBe(true);
    expect(vault.discovery.dateSources).toEqual(["frontmatter", "git", "filesystem"]);
  });

  it("uses the vault ID as the site title when it is omitted", async () => {
    const config: SvartzConfig = {
      ...minimalConfig,
      vaults: [{ ...minimalConfig.vaults[0]!, site: { url: "https://example.com" } }],
    };
    expect((await resolveConfig(config, PKG_ROOT)).vaults[0]!.site.title).toBe("main");
  });

  it("does not let an undefined vault title erase the inherited title", async () => {
    const config: SvartzConfig = {
      ...minimalConfig,
      defaults: { site: { title: "Shared" } },
      vaults: [{ ...minimalConfig.vaults[0]!, site: { title: undefined } }],
    };
    expect((await resolveConfig(config, PKG_ROOT)).vaults[0]!.site.title).toBe("Shared");
    expect((await resolveConfig({ ...config, defaults: {} }, PKG_ROOT)).vaults[0]!.site.title).toBe("main");
  });

  it("enables discovery when public URL exists and merges vault overrides", async () => {
    const config: SvartzConfig = {
      ...minimalConfig,
      defaults: {
        site: { title: "Notes", url: "https://example.com/site" },
        discovery: { feed: { limit: 20 }, dateSources: ["git", "filesystem"] },
      },
      vaults: [{ ...minimalConfig.vaults[0]!, discovery: { feed: { sort: "modified" }, sitemap: { enabled: false } } }],
    };
    const vault = (await resolveConfig(config, PKG_ROOT)).vaults[0]!;
    expect(vault.discovery.feed).toEqual({ enabled: true, limit: 20, content: "summary", sort: "modified" });
    expect(vault.discovery.sitemap.enabled).toBe(false);
    expect(vault.discovery.socialImages.enabled).toBe(true);
    expect(vault.discovery.dateSources).toEqual(["git", "filesystem"]);
  });

  it("preserves host favicon ownership until a vault opts in", async () => {
    const config: SvartzConfig = {
      ...minimalConfig,
      vaults: [{ ...minimalConfig.vaults[0]!, target: { type: "host" } }],
    };
    expect((await resolveConfig(config, PKG_ROOT)).vaults[0]!.discovery.favicon.enabled).toBe(false);
    config.vaults[0] = { ...config.vaults[0]!, discovery: { favicon: { enabled: true } } };
    expect((await resolveConfig(config, PKG_ROOT)).vaults[0]!.discovery.favicon.enabled).toBe(true);
  });

  it("resolves a configured favicon against the config directory", async () => {
    const config: SvartzConfig = {
      ...minimalConfig,
      vaults: [{ ...minimalConfig.vaults[0]!, site: { title: "Notes", favicon: "./icon.svg" } }],
    };
    expect((await resolveConfig(config, PKG_ROOT)).vaults[0]!.site.favicon).toBe(resolve(PKG_ROOT, "icon.svg"));
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
    expect(fm.publishedField).toBe("published_at");
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
    expect(vault.exclude).toEqual([".trash/**", "**/.trash/**", "archive/**"]);
    expect(vault.linkResolution).toBe("absolute");
  });

  it("always keeps the default .trash exclusion when vaults add their own excludes", async () => {
    const config: SvartzConfig = {
      version: "1.0.0",
      defaults: {
        exclude: ["archive/**"],
      },
      vaults: [
        {
          id: "v1",
          path: "tests/fixtures/valid-vault",
          exclude: ["templates/**"],
          target: { type: "static" as const },
        },
      ],
    };

    const resolved = await resolveConfig(config, PKG_ROOT);
    expect(resolved.vaults[0]!.exclude).toEqual([
      ".trash/**",
      "**/.trash/**",
      "archive/**",
      "templates/**",
    ]);
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

  it("resolves project-relative themes from the config directory", async () => {
    const config: SvartzConfig = {
      ...minimalConfig,
      defaults: { theme: "./themes/custom" },
    };
    const resolved = await resolveConfig(config, PKG_ROOT);
    expect(resolved.vaults[0]?.theme.base).toBe(resolve(PKG_ROOT, "themes/custom"));
  });

  it("resolves Windows-style relative theme paths from the config directory", async () => {
    const config: SvartzConfig = {
      ...minimalConfig,
      defaults: { theme: ".\\themes\\custom" },
    };
    const resolved = await resolveConfig(config, PKG_ROOT);
    expect(resolved.vaults[0]?.theme.base).toBe(resolve(PKG_ROOT, "themes/custom"));
  });

  it("preserves absolute theme paths", async () => {
    const themePath = resolve(PKG_ROOT, "themes/custom");
    const config: SvartzConfig = {
      ...minimalConfig,
      defaults: { theme: themePath },
    };
    const resolved = await resolveConfig(config, PKG_ROOT);
    expect(resolved.vaults[0]?.theme.base).toBe(themePath);
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
