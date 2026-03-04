import { Effect } from "effect";
import { resolve } from "node:path";
import type {
  SvartzConfig,
  SvartzDefaults,
  VaultConfig,
  VaultThemeConfig,
  FrontmatterFields,
  ResolvedSvartzConfig,
  ResolvedVaultConfig,
  ResolvedFrontmatter,
  ResolvedTheme,
  ResolvedBuildDefaults,
  LinkResolutionStrategy,
  VaultSummary,
} from "./types.js";
import { VaultPathInvalid, VaultIdNotFound } from "./types.js";
import { isDirectory } from "./utils/path-resolver.js";

// --- Hardcoded defaults ---

const DEFAULT_INCLUDE = ["**/*.md", "**/*.{jpg,webp,png,avif}"];
const DEFAULT_EXCLUDE: string[] = [];
const DEFAULT_LINK_RESOLUTION: LinkResolutionStrategy = "closest";
const DEFAULT_THEME_BASE = "@svartz/theme-minimal";
const DEFAULT_ROOT_PATH = "/";
const DEFAULT_CONCURRENCY = 10;
const DEFAULT_MAX_RETRIES = 3;

const DEFAULT_FRONTMATTER: ResolvedFrontmatter = {
  titleField: "title",
  descriptionField: "description",
  tagsField: "tags",
  aliasesField: "aliases",
  createdAtField: "created_at",
  updatedAtField: "updated_at",
  publishedField: "published",
};

// --- Theme normalization ---

const normalizeTheme = (raw: VaultThemeConfig | undefined): ResolvedTheme => {
  if (raw === undefined)
    return { base: DEFAULT_THEME_BASE, config: {} };
  if (typeof raw === "string")
    return { base: raw, config: {} };
  const { base, ...rest } = raw;
  return { base, config: rest };
};

const mergeThemes = (
  defaultTheme: VaultThemeConfig | undefined,
  vaultTheme: VaultThemeConfig | undefined,
): ResolvedTheme => {
  const resolved = normalizeTheme(vaultTheme ?? defaultTheme);
  if (vaultTheme && defaultTheme) {
    const defaults = normalizeTheme(defaultTheme);
    const vault = normalizeTheme(vaultTheme);
    return {
      base: vault.base,
      config: { ...defaults.config, ...vault.config },
    };
  }
  return resolved;
};

// --- Frontmatter merge ---

const mergeFrontmatter = (
  defaultFm: FrontmatterFields | undefined,
  vaultFm: FrontmatterFields | undefined,
): ResolvedFrontmatter => ({
  titleField:
    vaultFm?.titleField ?? defaultFm?.titleField ?? DEFAULT_FRONTMATTER.titleField,
  descriptionField:
    vaultFm?.descriptionField ?? defaultFm?.descriptionField ?? DEFAULT_FRONTMATTER.descriptionField,
  tagsField:
    vaultFm?.tagsField ?? defaultFm?.tagsField ?? DEFAULT_FRONTMATTER.tagsField,
  aliasesField:
    vaultFm?.aliasesField ?? defaultFm?.aliasesField ?? DEFAULT_FRONTMATTER.aliasesField,
  createdAtField:
    vaultFm?.createdAtField ?? defaultFm?.createdAtField ?? DEFAULT_FRONTMATTER.createdAtField,
  updatedAtField:
    vaultFm?.updatedAtField ?? defaultFm?.updatedAtField ?? DEFAULT_FRONTMATTER.updatedAtField,
  publishedField:
    vaultFm?.publishedField ?? defaultFm?.publishedField ?? DEFAULT_FRONTMATTER.publishedField,
});

// --- Build defaults ---

const resolveBuildDefaults = (
  defaults: SvartzDefaults | undefined,
): ResolvedBuildDefaults => ({
  concurrency: defaults?.build?.concurrency ?? DEFAULT_CONCURRENCY,
  maxRetries: defaults?.build?.maxRetries ?? DEFAULT_MAX_RETRIES,
});

// --- Single vault resolution ---

const resolveVault = (
  vault: VaultConfig,
  defaults: SvartzDefaults | undefined,
  rootDir: string,
): Effect.Effect<ResolvedVaultConfig, VaultPathInvalid> =>
  Effect.gen(function* () {
    const absolutePath = resolve(rootDir, vault.path);

    const exists = yield* Effect.promise(() => isDirectory(absolutePath));
    if (!exists) {
      return yield* new VaultPathInvalid({
        vaultId: vault.id,
        path: absolutePath,
        message: `Vault path "${absolutePath}" does not exist or is not a directory (vault: "${vault.id}")`,
      });
    }

    const vaultDefaults = defaults?.vault;

    return {
      id: vault.id,
      path: absolutePath,
      include: vault.include ?? vaultDefaults?.include ?? DEFAULT_INCLUDE,
      exclude: vault.exclude ?? vaultDefaults?.exclude ?? DEFAULT_EXCLUDE,
      linkResolution:
        vault.linkResolution ??
        vaultDefaults?.linkResolution ??
        DEFAULT_LINK_RESOLUTION,
      theme: mergeThemes(vaultDefaults?.theme, vault.theme),
      frontmatter: mergeFrontmatter(
        vaultDefaults?.frontmatter,
        vault.frontmatter,
      ),
      rootPath: vault.rootPath ?? DEFAULT_ROOT_PATH,
      target: vault.target,
    };
  });

// --- Main resolver ---

export const resolveConfigPathsEffect = (
  config: SvartzConfig,
  configDir: string,
): Effect.Effect<ResolvedSvartzConfig, VaultPathInvalid> =>
  Effect.gen(function* () {
    const rootDir = config.workspace?.rootDir
      ? resolve(configDir, config.workspace.rootDir)
      : configDir;

    const vaults = yield* Effect.forEach(
      config.vaults,
      (vault) => resolveVault(vault, config.defaults, rootDir),
      { concurrency: 1 },
    );

    const vaultDefaults = config.defaults?.vault;

    return {
      workspace: { rootDir },
      defaults: {
        vault: {
          include: vaultDefaults?.include ?? DEFAULT_INCLUDE,
          exclude: vaultDefaults?.exclude ?? DEFAULT_EXCLUDE,
          linkResolution:
            vaultDefaults?.linkResolution ?? DEFAULT_LINK_RESOLUTION,
          theme: normalizeTheme(vaultDefaults?.theme),
          frontmatter: mergeFrontmatter(vaultDefaults?.frontmatter, undefined),
        },
        build: resolveBuildDefaults(config.defaults),
      },
      vaults,
    };
  });

// --- getVault ---

export const getVaultEffect = (
  config: ResolvedSvartzConfig,
  vaultId: string,
): Effect.Effect<ResolvedVaultConfig, VaultIdNotFound> =>
  Effect.gen(function* () {
    const vault = config.vaults.find((v) => v.id === vaultId);
    if (!vault) {
      return yield* new VaultIdNotFound({
        vaultId,
        message: `Vault "${vaultId}" not found in config`,
      });
    }
    return vault;
  });

// --- listVaults (pure) ---

export const listVaults = (config: ResolvedSvartzConfig): VaultSummary[] =>
  config.vaults.map((v) => ({
    id: v.id,
    path: v.path,
    themeBase: v.theme.base,
    target: v.target,
  }));
