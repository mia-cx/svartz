import { Schema } from "effect";

/**
 * Wrangler config schemas — mirror wrangler config-schema.json.
 * When wrangler updates their schema, update these to stay in sync.
 * @see https://developers.cloudflare.com/workers/wrangler/configuration
 */

/** Route = string | ZoneIdRoute | ZoneNameRoute | CustomDomainRoute */
const CustomDomainRouteSchema = Schema.Struct({
  custom_domain: Schema.Boolean,
  pattern: Schema.String,
});
const ZoneIdRouteSchema = Schema.Struct({
  custom_domain: Schema.optional(Schema.Boolean),
  pattern: Schema.String,
  zone_id: Schema.String,
});
const ZoneNameRouteSchema = Schema.Struct({
  custom_domain: Schema.optional(Schema.Boolean),
  pattern: Schema.String,
  zone_name: Schema.String,
});

const WranglerRouteSchema = Schema.Union(
  Schema.String,
  ZoneIdRouteSchema,
  ZoneNameRouteSchema,
  CustomDomainRouteSchema,
);

/** Assets config; main/assets can be auto-populated at build from vault outDir. */
const WranglerAssetsSchema = Schema.Struct({
  binding: Schema.optional(Schema.String),
  directory: Schema.optional(Schema.String),
  html_handling: Schema.optional(
    Schema.Literal(
      "auto-trailing-slash",
      "force-trailing-slash",
      "drop-trailing-slash",
      "none",
    ),
  ),
  not_found_handling: Schema.optional(
    Schema.Literal("single-page-application", "404-page", "none"),
  ),
  run_worker_first: Schema.optional(
    Schema.Union(Schema.Boolean, Schema.Array(Schema.String)),
  ),
});

/** Custom build (inheritable). */
const WranglerBuildSchema = Schema.Struct({
  command: Schema.optional(Schema.String),
  cwd: Schema.optional(Schema.String),
  watch_dir: Schema.optional(
    Schema.Union(Schema.String, Schema.Array(Schema.String)),
  ),
});

/** Limits (inheritable). */
const WranglerLimitsSchema = Schema.Struct({
  cpu_ms: Schema.optional(Schema.Number),
  subrequests: Schema.optional(Schema.Number),
});

const WranglerObservabilitySchema = Schema.Struct({
  enabled: Schema.optional(Schema.Boolean),
  head_sampling_rate: Schema.optional(Schema.Number),
});

/** Placement (inheritable). */
const WranglerPlacementSchema = Schema.Struct({
  hint: Schema.optional(Schema.String),
  host: Schema.optional(Schema.String),
  hostname: Schema.optional(Schema.String),
  mode: Schema.optional(Schema.String),
  region: Schema.optional(Schema.String),
});

/** Triggers / cron (inheritable). */
const WranglerTriggersSchema = Schema.Struct({
  crons: Schema.optional(Schema.Array(Schema.String)),
});

/**
 * Wrangler config fields shared by root and env.<name>.
 * Covers inheritable and non-inheritable keys from the config; no nested env.
 */
const WranglerConfigFieldsSchema = Schema.Struct({
  name: Schema.optional(Schema.String),
  main: Schema.optional(Schema.String),
  compatibility_date: Schema.optional(Schema.String),
  account_id: Schema.optional(Schema.String),
  compatibility_flags: Schema.optional(Schema.Array(Schema.String)),
  workers_dev: Schema.optional(Schema.Boolean),
  preview_urls: Schema.optional(Schema.Boolean),
  route: Schema.optional(WranglerRouteSchema),
  routes: Schema.optional(Schema.Array(WranglerRouteSchema)),
  tsconfig: Schema.optional(Schema.String),
  triggers: Schema.optional(WranglerTriggersSchema),
  rules: Schema.optional(Schema.Array(Schema.Unknown)),
  build: Schema.optional(WranglerBuildSchema),
  no_bundle: Schema.optional(Schema.Boolean),
  find_additional_modules: Schema.optional(Schema.Boolean),
  base_dir: Schema.optional(Schema.String),
  preserve_file_names: Schema.optional(Schema.Boolean),
  minify: Schema.optional(Schema.Boolean),
  keep_names: Schema.optional(Schema.Boolean),
  logpush: Schema.optional(Schema.Boolean),
  limits: Schema.optional(WranglerLimitsSchema),
  observability: Schema.optional(WranglerObservabilitySchema),
  assets: Schema.optional(WranglerAssetsSchema),
  placement: Schema.optional(WranglerPlacementSchema),
  define: Schema.optional(
    Schema.Record({ key: Schema.String, value: Schema.String }),
  ),
  vars: Schema.optional(
    Schema.Record({ key: Schema.String, value: Schema.Unknown }),
  ),
  durable_objects: Schema.optional(Schema.Unknown),
  kv_namespaces: Schema.optional(Schema.Array(Schema.Unknown)),
  r2_buckets: Schema.optional(Schema.Array(Schema.Unknown)),
  vectorize: Schema.optional(Schema.Array(Schema.Unknown)),
  services: Schema.optional(Schema.Array(Schema.Unknown)),
  queues: Schema.optional(Schema.Unknown),
  workflows: Schema.optional(Schema.Array(Schema.Unknown)),
  tail_consumers: Schema.optional(Schema.Array(Schema.Unknown)),
});

const WranglerEnvRecordSchema = Schema.Record({
  key: Schema.String,
  value: WranglerConfigFieldsSchema,
});

/**
 * Full top-level wrangler config. Users can set env (e.g. dev, prod) per vault;
 * each env key holds a partial config (inheritable keys only) merged with the top-level by wrangler.
 * @see https://developers.cloudflare.com/workers/wrangler/configuration/#top-level-only-keys
 */
const WranglerConfigSchema = WranglerConfigFieldsSchema.pipe(
  Schema.extend(
    Schema.Struct({
      keep_vars: Schema.optional(Schema.Boolean),
      migrations: Schema.optional(Schema.Array(Schema.Unknown)),
      send_metrics: Schema.optional(Schema.Boolean),
      env: Schema.optional(WranglerEnvRecordSchema),
    }),
  ),
);

export {
  CustomDomainRouteSchema,
  ZoneIdRouteSchema,
  ZoneNameRouteSchema,
  WranglerRouteSchema,
  WranglerAssetsSchema,
  WranglerBuildSchema,
  WranglerLimitsSchema,
  WranglerObservabilitySchema,
  WranglerPlacementSchema,
  WranglerTriggersSchema,
  WranglerConfigFieldsSchema,
  WranglerEnvRecordSchema,
  WranglerConfigSchema,
};
