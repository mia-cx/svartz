import { Schema, Either } from "effect";
import { STAGE_NAMES } from "./types";
import type { SvartzPlugin } from "./types";
import { PluginValidationError } from "./errors";

/**
 * Effect Schema definitions for SvartzPlugin shape validation.
 * Canonical source of truth for the plugin contract structure.
 * Author-facing types remain plain TS — these schemas are internal.
 */

const FnSchema = Schema.declare(
  (input: unknown): input is (...args: unknown[]) => unknown =>
    typeof input === "function",
).annotations({ identifier: "Function" });

const HookOptionsSchema = Schema.Struct({
  fatal: Schema.optional(Schema.Boolean),
  enforce: Schema.optional(Schema.Literal("pre", "post")),
  parallel: Schema.optional(Schema.Boolean),
});

const HookObjectSchema = Schema.Struct({
  run: FnSchema,
  options: Schema.optional(HookOptionsSchema),
});

const HookInputSchema = Schema.Union(FnSchema, HookObjectSchema);

const PluginSchema = Schema.Struct({
  id: Schema.String.pipe(Schema.minLength(1)),
  contractVersion: Schema.optional(Schema.String),
  disabled: Schema.optional(Schema.Boolean),
  buildStart: Schema.optional(HookInputSchema),
  configResolved: Schema.optional(HookInputSchema),
  buildEnd: Schema.optional(HookInputSchema),
  handleChange: Schema.optional(HookInputSchema),
  discoverFiles: Schema.optional(HookInputSchema),
  parseFrontmatter: Schema.optional(HookInputSchema),
  filterUnpublished: Schema.optional(HookInputSchema),
  resolveLinks: Schema.optional(HookInputSchema),
  transformOfm: Schema.optional(HookInputSchema),
  transformGfm: Schema.optional(HookInputSchema),
  transformToc: Schema.optional(HookInputSchema),
  transformDescription: Schema.optional(HookInputSchema),
  transformSyntax: Schema.optional(HookInputSchema),
  transformLatex: Schema.optional(HookInputSchema),
  indexContent: Schema.optional(HookInputSchema),
  emitArtifacts: Schema.optional(HookInputSchema),
});

const KNOWN_KEYS = new Set<string>([
  "id",
  "contractVersion",
  "disabled",
  ...STAGE_NAMES,
  "handleChange",
]);

/**
 * Validate a plugin against the Effect Schema.
 * On failure, inspects the raw input to throw PluginValidationError
 * with message parity to the legacy manual validation path.
 */
function validatePluginShape(
  input: unknown,
): asserts input is SvartzPlugin {
  const result = Either.getOrUndefined(
    Schema.decodeUnknownEither(PluginSchema)(input),
  );

  if (result !== undefined) return;

  const raw = input as Record<string, unknown> | null;

  if (!raw || !raw.id || typeof raw.id !== "string") {
    throw new PluginValidationError({
      pluginId: String(
        (raw as Record<string, unknown> | null)?.id ?? "<missing>",
      ),
      message: "Plugin id must be a non-empty string",
    });
  }

  const pluginId = raw.id as string;
  const allHookKeys = [...STAGE_NAMES, "handleChange"] as const;

  for (const key of allHookKeys) {
    const hook = raw[key];
    if (hook == null) continue;

    if (
      typeof hook !== "function" &&
      !(
        typeof hook === "object" &&
        typeof (hook as Record<string, unknown>).run === "function"
      )
    ) {
      throw new PluginValidationError({
        pluginId,
        message: `Hook "${key}" must be a function or { run, options? }`,
      });
    }

    if (typeof hook === "object" && hook !== null) {
      const opts = (hook as Record<string, unknown>).options as
        | Record<string, unknown>
        | undefined;
      if (opts) {
        if (
          opts.enforce !== undefined &&
          opts.enforce !== "pre" &&
          opts.enforce !== "post"
        ) {
          throw new PluginValidationError({
            pluginId,
            message: `Hook "${key}" has invalid enforce value "${String(opts.enforce)}"; expected "pre", "post", or undefined`,
          });
        }
        if (
          opts.parallel !== undefined &&
          typeof opts.parallel !== "boolean"
        ) {
          throw new PluginValidationError({
            pluginId,
            message: `Hook "${key}" has invalid parallel value; expected boolean`,
          });
        }
      }
    }
  }

  throw new PluginValidationError({
    pluginId,
    message: "Plugin validation failed",
  });
}

/**
 * Scan a plugin for unknown keys and emit console.warn for each.
 */
function warnUnknownPluginKeys(
  plugin: Record<string, unknown>,
  pluginId: string,
): void {
  for (const key of Object.keys(plugin)) {
    if (!KNOWN_KEYS.has(key)) {
      console.warn(
        `[svartz:plugin] plugin "${pluginId}" has unknown key "${key}"`,
      );
    }
  }
}

export {
  PluginSchema,
  HookInputSchema,
  HookOptionsSchema,
  HookObjectSchema,
  FnSchema,
  validatePluginShape,
  warnUnknownPluginKeys,
  KNOWN_KEYS as KNOWN_PLUGIN_KEYS,
};
