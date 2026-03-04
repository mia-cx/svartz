import { Effect, Schedule } from "effect";
import { readFile, stat } from "node:fs/promises";
import type { Stats } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readPackageUpSync } from "read-package-up";
import type {
  VaultFile,
  Index,
  IndexEntry,
  RawIndexEntry,
  BuildIndexOptions,
  LinkMatch,
  LinkResolutionStrategy,
  SlugMap,
  FrontmatterData,
} from "./types.js";
import { FileReadError, ParseError } from "./types.js";
import {
  extractFrontmatter,
  extractRawLinks,
  extractExternalLinks,
  extractHeadings,
  extractDescription,
  countWords,
} from "./utils/parse.js";
import { normalizeDateTime } from "./utils/datetime.js";
import { fileToSlug, deriveTitle, buildSlugMap } from "./utils/slug.js";
import type { SlugConflict } from "./types.js";

/** Resolve @svartz/vault version from the package that contains this module (works from monorepo or node_modules). */
const getPackageVersion = (): string => {
  const cwd = dirname(fileURLToPath(import.meta.url));
  const result = readPackageUpSync({ cwd });
  return result?.packageJson?.version ?? "0.0.0";
};

// --- Pure link resolution helpers ---

const sharedDepth = (a: string, b: string): number => {
  const aParts = a.split("/");
  const bParts = b.split("/");
  let depth = 0;
  while (
    depth < aParts.length - 1 &&
    depth < bParts.length - 1 &&
    aParts[depth] === bParts[depth]
  ) {
    depth++;
  }
  return depth;
};

const resolveLink = (
  linkMatch: LinkMatch,
  slugMap: SlugMap,
  allSlugs: string[],
  strategy: LinkResolutionStrategy,
  sourceSlug: string,
): string | null => {
  const target = linkMatch.target.trim();
  if (!target) return null;

  const normalized = fileToSlug(target);

  if (slugMap[normalized] !== undefined) return slugMap[normalized]!;

  if (strategy === "absolute") return null;

  const baseName = normalized.split("/").pop();
  if (!baseName) return null;

  const candidates = allSlugs.filter((slug) => slug.split("/").pop() === baseName);
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0]!;

  const byDepth = (a: string, b: string) =>
    a.split("/").length - b.split("/").length;

  if (strategy === "closest") {
    return candidates.sort((a, b) => {
      const depthDiff =
        sharedDepth(sourceSlug, b) - sharedDepth(sourceSlug, a);
      if (depthDiff !== 0) return depthDiff;
      const depth = byDepth(a, b);
      return depth !== 0 ? depth : a.localeCompare(b);
    })[0]!;
  }

  return candidates.sort((a, b) => byDepth(a, b) || a.localeCompare(b))[0]!;
};

// --- Effectful file read with retry + jittered exponential backoff ---

const readFileRetried = (
  fullPath: string,
  filePath: string,
  maxRetries: number,
): Effect.Effect<string, FileReadError> =>
  Effect.tryPromise({
    try: () => readFile(fullPath, "utf-8"),
    catch: (cause) =>
      new FileReadError({
        path: filePath,
        message: `Failed to read ${filePath}: ${(cause as Error).message}`,
        attempts: maxRetries,
      }),
  }).pipe(
    Effect.retry(
      Schedule.exponential("100 millis").pipe(
        Schedule.jittered,
        Schedule.intersect(Schedule.recurs(Math.max(0, maxRetries - 1))),
      ),
    ),
  );

// --- Pure note parsing (no I/O) ---

interface ParseNoteFields {
  titleField: string;
  descriptionField: string;
  tagsField: string;
  aliasesField: string;
  createdAtField: string;
  updatedAtField: string;
  draftField: string;
  publishedField?: string;
  dateFormat?: string;
}

interface ParsedFile {
  raw: RawIndexEntry;
  bodyMarkdown: string;
  fileStat: Stats;
}

const parseNote = (
  file: VaultFile,
  content: string,
  fileStat: Stats,
  fields: ParseNoteFields,
): ParsedFile => {
  const { frontmatter, bodyMarkdown } = extractFrontmatter(content);
  const slug = fileToSlug(file.path);

  const rawLinks = extractRawLinks(bodyMarkdown);

  return {
    raw: {
      slug,
      path: file.path,
      frontmatter,
      links: rawLinks,
    },
    bodyMarkdown,
    fileStat,
  };
};

/**
 * Convert a ParsedFile to an IndexEntry by extracting and processing frontmatter fields.
 */
const toIndexEntry = (
  parsed: ParsedFile,
  fields: ParseNoteFields,
): IndexEntry => {
  const { raw, bodyMarkdown, fileStat } = parsed;
  const frontmatter = raw.frontmatter;

  const tags = Array.isArray(frontmatter[fields.tagsField])
    ? (frontmatter[fields.tagsField] as string[])
    : [];

  const rawAliases = Array.isArray(frontmatter[fields.aliasesField])
    ? (frontmatter[fields.aliasesField] as string[])
    : [];
  const aliases = [...new Set(rawAliases)];

  const fmTitle = frontmatter[fields.titleField];
  const title =
    typeof fmTitle === "string" && fmTitle.length > 0
      ? fmTitle
      : deriveTitle(raw.path.split("/").pop() ?? "Untitled");

  const fmDescription = frontmatter[fields.descriptionField];
  const description =
    typeof fmDescription === "string" && fmDescription.length > 0
      ? fmDescription
      : extractDescription(bodyMarkdown);

  const fmCreatedAt = frontmatter[fields.createdAtField];
  const createdAt =
    normalizeDateTime(fmCreatedAt, fields.dateFormat) ?? fileStat.birthtime;

  const fmModifiedAt = frontmatter[fields.updatedAtField];
  const modifiedAt =
    normalizeDateTime(fmModifiedAt, fields.dateFormat) ?? fileStat.mtime;

  // Resolve publishedAt from publishedField
  let publishedAt: Date | undefined;
  if (fields.publishedField && fields.publishedField.length > 0) {
    const publishedValue = frontmatter[fields.publishedField];
    if (publishedValue === true) {
      publishedAt = createdAt;
    } else if (publishedValue) {
      publishedAt =
        normalizeDateTime(publishedValue, fields.dateFormat) ?? undefined;
    }
  }

  const wc = countWords(bodyMarkdown);

  return {
    slug: raw.slug,
    title,
    path: raw.path,
    tags,
    aliases,
    description,
    externalLinks: extractExternalLinks(bodyMarkdown),
    headings: extractHeadings(bodyMarkdown),
    wordCount: wc,
    readingTimeMinutes: Math.ceil(wc / 200) || 1,
    createdAt,
    modifiedAt,
    publishedAt,
    links: [],
  };
};

// --- Main index builder ---

/**
 * Build a complete vault index from discovered files.
 *
 * Pipeline:
 * 1. Read + parse each file with bounded concurrency and jittered retries
 * 2. Build global slug map
 * 3. Resolve raw links to canonical slugs
 * 4. Construct top-level graph
 */
export const buildIndex = (
  files: VaultFile[],
  options: BuildIndexOptions = {},
): Effect.Effect<Index, FileReadError | SlugConflict | ParseError> =>
  Effect.gen(function* () {
    const {
      titleField = "title",
      descriptionField = "description",
      tagsField = "tags",
      aliasesField = "aliases",
      createdAtField = "created_at",
      updatedAtField = "updated_at",
      draftField = "draft",
      publishedField,
      dateFormat,
      concurrency = 10,
      maxRetries = 3,
      vaultPath,
    } = options;

    const fields: ParseNoteFields = {
      titleField,
      descriptionField,
      tagsField,
      aliasesField,
      createdAtField,
      updatedAtField,
      draftField,
      publishedField,
      dateFormat,
    };

    const validConcurrency = Math.max(1, Math.min(concurrency, 100));
    const validMaxRetries = Math.max(1, Math.min(maxRetries, 10));

    const rawEntries = yield* Effect.forEach(
      files,
      (file) =>
        Effect.gen(function* () {
          const fullPath = vaultPath
            ? join(vaultPath, file.path)
            : file.path;
          const content = yield* readFileRetried(
            fullPath,
            file.path,
            validMaxRetries,
          );
          const fileStat = yield* Effect.promise(() => stat(fullPath));
          return parseNote(file, content, fileStat, fields);
        }),
      { concurrency: validConcurrency },
    );

    const filteredEntries =
      publishedField && publishedField.length > 0
        ? rawEntries.filter((entry) => {
            const publishedValue = entry.raw.frontmatter[publishedField];
            // Include only if published field exists AND is truthy (true or datetime)
            return publishedValue !== false && publishedValue !== null && publishedValue !== undefined && publishedValue !== "";
          })
        : rawEntries;

    // Extract aliases for slug mapping
    const slugSources = filteredEntries.map((entry) => {
      const rawAliases = Array.isArray(entry.raw.frontmatter[fields.aliasesField])
        ? (entry.raw.frontmatter[fields.aliasesField] as string[])
        : [];
      const aliases = [...new Set(rawAliases)];
      return {
        slug: entry.raw.slug,
        aliases,
      };
    });

    const slugMap = yield* buildSlugMap(slugSources);
    const allSlugs = filteredEntries.map((e) => e.raw.slug);
    const strategy = options.linkResolution ?? "closest";

    const entries: IndexEntry[] = filteredEntries.map((entry) => {
      const indexEntry = toIndexEntry(entry, fields);
      return {
        ...indexEntry,
        links: [
          ...new Set(
            entry.raw.links
              .map((raw) =>
                resolveLink(raw, slugMap, allSlugs, strategy, entry.raw.slug),
              )
              .filter((s): s is string => s !== null),
          ),
        ],
      };
    });

    const graph: Record<string, string[]> = Object.fromEntries(
      entries.map((entry) => [entry.slug, entry.links]),
    );

    return {
      version: getPackageVersion(),
      notes: entries,
      graph,
    };
  });
