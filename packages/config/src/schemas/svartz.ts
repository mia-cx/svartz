import { Schema } from "effect";
import { WranglerConfigSchema } from "./wrangler";
import { TailwindThemeConfigSchema } from "./tailwind";

const LinkResolutionStrategySchema = Schema.Literal(
  "closest",
  "shallowest",
  "absolute",
);

const MountPathSchema = Schema.String.pipe(Schema.filter(
  (value) => /^\/?(?:[A-Za-z0-9._~-]+\/?)*$/.test(value) &&
    value.split("/").every((segment) => segment !== "." && segment !== ".."),
  { message: () => "mountPath must contain only static URL segments" },
));

const HttpUrlSchema = Schema.String.pipe(
  Schema.filter((value) => {
    try {
      const url = new URL(value);
      return (url.protocol === "http:" || url.protocol === "https:") &&
        !url.username && !url.password && !url.search && !url.hash;
    } catch {
      return false;
    }
  }, { message: () => "URL must be an absolute HTTP(S) URL" }),
);
const NonEmptyStringSchema = Schema.String.pipe(Schema.minLength(1));
const DomainSchema = Schema.String.pipe(Schema.pattern(/^(?:[A-Za-z0-9-]+\.)*[A-Za-z0-9-]+$/));

const GiscusConfigSchema = Schema.Struct({
  repo: NonEmptyStringSchema,
  repoId: NonEmptyStringSchema,
  category: NonEmptyStringSchema,
  categoryId: NonEmptyStringSchema,
  enabled: Schema.optional(Schema.Boolean),
  mapping: Schema.optional(Schema.Literal("url", "title", "og:title", "specific", "number", "pathname")),
  term: Schema.optional(NonEmptyStringSchema),
  strict: Schema.optional(Schema.Boolean),
  reactionsEnabled: Schema.optional(Schema.Boolean),
  inputPosition: Schema.optional(Schema.Literal("top", "bottom")),
  lang: Schema.optional(Schema.String),
  lightTheme: Schema.optional(Schema.String),
  darkTheme: Schema.optional(Schema.String),
}).pipe(Schema.filter(
  (value) => !["specific", "number"].includes(value.mapping ?? "pathname") || Boolean(value.term),
  { message: () => "Giscus mapping specific or number requires term" },
));

const AnalyticsConfigSchema = Schema.Union(
  Schema.Struct({ provider: Schema.Literal("plausible"), host: Schema.optional(HttpUrlSchema), scriptSrc: Schema.optional(HttpUrlSchema) }),
  Schema.Struct({ provider: Schema.Literal("google"), tagId: NonEmptyStringSchema }),
  Schema.Struct({ provider: Schema.Literal("umami"), websiteId: NonEmptyStringSchema, host: Schema.optional(HttpUrlSchema) }),
  Schema.Struct({ provider: Schema.Literal("goatcounter"), websiteId: DomainSchema, host: Schema.optional(DomainSchema), scriptSrc: Schema.optional(HttpUrlSchema) }),
  Schema.Struct({ provider: Schema.Literal("posthog"), apiKey: NonEmptyStringSchema, host: Schema.optional(HttpUrlSchema) }),
  Schema.Struct({ provider: Schema.Literal("tinylytics"), siteId: NonEmptyStringSchema }),
  Schema.Struct({ provider: Schema.Literal("cabin"), host: Schema.optional(HttpUrlSchema) }),
  Schema.Struct({ provider: Schema.Literal("clarity"), projectId: NonEmptyStringSchema }),
  Schema.Struct({ provider: Schema.Literal("matomo"), host: HttpUrlSchema, siteId: NonEmptyStringSchema }),
  Schema.Struct({ provider: Schema.Literal("vercel") }),
  Schema.Struct({ provider: Schema.Literal("rybbit"), siteId: NonEmptyStringSchema, host: Schema.optional(HttpUrlSchema) }),
);

const VaultThemeConfigSchema = Schema.Union(
  Schema.String,
  Schema.Struct({
    base: Schema.String,
    comments: Schema.optional(GiscusConfigSchema),
    recentNotes: Schema.optional(Schema.Struct({
      enabled: Schema.optional(Schema.Boolean),
      limit: Schema.optional(Schema.Number.pipe(Schema.int(), Schema.positive())),
      showTags: Schema.optional(Schema.Boolean),
      linkToMore: Schema.optional(Schema.String),
    })),
  }).pipe(Schema.extend(TailwindThemeConfigSchema)),
);

const FrontmatterFieldsSchema = Schema.Struct({
  titleField: Schema.optional(Schema.String),
  descriptionField: Schema.optional(Schema.String),
  tagsField: Schema.optional(Schema.String),
  aliasesField: Schema.optional(Schema.String),
  createdAtField: Schema.optional(Schema.String),
  updatedAtField: Schema.optional(Schema.String),
  publishedField: Schema.optional(Schema.String),
  dateFormat: Schema.optional(Schema.String),
});

const SiteConfigSchema = Schema.Struct({
  title: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
  url: Schema.optional(HttpUrlSchema),
  author: Schema.optional(Schema.String),
  image: Schema.optional(Schema.String),
  favicon: Schema.optional(Schema.String.pipe(Schema.filter(
    (value) => !/^[a-z]+:\/\//i.test(value),
    { message: () => "site.favicon must be a local file path" },
  ))),
});

const DiscoveryConfigSchema = Schema.Struct({
  feed: Schema.optional(Schema.Struct({
    enabled: Schema.optional(Schema.Boolean),
    limit: Schema.optional(Schema.Number.pipe(Schema.int(), Schema.positive())),
    content: Schema.optional(Schema.Literal("summary", "full")),
    sort: Schema.optional(Schema.Literal("published", "modified")),
  })),
  sitemap: Schema.optional(Schema.Struct({
    enabled: Schema.optional(Schema.Boolean),
  })),
  socialImages: Schema.optional(Schema.Struct({
    enabled: Schema.optional(Schema.Boolean),
  })),
  favicon: Schema.optional(Schema.Struct({
    enabled: Schema.optional(Schema.Boolean),
  })),
  dateSources: Schema.optional(Schema.Array(Schema.Literal("frontmatter", "git", "filesystem")).pipe(
    Schema.filter((sources) => sources.length > 0, { message: () => "dateSources needs at least one source" }),
  )),
});

/** Shallow plugin placeholder; plugin interface/standard TBD. */
const PluginEntrySchema = Schema.Unknown;

/** Shared vault options; defaults and VaultConfig both use this shape. */
const VaultOptionsSchema = Schema.Struct({
  mountPath: Schema.optional(MountPathSchema),
  publicationMode: Schema.optional(Schema.Literal("exclusion", "inclusion")),
  include: Schema.optional(Schema.Array(Schema.String)),
  exclude: Schema.optional(Schema.Array(Schema.String)),
  linkResolution: Schema.optional(LinkResolutionStrategySchema),
  theme: Schema.optional(VaultThemeConfigSchema),
  frontmatter: Schema.optional(FrontmatterFieldsSchema),
  site: Schema.optional(SiteConfigSchema),
  analytics: Schema.optional(AnalyticsConfigSchema),
  discovery: Schema.optional(DiscoveryConfigSchema),
  /** Output directory for this vault's build artifact. Default: `.svartz/vaults/<vault.id>`. */
  outDir: Schema.optional(Schema.String),
  /** Plugin instances (transformers, filters, emitters). Vault- and theme-specific. Shape TBD when plugin API is defined. */
  plugins: Schema.optional(Schema.Array(PluginEntrySchema)),
});

const TargetConfigSchema = Schema.Union(
  Schema.Struct({
    type: Schema.Literal("host"),
  }),
  Schema.Struct({
    type: Schema.Literal("cloudflare-workers"),
  }).pipe(Schema.extend(WranglerConfigSchema)),
  Schema.Struct({
    type: Schema.Literal("cloudflare-pages"),
    projectName: Schema.optional(Schema.String),
  }),
  Schema.Struct({
    type: Schema.Literal("static"),
    basePath: Schema.optional(Schema.String),
  }),
  Schema.Struct({
    type: Schema.Literal("node"),
    basePath: Schema.optional(Schema.String),
  }),
);

const BuildOptionsSchema = Schema.Struct({
  concurrency: Schema.optional(Schema.Number),
  maxRetries: Schema.optional(Schema.Number),
});

/** Defaults are vault options at top level (no nested .vault). */
const SvartzDefaultsSchema = VaultOptionsSchema;

/** Vault config: required id, path, target + optional vault options (same shape as defaults; merged with defaults). */
const VaultConfigSchema = Schema.Struct({
  id: Schema.String,
  path: Schema.String,
  target: TargetConfigSchema,
  mountPath: Schema.optional(MountPathSchema),
  publicationMode: Schema.optional(Schema.Literal("exclusion", "inclusion")),
  include: Schema.optional(Schema.Array(Schema.String)),
  exclude: Schema.optional(Schema.Array(Schema.String)),
  linkResolution: Schema.optional(LinkResolutionStrategySchema),
  theme: Schema.optional(VaultThemeConfigSchema),
  frontmatter: Schema.optional(FrontmatterFieldsSchema),
  site: Schema.optional(SiteConfigSchema),
  analytics: Schema.optional(AnalyticsConfigSchema),
  discovery: Schema.optional(DiscoveryConfigSchema),
  outDir: Schema.optional(Schema.String),
  plugins: Schema.optional(Schema.Array(PluginEntrySchema)),
});

const SemverSchema = Schema.String.pipe(
  Schema.pattern(/^\d+\.\d+\.\d+(-[\w.]+)?(\+[\w.]+)?$/),
);

const PasswordGroupsSchema = Schema.Record({
  key: Schema.String.pipe(Schema.pattern(/^[A-Za-z0-9_-]+$/)),
  value: Schema.Struct({
    env: Schema.String.pipe(Schema.pattern(/^(?!(?:PUBLIC_|VITE_))[A-Za-z_][A-Za-z0-9_]*$/)),
  }),
});

const SvartzConfigSchema = Schema.Struct({
  $schema: Schema.optional(Schema.String),
  version: SemverSchema,
  defaults: Schema.optional(SvartzDefaultsSchema),
  build: Schema.optional(BuildOptionsSchema),
  passwordGroups: Schema.optional(PasswordGroupsSchema),
  vaults: Schema.Array(VaultConfigSchema),
});

export {
  LinkResolutionStrategySchema,
  VaultThemeConfigSchema,
  FrontmatterFieldsSchema,
  SiteConfigSchema,
  GiscusConfigSchema,
  AnalyticsConfigSchema,
  DiscoveryConfigSchema,
  PluginEntrySchema,
  VaultOptionsSchema,
  TargetConfigSchema,
  BuildOptionsSchema,
  SvartzDefaultsSchema,
  VaultConfigSchema,
  SemverSchema,
  PasswordGroupsSchema,
  SvartzConfigSchema,
};
