import { Schema } from "effect";

export const LinkResolutionStrategySchema = Schema.Literal(
  "closest",
  "shallowest",
  "absolute",
);

export const TailwindThemeConfigSchema = Schema.Record({
  key: Schema.String,
  value: Schema.Unknown,
});

export const VaultThemeConfigSchema = Schema.Union(
  Schema.String,
  Schema.Struct({
    base: Schema.String,
  }).pipe(Schema.extend(TailwindThemeConfigSchema)),
);

export const TargetConfigSchema = Schema.Union(
  Schema.Struct({
    type: Schema.Literal("worker"),
    name: Schema.String,
    routes: Schema.optional(Schema.Array(Schema.String)),
    outDir: Schema.optional(Schema.String),
  }),
  Schema.Struct({
    type: Schema.Literal("pages"),
    projectName: Schema.String,
    outDir: Schema.optional(Schema.String),
  }),
  Schema.Struct({
    type: Schema.Literal("static"),
    outDir: Schema.optional(Schema.String),
    basePath: Schema.optional(Schema.String),
  }),
  Schema.Struct({
    type: Schema.Literal("node"),
    outDir: Schema.optional(Schema.String),
  }),
);

export const FrontmatterFieldsSchema = Schema.Struct({
  titleField: Schema.optional(Schema.String),
  descriptionField: Schema.optional(Schema.String),
  tagsField: Schema.optional(Schema.String),
  aliasesField: Schema.optional(Schema.String),
  createdAtField: Schema.optional(Schema.String),
  updatedAtField: Schema.optional(Schema.String),
  publishedField: Schema.optional(Schema.String),
  dateFormat: Schema.optional(Schema.String),
});

export const SvartzDefaultsSchema = Schema.Struct({
  vault: Schema.optional(
    Schema.Struct({
      include: Schema.optional(Schema.Array(Schema.String)),
      exclude: Schema.optional(Schema.Array(Schema.String)),
      linkResolution: Schema.optional(LinkResolutionStrategySchema),
      theme: Schema.optional(VaultThemeConfigSchema),
      frontmatter: Schema.optional(FrontmatterFieldsSchema),
    }),
  ),
  build: Schema.optional(
    Schema.Struct({
      concurrency: Schema.optional(Schema.Number),
      maxRetries: Schema.optional(Schema.Number),
    }),
  ),
});

export const VaultConfigSchema = Schema.Struct({
  id: Schema.String,
  path: Schema.String,
  include: Schema.optional(Schema.Array(Schema.String)),
  exclude: Schema.optional(Schema.Array(Schema.String)),
  linkResolution: Schema.optional(LinkResolutionStrategySchema),
  theme: Schema.optional(VaultThemeConfigSchema),
  frontmatter: Schema.optional(FrontmatterFieldsSchema),
  rootPath: Schema.optional(Schema.String),
  target: TargetConfigSchema,
});

export const SemverSchema = Schema.String.pipe(
  Schema.pattern(/^\d+\.\d+\.\d+(-[\w.]+)?(\+[\w.]+)?$/),
);

export const SvartzConfigSchema = Schema.Struct({
  $schema: Schema.optional(Schema.String),
  version: SemverSchema,
  workspace: Schema.optional(
    Schema.Struct({
      rootDir: Schema.optional(Schema.String),
    }),
  ),
  defaults: Schema.optional(SvartzDefaultsSchema),
  vaults: Schema.Array(VaultConfigSchema),
});
