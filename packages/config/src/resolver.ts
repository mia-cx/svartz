import { Effect } from "effect";
import { mergePlugins } from "@svartz/core";
import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import type {
  FrontmatterFields,
  LinkResolutionStrategy,
  ResolvedBuildConfig,
  ResolvedConfig,
  ResolvedConfigSet,
  ResolvedFrontmatterConfig,
  ResolvedThemeConfig,
  SvartzConfig,
  SvartzDefaults,
  VaultConfig,
  VaultThemeConfig,
} from "./types/index";
import { VaultIdNotFound, VaultPathInvalid } from "./types/index";

// --- Hardcoded defaults ---

/**
 * Default vault include patterns: markdown plus file types that can be embedded in Obsidian
 * (and are handled by reference/quartz ofm). See Obsidian "Embed files" docs and
 * packages/reference/quartz/plugins/transformers/ofm.ts.
 */
const DEFAULT_INCLUDE = [
  "**/*.{md,mdx,svx}",
  "**/*.{jpg,jpeg,png,gif,webp,avif,bmp,svg}",
  "**/*.{mp3,m4a,wav,ogg,flac,webm,3gp}",
  "**/*.{mp4,mov,mkv,ogv}",
  "**/*.pdf",
];
const DEFAULT_EXCLUDE = [".trash/**", "**/.trash/**"];
const DEFAULT_LINK_RESOLUTION: LinkResolutionStrategy = "closest";
const DEFAULT_THEME_BASE = "@svartz/theme-minimal";
const DEFAULT_BUILD: ResolvedBuildConfig = {
  concurrency: 10,
  maxRetries: 3,
};

const DEFAULT_FRONTMATTER: ResolvedFrontmatterConfig = {
  titleField: "title",
  descriptionField: "description",
  tagsField: "tags",
  aliasesField: "aliases",
  createdAtField: "created_at",
  updatedAtField: "updated_at",
  publishedField: "published",
};

// --- Theme normalization ---

const normalizeTheme = (
  raw: VaultThemeConfig | undefined,
): ResolvedThemeConfig => {
  if (raw === undefined) return { base: DEFAULT_THEME_BASE };
  if (typeof raw === "string") return { base: raw };
  return raw;
};

const mergeThemes = (
  defaultTheme: VaultThemeConfig | undefined,
  vaultTheme: VaultThemeConfig | undefined,
): ResolvedThemeConfig =>
  ({
    ...normalizeTheme(defaultTheme),
    ...(vaultTheme ? normalizeTheme(vaultTheme) : {}),
  }) as ResolvedThemeConfig;

// --- Frontmatter merge ---

const mergeFrontmatter = (
  defaultFm: FrontmatterFields | undefined,
  vaultFm: FrontmatterFields | undefined,
): ResolvedFrontmatterConfig =>
  ({
    ...DEFAULT_FRONTMATTER,
    ...defaultFm,
    ...vaultFm,
  }) as ResolvedFrontmatterConfig;

// --- Build defaults ---

const resolveBuildDefaults = (
  build: { concurrency?: number; maxRetries?: number } | undefined,
): ResolvedBuildConfig =>
  ({ ...DEFAULT_BUILD, ...build }) as ResolvedBuildConfig;

const mergeExclude = (
  defaultExclude: readonly string[] | undefined,
  vaultExclude: readonly string[] | undefined,
): string[] => [...new Set([...DEFAULT_EXCLUDE, ...(defaultExclude ?? []), ...(vaultExclude ?? [])])];

// --- Single vault resolution ---

const resolveVaultConfig = (
  vault: VaultConfig,
  defaults: SvartzDefaults | undefined,
  configDir: string,
  metadata: Pick<ResolvedConfig, "version" | "$schema">,
): Effect.Effect<ResolvedConfig, VaultPathInvalid> =>
  Effect.gen(function* () {
    const absolutePath = resolve(configDir, vault.path);

    const exists = yield* Effect.promise(() =>
      stat(absolutePath).then(
        (s) => s.isDirectory(),
        () => false,
      ),
    );
    if (!exists) {
      return yield* new VaultPathInvalid({
        vaultId: vault.id,
        path: absolutePath,
        message: `Vault path "${absolutePath}" does not exist or is not a directory (vault: "${vault.id}")`,
      });
    }

    const outDirRelative =
      vault.outDir ?? defaults?.outDir ?? `.svartz/vaults/${vault.id}/dist`;
    const outDirAbsolute = resolve(configDir, outDirRelative);

    const plugins = mergePlugins(
      (defaults?.plugins ?? []) as readonly {
        readonly id: string;
        readonly disabled?: boolean;
      }[],
      (vault.plugins ?? []) as readonly {
        readonly id: string;
        readonly disabled?: boolean;
      }[],
    ) as readonly unknown[];

    return {
      version: metadata.version,
      ...(metadata.$schema !== undefined && { $schema: metadata.$schema }),
      id: vault.id,
      path: absolutePath,
      outDir: outDirAbsolute,
      include: vault.include ?? defaults?.include ?? DEFAULT_INCLUDE,
      exclude: mergeExclude(defaults?.exclude, vault.exclude),
      linkResolution:
        vault.linkResolution ??
        defaults?.linkResolution ??
        DEFAULT_LINK_RESOLUTION,
      theme: mergeThemes(defaults?.theme, vault.theme),
      frontmatter: mergeFrontmatter(defaults?.frontmatter, vault.frontmatter),
      target: vault.target,
      plugins,
    };
  });

// --- Main resolver ---

export const resolveConfig = (
  config: SvartzConfig,
  configDir: string,
): Effect.Effect<ResolvedConfigSet, VaultPathInvalid> =>
  Effect.gen(function* () {
    const buildDefaults = resolveBuildDefaults(config.build);
    const vaults = yield* Effect.forEach(
      config.vaults,
      (vault) =>
        resolveVaultConfig(vault, config.defaults, configDir, {
          version: config.version,
          $schema: config.$schema,
        }),
      { concurrency: buildDefaults.concurrency },
    );

    return {
      version: config.version,
      ...(config.$schema !== undefined && { $schema: config.$schema }),
      configDir,
      build: buildDefaults,
      vaults,
    };
  });

// --- getVault ---

export const getVaultConfig = (
  config: ResolvedConfigSet,
  vaultId: string,
): Effect.Effect<ResolvedConfig, VaultIdNotFound> =>
  Effect.gen(function* () {
    const vault = config.vaults.find((candidate) => candidate.id === vaultId);
    if (!vault) {
      return yield* new VaultIdNotFound({
        vaultId,
        message: `Vault "${vaultId}" not found in config`,
      });
    }
    return vault;
  });

// --- listVaults (pure) ---

export const listVaults = (config: ResolvedConfigSet) =>
  config.vaults.map((vault) => ({
    id: vault.id,
    path: vault.path,
    themeBase: vault.theme.base,
    target: vault.target,
  }));
