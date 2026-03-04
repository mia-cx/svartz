import { Effect, Schema } from "effect";
import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { SvartzConfigSchema } from "./schema.js";
import type { SvartzConfig } from "./types.js";
import {
  ConfigNotFound,
  ConfigImportFailed,
  ConfigDecodeFailed,
} from "./types.js";
import { searchUpward, fileExists } from "./utils/path-resolver.js";

const require = createRequire(import.meta.url);
const { version: PKG_VERSION } = require("../package.json") as {
  version: string;
};

const parseMajor = (version: string): number =>
  Number.parseInt(version.split(".")[0]!, 10);

const SUPPORTED_MAJOR_VERSION = parseMajor(PKG_VERSION);

/**
 * Decode a raw JS object against the config schema, then check that the
 * major version matches the version this package supports.
 */
export const decodeConfigEffect = (
  raw: unknown,
): Effect.Effect<SvartzConfig, ConfigDecodeFailed> =>
  Effect.gen(function* () {
    const config = yield* Schema.decodeUnknown(SvartzConfigSchema)(raw).pipe(
      Effect.mapError(
        (parseError) =>
          new ConfigDecodeFailed({
            issues: parseError.issue ? [parseError.issue] : [],
            message: `Config validation failed: ${parseError.message}`,
          }),
      ),
    );

    const major = parseMajor(config.version);
    if (major !== SUPPORTED_MAJOR_VERSION) {
      return yield* new ConfigDecodeFailed({
        issues: [],
        message: `Incompatible config version: major ${major} (expected ${SUPPORTED_MAJOR_VERSION}). Config version "${config.version}" is not compatible with this version of @svartz/config.`,
      });
    }

    return config;
  });

/**
 * Resolve the config file path from an explicit path or by searching upward.
 * Respects SVARTZ_CONFIG env var.
 */
const resolveConfigPath = (
  configPath?: string,
): Effect.Effect<string, ConfigNotFound> =>
  Effect.gen(function* () {
    const envOverride = process.env["SVARTZ_CONFIG"];
    const explicit = configPath ?? envOverride;

    if (explicit) {
      const resolved = resolve(explicit);
      const exists = yield* Effect.promise(() => fileExists(resolved));
      if (!exists) {
        return yield* new ConfigNotFound({
          searchPath: resolved,
          message: `Config file not found: ${resolved}`,
        });
      }
      return resolved;
    }

    const found = yield* Effect.promise(() => searchUpward(process.cwd()));
    if (!found) {
      return yield* new ConfigNotFound({
        searchPath: process.cwd(),
        message: `No svartz.config.{ts,js,mjs} found searching upward from ${process.cwd()}`,
      });
    }
    return found;
  });

/**
 * Dynamically import a config file and extract its default export.
 */
const importConfig = (
  configPath: string,
): Effect.Effect<unknown, ConfigImportFailed> =>
  Effect.tryPromise({
    try: async () => {
      const fileUrl = pathToFileURL(configPath).href;
      const mod = (await import(fileUrl)) as Record<string, unknown>;
      return mod["default"] ?? mod;
    },
    catch: (cause) =>
      new ConfigImportFailed({
        path: configPath,
        message: `Failed to import config at ${configPath}: ${(cause as Error).message}`,
      }),
  });

/**
 * Load, import, and decode a svartz config file.
 * Returns the decoded SvartzConfig and the directory containing the config file.
 */
export const loadConfigEffect = (
  configPath?: string,
): Effect.Effect<
  { config: SvartzConfig; configDir: string },
  ConfigNotFound | ConfigImportFailed | ConfigDecodeFailed
> =>
  Effect.gen(function* () {
    const resolvedPath = yield* resolveConfigPath(configPath);
    const raw = yield* importConfig(resolvedPath);
    const config = yield* decodeConfigEffect(raw);
    return { config, configDir: dirname(resolvedPath) };
  });
