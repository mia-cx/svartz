import { Effect } from "effect";
import { mergePlugins } from "@svartz/core";
import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import type {
  FrontmatterFields,
  DiscoveryConfig,
  LinkResolutionStrategy,
  ResolvedBuildConfig,
  ResolvedConfig,
  ResolvedDiscoveryConfig,
  ResolvedConfigSet,
  ResolvedFrontmatterConfig,
  ResolvedSiteConfig,
  ResolvedThemeConfig,
  SiteConfig,
  SvartzConfig,
  SvartzDefaults,
  VaultConfig,
  VaultThemeConfig,
} from "./types/index";
import { VaultIdConflict, VaultIdNotFound, VaultMountConflict, VaultPathInvalid } from "./types/index";

// --- Hardcoded defaults ---

const DEFAULT_INCLUDE: string[] = [];
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
  publishedField: "published_at",
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
  configDir: string,
): ResolvedThemeConfig => {
  const theme = {
    ...normalizeTheme(defaultTheme),
    ...(vaultTheme ? normalizeTheme(vaultTheme) : {}),
  };
  return {
    ...theme,
    base: theme.base.startsWith("./") || theme.base.startsWith("../")
      ? resolve(configDir, theme.base)
      : theme.base,
  };
};

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

const mergeSite = (
  defaultSite: SiteConfig | undefined,
  vaultSite: SiteConfig | undefined,
  vaultId: string,
  configDir: string,
): ResolvedSiteConfig => {
  const merged = { title: vaultId, ...defaultSite, ...vaultSite };
  return {
    ...merged,
    ...(merged.url !== undefined && { url: merged.url.replace(/\/+$/, "") }),
    ...(merged.favicon !== undefined && { favicon: resolve(configDir, merged.favicon) }),
  };
};

const mergeDiscovery = (
  defaults: DiscoveryConfig | undefined,
  vault: DiscoveryConfig | undefined,
  publicUrl: string | undefined,
  isHost: boolean,
): ResolvedDiscoveryConfig => ({
  feed: {
    enabled: vault?.feed?.enabled ?? defaults?.feed?.enabled ?? Boolean(publicUrl),
    limit: vault?.feed?.limit ?? defaults?.feed?.limit ?? 10,
    content: vault?.feed?.content ?? defaults?.feed?.content ?? "summary",
    sort: vault?.feed?.sort ?? defaults?.feed?.sort ?? "published",
  },
  sitemap: {
    enabled: vault?.sitemap?.enabled ?? defaults?.sitemap?.enabled ?? Boolean(publicUrl),
  },
  socialImages: {
    enabled: vault?.socialImages?.enabled ?? defaults?.socialImages?.enabled ?? Boolean(publicUrl),
  },
  favicon: {
    enabled: vault?.favicon?.enabled ?? defaults?.favicon?.enabled ?? !isHost,
  },
  dateSources: vault?.dateSources ?? defaults?.dateSources ?? ["frontmatter", "git", "filesystem"],
});

// --- Build defaults ---

const resolveBuildDefaults = (
  build: { concurrency?: number; maxRetries?: number } | undefined,
): ResolvedBuildConfig =>
  ({ ...DEFAULT_BUILD, ...build }) as ResolvedBuildConfig;

const mergeExclude = (
  defaultExclude: readonly string[] | undefined,
  vaultExclude: readonly string[] | undefined,
): string[] => [...new Set([...DEFAULT_EXCLUDE, ...(defaultExclude ?? []), ...(vaultExclude ?? [])])];

const normalizeMountPath = (value: string | undefined): string => {
  if (!value || value === "/") return "";
  const segments = value.split("/").filter(Boolean);
  if (segments.some((segment) => segment === "." || segment === ".." || segment.startsWith("["))) {
    throw new Error(`Invalid vault mountPath "${value}"`);
  }
  return `/${segments.join("/")}`;
};

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

    const site = mergeSite(defaults?.site, vault.site, vault.id, configDir);
    return {
      version: metadata.version,
      ...(metadata.$schema !== undefined && { $schema: metadata.$schema }),
      id: vault.id,
      path: absolutePath,
      outDir: outDirAbsolute,
      include: vault.include ?? defaults?.include ?? DEFAULT_INCLUDE,
      exclude: mergeExclude(defaults?.exclude, vault.exclude),
      publicationMode: vault.publicationMode ?? defaults?.publicationMode ?? "exclusion",
      linkResolution:
        vault.linkResolution ??
        defaults?.linkResolution ??
        DEFAULT_LINK_RESOLUTION,
      theme: mergeThemes(defaults?.theme, vault.theme, configDir),
      frontmatter: mergeFrontmatter(defaults?.frontmatter, vault.frontmatter),
      site,
      analytics: vault.analytics ?? defaults?.analytics,
      discovery: mergeDiscovery(defaults?.discovery, vault.discovery, site.url, vault.target.type === "host"),
      mountPath: normalizeMountPath(vault.mountPath ?? defaults?.mountPath),
      target: vault.target,
      plugins,
    };
  });

// --- Main resolver ---

export const resolveConfig = (
  config: SvartzConfig,
  configDir: string,
): Effect.Effect<ResolvedConfigSet, VaultPathInvalid | VaultMountConflict | VaultIdConflict> =>
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

    const seenIds = new Set<string>();
    for (const vault of vaults) {
      if (seenIds.has(vault.id)) {
        return yield* new VaultIdConflict({
          vaultId: vault.id,
          message: `Vault id "${vault.id}" appears more than once. Give each vault a unique id.`,
        });
      }
      seenIds.add(vault.id);
    }

    const hostVaults = vaults.filter((vault) => vault.target.type === "host");
    for (let first = 0; first < hostVaults.length; first++) {
      for (const second of hostVaults.slice(first + 1)) {
        const current = hostVaults[first]!;
        if (current.mountPath !== "" && second.mountPath !== "" &&
          current.mountPath !== second.mountPath &&
          !current.mountPath.startsWith(`${second.mountPath}/`) &&
          !second.mountPath.startsWith(`${current.mountPath}/`)) continue;
        return yield* new VaultMountConflict({
          firstVaultId: current.id,
          secondVaultId: second.id,
          mountPath: second.mountPath,
          message: `Vault mounts overlap: "${current.id}" (${current.mountPath || "/"}) and "${second.id}" (${second.mountPath || "/"}). Give each host vault a distinct, non-overlapping mountPath.`,
        });
      }
    }

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
