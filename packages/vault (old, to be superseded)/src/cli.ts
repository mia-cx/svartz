#!/usr/bin/env node

import { Effect, Either } from "effect";
import { program } from "commander";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  ConfigDecodeFailed,
  ConfigImportFailed,
  ConfigNotFound,
  VaultIdNotFound,
  VaultPathInvalid,
  getVault,
  loadConfigEffect,
  resolveConfigPaths,
} from "@svartz/config";
import { traverseVault } from "./traverser.js";
import { buildIndex } from "./indexer.js";
import type { BuildIndexOptions, LinkResolutionStrategy } from "./types.js";
import {
  FileReadError,
  ParseError,
  SlugConflict,
  VaultNotFound,
} from "./types.js";
import { mapResolvedVaultToIndexOptions } from "./config-adapter.js";

const collectOption = (value: string, previous: string[]): string[] => [
  ...previous,
  value,
];

const parsePositiveInt = (value: string, fallback: number): number => {
  const n = parseInt(value);
  return isNaN(n) || n < 1 ? fallback : n;
};

const runEffect = <A, E>(effect: Effect.Effect<A, E>): Promise<A> =>
  Effect.runPromise(effect.pipe(Effect.either)).then((result) => {
    if (Either.isRight(result)) return result.right;
    throw result.left;
  });

export interface IndexCommandOptions {
  readonly config?: string;
  readonly output?: string;
  readonly vault?: string;
  readonly titleField?: string;
  readonly descriptionField?: string;
  readonly tagsField?: string;
  readonly aliasesField?: string;
  readonly createdAtField?: string;
  readonly updatedAtField?: string;
  readonly draftField?: string;
  readonly concurrency?: string;
  readonly maxRetries?: string;
  readonly include?: string[];
  readonly exclude?: string[];
  readonly linkResolution?: string;
  readonly verbose?: boolean;
}

const isConfigUnavailableError = (error: unknown): boolean =>
  error instanceof ConfigNotFound ||
  error instanceof ConfigImportFailed ||
  error instanceof ConfigDecodeFailed;

const looksLikePath = (value: string): boolean =>
  value.includes("/") ||
  value.includes("\\") ||
  value.startsWith(".") ||
  value.startsWith("~");

const formatError = (error: unknown): string => {
  if (
    error instanceof ConfigNotFound ||
    error instanceof ConfigImportFailed ||
    error instanceof ConfigDecodeFailed ||
    error instanceof VaultPathInvalid ||
    error instanceof VaultIdNotFound ||
    error instanceof VaultNotFound ||
    error instanceof FileReadError ||
    error instanceof SlugConflict ||
    error instanceof ParseError
  ) {
    return error.message;
  }

  if (error instanceof Error) return error.message;
  return String(error);
};

const buildPathModeOptions = (
  resolvedVaultPath: string,
  opts: IndexCommandOptions,
): BuildIndexOptions => ({
  titleField: opts.titleField ?? "title",
  descriptionField: opts.descriptionField ?? "description",
  tagsField: opts.tagsField ?? "tags",
  aliasesField: opts.aliasesField ?? "aliases",
  createdAtField: opts.createdAtField ?? "created_at",
  updatedAtField: opts.updatedAtField ?? "updated_at",
  draftField: opts.draftField ?? "draft",
  concurrency: parsePositiveInt(opts.concurrency ?? "10", 10),
  maxRetries: parsePositiveInt(opts.maxRetries ?? "3", 3),
  verbose: opts.verbose ?? false,
  vaultPath: resolvedVaultPath,
  linkResolution: (opts.linkResolution ?? "closest") as LinkResolutionStrategy,
  include: opts.include ?? [],
  exclude: opts.exclude ?? [],
});

export const runIndexCommand = async (
  vaultRef: string | undefined,
  opts: IndexCommandOptions,
): Promise<void> => {
  const positionalVaultRef = vaultRef?.trim();
  const selectedConfigVaultId = positionalVaultRef || opts.vault;

  try {
    const { config, configDir } = await runEffect(
      loadConfigEffect(opts.config),
    );
    const resolvedConfig = await resolveConfigPaths(config, configDir);

    if (resolvedConfig.vaults.length === 0) {
      throw new Error("No vaults are defined in svartz config");
    }

    // Determine which vaults to index
    const vaultsToIndex = selectedConfigVaultId
      ? [await getVault(resolvedConfig, selectedConfigVaultId)]
      : resolvedConfig.vaults;

    // Index each vault
    for (const vault of vaultsToIndex) {
      const adapted = mapResolvedVaultToIndexOptions(
        vault,
        resolvedConfig.defaults.build,
      );

      const outputPath = opts.output
        ? resolve(opts.output)
        : resolve(configDir, ".svartz", "vaults", vault.id, "index.json");

      if (opts.verbose) {
        console.log(`Indexing vault from config: ${vault.id}`);
        console.log(`Vault path: ${adapted.vaultPath}`);
      }

      const indexEffect = Effect.gen(function* () {
        const files = yield* traverseVault(adapted.vaultPath, adapted.traverseOptions);
        if (opts.verbose) console.log(`Found ${files.length} files`);
        return yield* buildIndex(files, {
          ...adapted.buildOptions,
          verbose: opts.verbose ?? false,
        });
      });

      const index = await runEffect(indexEffect);

      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, JSON.stringify(index, null, 2), "utf-8");

      console.log(`✓ Generated index: ${outputPath}`);
      console.log(`  Version: ${index.version}`);
      console.log(`  Notes: ${index.notes.length}`);
      console.log(`  Links: ${index.notes.reduce((sum, n) => sum + n.links.length, 0)}`);
    }

    return;
  } catch (configFlowError) {
    const canFallbackToPathMode =
      !!positionalVaultRef &&
      isConfigUnavailableError(configFlowError) &&
      (looksLikePath(positionalVaultRef) ||
        existsSync(resolve(positionalVaultRef)));

    if (!canFallbackToPathMode) {
      throw configFlowError;
    }
  }

  if (!positionalVaultRef) {
    throw new Error(
      "Path mode requires a positional vault path: svartz-vault index <vault-path>",
    );
  }

  const resolvedVaultPath = resolve(positionalVaultRef);
  const vaultName = basename(resolvedVaultPath);
  const outputPath = opts.output
    ? resolve(opts.output)
    : resolve(".svartz", "vaults", vaultName, "index.json");
  const buildOptions = buildPathModeOptions(resolvedVaultPath, opts);

  const indexEffect = Effect.gen(function* () {
    if (opts.verbose) console.log(`Indexing vault: ${resolvedVaultPath}`);
    const files = yield* traverseVault(resolvedVaultPath, {
      include: buildOptions.include,
      exclude: buildOptions.exclude,
    });
    if (opts.verbose) console.log(`Found ${files.length} files`);
    return yield* buildIndex(files, buildOptions);
  });

  const index = await runEffect(indexEffect);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(index, null, 2), "utf-8");

  console.log(`✓ Generated index: ${outputPath}`);
  console.log(`  Version: ${index.version}`);
  console.log(`  Notes: ${index.notes.length}`);
  console.log(`  Links: ${index.notes.reduce((sum, n) => sum + n.links.length, 0)}`);
};

program
  .name("svartz-vault")
  .description("Obsidian vault traversal and index generation")
  .version("0.0.1");

program
  .command("index [vault-ref]")
  .description("Generate an index from an Obsidian vault")
  .option("--config <path>", "Path to svartz config file")
  .option("--vault <id>", "Vault id from svartz config")
  .option("-o, --output <path>", "Output path for index.json")
  .option("--title-field <field>", "Frontmatter field for title", "title")
  .option(
    "--description-field <field>",
    "Frontmatter field for description",
    "description",
  )
  .option("--tags-field <field>", "Frontmatter field for tags", "tags")
  .option(
    "--aliases-field <field>",
    "Frontmatter field for aliases",
    "aliases",
  )
  .option(
    "--created-at-field <field>",
    "Frontmatter field for created_at",
    "created_at",
  )
  .option(
    "--updated-at-field <field>",
    "Frontmatter field for updated_at",
    "updated_at",
  )
  .option("--draft-field <field>", "Frontmatter field for draft", "draft")
  .option("--concurrency <number>", "Max concurrent file reads", "10")
  .option("--max-retries <number>", "Max retries for file reads", "3")
  .option(
    "--include <pattern>",
    "Include glob pattern (repeatable, evaluated relative to vault root)",
    collectOption,
    [],
  )
  .option(
    "--exclude <pattern>",
    "Exclude glob pattern (repeatable, evaluated relative to vault root)",
    collectOption,
    [],
  )
  .option(
    "--link-resolution <strategy>",
    "Link resolution strategy: closest, shallowest, or absolute",
    "closest",
  )
  .option("-v, --verbose", "Verbose output")
  .action(async (vaultRef: string | undefined, opts: IndexCommandOptions) => {
    try {
      await runIndexCommand(vaultRef, opts);
    } catch (error) {
      console.error(`✗ Error: ${formatError(error)}`);
      process.exit(1);
    }
  });

const isCliEntrypoint =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isCliEntrypoint) {
  program.parse(process.argv);
}
