import { Schema } from "effect";
import { WranglerConfigSchema } from "./wrangler";
import { TailwindThemeConfigSchema } from "./tailwind";

const LinkResolutionStrategySchema = Schema.Literal(
  "closest",
  "shallowest",
  "absolute",
);

const VaultThemeConfigSchema = Schema.Union(
  Schema.String,
  Schema.Struct({
    base: Schema.String,
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
  publicationMode: Schema.optional(Schema.Literal("opt-out", "explicit")),
  dateFormat: Schema.optional(Schema.String),
});

const HttpUrlSchema = Schema.String.pipe(
  Schema.filter((value) => {
    try {
      const url = new URL(value);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  }, { message: () => "site.url must be an absolute HTTP(S) URL" }),
);

const SiteConfigSchema = Schema.Struct({
  title: Schema.String,
  description: Schema.optional(Schema.String),
  url: Schema.optional(HttpUrlSchema),
  author: Schema.optional(Schema.String),
  image: Schema.optional(Schema.String),
});

/** Shallow plugin placeholder; plugin interface/standard TBD. */
const PluginEntrySchema = Schema.Unknown;

/** Shared vault options; defaults and VaultConfig both use this shape. */
const VaultOptionsSchema = Schema.Struct({
  include: Schema.optional(Schema.Array(Schema.String)),
  exclude: Schema.optional(Schema.Array(Schema.String)),
  linkResolution: Schema.optional(LinkResolutionStrategySchema),
  theme: Schema.optional(VaultThemeConfigSchema),
  frontmatter: Schema.optional(FrontmatterFieldsSchema),
  site: Schema.optional(SiteConfigSchema),
  /** Output directory for this vault's build artifact. Default: `.svartz/vaults/<vault.id>`. */
  outDir: Schema.optional(Schema.String),
  /** Plugin instances (transformers, filters, emitters). Vault- and theme-specific. Shape TBD when plugin API is defined. */
  plugins: Schema.optional(Schema.Array(PluginEntrySchema)),
});

const TargetConfigSchema = Schema.Union(
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
  // TODO: add netlify, vercel, bun, etc.
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
  include: Schema.optional(Schema.Array(Schema.String)),
  exclude: Schema.optional(Schema.Array(Schema.String)),
  linkResolution: Schema.optional(LinkResolutionStrategySchema),
  theme: Schema.optional(VaultThemeConfigSchema),
  frontmatter: Schema.optional(FrontmatterFieldsSchema),
  site: Schema.optional(SiteConfigSchema),
  outDir: Schema.optional(Schema.String),
  plugins: Schema.optional(Schema.Array(PluginEntrySchema)),
});

const SemverSchema = Schema.String.pipe(
  Schema.pattern(/^\d+\.\d+\.\d+(-[\w.]+)?(\+[\w.]+)?$/),
);

const SvartzConfigSchema = Schema.Struct({
  $schema: Schema.optional(Schema.String),
  version: SemverSchema,
  defaults: Schema.optional(SvartzDefaultsSchema),
  build: Schema.optional(BuildOptionsSchema),
  vaults: Schema.Array(VaultConfigSchema),
});

export {
  LinkResolutionStrategySchema,
  VaultThemeConfigSchema,
  FrontmatterFieldsSchema,
  SiteConfigSchema,
  PluginEntrySchema,
  VaultOptionsSchema,
  TargetConfigSchema,
  BuildOptionsSchema,
  SvartzDefaultsSchema,
  VaultConfigSchema,
  SemverSchema,
  SvartzConfigSchema,
};
