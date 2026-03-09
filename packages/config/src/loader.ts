import { Effect, Schema } from "effect";
import { access, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { major as semverMajor } from "semver";
import { resolveConfig } from "./resolver";
import { SvartzConfigSchema } from "./schemas";
import type { ResolvedSvartzConfig, SvartzConfig } from "./types/index";
import {
  ConfigDecodeFailed,
  ConfigImportFailed,
  ConfigNotFound,
  VaultPathInvalid,
} from "./types/index";
import { getPackageVersion } from "./utils";

const CONFIG_FILENAMES = ["svartz.config", ".svartzrc"];
const CONFIG_EXTENSIONS = [".ts", ".mjs", ".js"] as const;

/**
 * Parse (validate) a raw JS object against the config schema, then check that the
 * major version matches the version this package supports.
 * @param raw - The raw JS object to parse.
 * @returns The parsed SvartzConfig.
 */
export const parseConfig = (
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

    const supportedMajor = semverMajor(getPackageVersion(import.meta.url));
    const major = semverMajor(config.version);
    if (major !== supportedMajor) {
      return yield* new ConfigDecodeFailed({
        issues: [],
        message: `Incompatible config version: major ${major} (expected ${supportedMajor}). Config version "${config.version}" is not compatible with this version of @svartz/config.`,
      });
    }

    return config;
  });

/**
 * Validate and resolve the config file path from an explicit path or from CWD.
 * Respects SVARTZ_CONFIG env var.
 * - Explicit path to a directory: look for default config names in that dir.
 * - Explicit path to a file: use it.
 * - Explicit path that is neither, or no path: look in process.cwd().
 * @param configPath - The path to the config file or directory.
 * @returns The absolute path to the config file or directory.
 */
const validateConfigPath = (
  configPath?: string,
): Effect.Effect<string, ConfigNotFound> =>
  Effect.gen(function* () {
    const envOverride = process.env["SVARTZ_CONFIG"];
    const explicit = configPath ?? envOverride;

    let searchDir: string;
    if (explicit) {
      const resolved = resolve(explicit);
      const isDir = yield* Effect.promise(() =>
        stat(resolved).then(
          (s) => s.isDirectory(),
          () => false,
        ),
      );
      if (isDir) {
        searchDir = resolved;
      } else {
        const isFile = yield* Effect.promise(() =>
          access(resolved).then(
            () => true,
            () => false,
          ),
        );
        if (isFile) return resolved;
        return yield* new ConfigNotFound({
          searchPath: resolved,
          message: `Config file not found: ${resolved}`,
        });
      }
    } else {
      searchDir = process.cwd();
    }

    for (const base of CONFIG_FILENAMES) {
      for (const ext of CONFIG_EXTENSIONS) {
        const candidate = resolve(searchDir, `${base}${ext}`);
        const exists = yield* Effect.promise(() =>
          access(candidate).then(
            () => true,
            () => false,
          ),
        );
        if (exists) return candidate;
      }
    }
    return yield* new ConfigNotFound({
      searchPath: searchDir,
      message: `No config file (${CONFIG_FILENAMES.join(" or ")} with ${CONFIG_EXTENSIONS.join(", ")}) found in ${searchDir}`,
    });
  });

/**
 * Dynamically import a config file and extract its default export.
 * @param configPath - The path to the config file.
 * @returns The imported config.
 */
const importConfig = (
  configPath: string,
): Effect.Effect<unknown, ConfigImportFailed> =>
  Effect.tryPromise({
    try: async () => {
      const fileUrl = pathToFileURL(configPath);
      const configStat = await stat(configPath);
      fileUrl.searchParams.set("t", String(configStat.mtimeMs));
      const mod = (await import(fileUrl.href)) as Record<string, unknown>;
      return mod["default"] ?? mod;
    },
    catch: (cause) =>
      new ConfigImportFailed({
        path: configPath,
        message: `Failed to import config at ${configPath}: ${(cause as Error).message}`,
      }),
  });

/**
 * Load, import, and parse a svartz config file.
 * Returns the parsed SvartzConfig and the directory containing the config file.
 * @param configPath - The path to the config file or directory.
 * @returns The parsed and resolved SvartzConfig as ResolvedSvartzConfig.
 */
export const loadConfig = (
  configPath?: string,
): Effect.Effect<
  ResolvedSvartzConfig,
  ConfigNotFound | ConfigImportFailed | ConfigDecodeFailed | VaultPathInvalid
> =>
  Effect.gen(function* () {
    // Validate the config path and resolve it to an absolute path.
    const validatedPath = yield* validateConfigPath(configPath);
    // Dynamically import the config file and extract its default export.
    const raw = yield* importConfig(validatedPath);
    // Ensure the config adheres to the schema, and is compatible with this version of the config package.
    const config = yield* parseConfig(raw);
    // Resolve the SvartzConfig to ensure absolute paths in the config file.
    const resolvedConfig = yield* resolveConfig(config, dirname(validatedPath));

    return resolvedConfig;
  });
