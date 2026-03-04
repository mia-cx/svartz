import { Effect, Either } from "effect";
import { traverseVault as traverseVaultProgram } from "./traverser.js";
import { buildIndex as buildIndexProgram } from "./indexer.js";
import { mapResolvedVaultToIndexOptions } from "./config-adapter.js";
import { normalizeSlugSegment } from "./utils/slug.js";
import type {
  VaultFile,
  TraverseVaultOptions,
  Index,
  BuildIndexOptions,
  VaultError,
} from "./types.js";

export type {
  VaultFile,
  TraverseVaultOptions,
  Index,
  IndexEntry,
  FrontmatterData,
  LinkMatch,
  LinkResolutionStrategy,
  BuildIndexOptions,
  SlugMap,
  VaultError,
} from "./types.js";

export {
  VaultNotFound,
  FileReadError,
  SlugConflict,
  ParseError,
} from "./types.js";

export { normalizeSlugSegment };

// Effect programs for consumers who use Effect directly
export { traverseVaultProgram as traverseVaultEffect };
export { buildIndexProgram as buildIndexEffect };
export { mapResolvedVaultToIndexOptions };

/**
 * Run an Effect program and throw the typed error directly on failure.
 * This lets consumers catch tagged errors with instanceof.
 */
const runEffect = <A, E>(effect: Effect.Effect<A, E>): Promise<A> =>
  Effect.runPromise(effect.pipe(Effect.either)).then((result) => {
    if (Either.isRight(result)) return result.right;
    throw result.left;
  });

// --- Promise-based public API (no Effect dependency required by consumers) ---

export const traverseVault = (
  vaultPath: string,
  options?: TraverseVaultOptions,
): Promise<VaultFile[]> =>
  runEffect(traverseVaultProgram(vaultPath, options ?? {}));

export const buildIndex = (
  files: VaultFile[],
  options?: BuildIndexOptions,
): Promise<Index> => runEffect(buildIndexProgram(files, options ?? {}));
