import { Data } from "effect";

export interface VaultFile {
  readonly path: string;
  readonly name: string;
  readonly extension: string;
  readonly isDirectory: boolean;
}

export interface TraverseVaultOptions {
  readonly include?: string[];
  readonly exclude?: string[];
}

export interface Index {
  readonly version: string;
  readonly notes: IndexEntry[];
  readonly graph: Record<string, string[]>;
}

/**
 * Raw index entry with just frontmatter and minimal processing.
 * Used internally before conversion to IndexEntry.
 */
export interface RawIndexEntry {
  readonly slug: string;
  readonly path: string;
  readonly frontmatter: FrontmatterData;
  readonly links: LinkMatch[];
}

export interface IndexEntry extends Omit<RawIndexEntry, "frontmatter" | "links"> {
  readonly title: string;
  readonly tags: string[];
  readonly aliases: string[];
  readonly description?: string;
  readonly externalLinks: string[];
  readonly headings: string[];
  readonly wordCount: number;
  readonly readingTimeMinutes: number;
  readonly createdAt: Date;
  readonly modifiedAt: Date;
  readonly publishedAt?: Date;
  readonly links: string[];
}

export interface FrontmatterData {
  [key: string]: unknown;
}

export interface LinkMatch {
  readonly raw: string;
  readonly target: string;
  readonly section?: string;
  readonly label?: string;
  readonly type: "wikilink" | "markdown";
}

// --- Tagged errors (extend Error, yieldable in Effect.gen) ---

export class VaultNotFound extends Data.TaggedError("VaultNotFound")<{
  readonly path: string;
  readonly message: string;
}> {}

export class FileReadError extends Data.TaggedError("FileReadError")<{
  readonly path: string;
  readonly message: string;
  readonly attempts: number;
}> {}

export class SlugConflict extends Data.TaggedError("SlugConflict")<{
  readonly slug: string;
  readonly message: string;
}> {}

export class ParseError extends Data.TaggedError("ParseError")<{
  readonly path: string;
  readonly message: string;
}> {}

export type VaultError = VaultNotFound | FileReadError | SlugConflict | ParseError;

// --- Options ---

export type LinkResolutionStrategy = "closest" | "shallowest" | "absolute";

export interface BuildIndexOptions {
  readonly titleField?: string;
  readonly descriptionField?: string;
  readonly tagsField?: string;
  readonly aliasesField?: string;
  readonly createdAtField?: string;
  readonly updatedAtField?: string;
  readonly draftField?: string;
  readonly publishedField?: string;
  readonly dateFormat?: string;
  readonly concurrency?: number;
  readonly maxRetries?: number;
  readonly verbose?: boolean;
  readonly vaultPath?: string;
  readonly linkResolution?: LinkResolutionStrategy;
  readonly include?: string[];
  readonly exclude?: string[];
}

export type SlugMap = Record<string, string>;
