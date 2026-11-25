import type { ProcessedFile } from "@svartz/core";
import { fileToSlug, folderNoteRank, isFolderNote, normalizeSlugSegment } from "./slug";

const NOTE_EXTENSIONS = new Set([".md", ".mdx", ".svx"]);

export function isNote(file: ProcessedFile): boolean {
  return NOTE_EXTENSIONS.has(file.extension ?? "");
}

export function alternateNames(frontmatter: Record<string, unknown> | undefined, aliasesField = "aliases"): string[] {
  const source = frontmatter ?? {};
  return [...new Set([source.alias, source[aliasesField], source.permalink].flat()
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean))];
}

export function routeSlug(slug: string): string {
  if (slug === "index") return "index";
  return slug.endsWith("/index") ? slug.slice(0, -"/index".length) : slug;
}

export function routeHref(slug: string, mountPath = ""): string {
  const path = routeSlug(slug) === "index" ? "" : routeSlug(slug);
  return `${mountPath}/${path}${path ? "/" : ""}`;
}

/** The Markdown copy beside a page: `/notes/a/` has `/notes/a.md`, and a vault home has `<mount>/index.md`. */
export function markdownHref(slug: string, mountPath = ""): string {
  return `${mountPath}/${routeSlug(slug)}.md`;
}

/** A note's slug from its path, where every folder note (`Guides/Guides.md` too) is its folder's `index`. */
function sourceSlug(path: string): string {
  const slug = fileToSlug(path);
  // Its last segment, by either separator, as `isFolderNote` reads the path.
  return isFolderNote(path) ? slug.replace(/[^/\\]+$/, "index") : slug;
}

/** The route a note's filename asks for: `people/Ada Lovelace.md` → `people/ada-lovelace`, `Guides/Guides.md` → `guides`. */
export function pathRoute(path: string): string {
  return routeSlug(sourceSlug(path));
}

/** The route a note asks for before {@link allocateRoutes} settles clashes: its frontmatter `slug`, else its filename's. */
export function requestedSlug(file: Pick<ProcessedFile, "path" | "frontmatter">): string {
  const source = sourceSlug(file.path);
  if (!file.frontmatter || !("slug" in file.frontmatter)) return routeSlug(source);

  const value = file.frontmatter.slug;
  if (typeof value !== "string" || !value.trim() || value.includes("/") || value.includes("\\")) {
    throw new Error(`Invalid slug in ${file.path}: expected a non-empty string without "/" or "\\".`);
  }
  const segment = normalizeSlugSegment(value);
  if (!segment) throw new Error(`Invalid slug in ${file.path}: normalizes to empty.`);
  if (/^\.+$/.test(segment)) throw new Error(`Invalid slug in ${file.path}: dot segments are not allowed.`);
  if (segment === "index") throw new Error(`Invalid slug in ${file.path}: "index" names the folder, not a note.`);
  if (source === "index" || source.endsWith("/index")) {
    throw new Error(`Invalid slug in ${file.path}: folder notes cannot set slug.`);
  }
  const parent = source.slice(0, source.lastIndexOf("/") + 1);
  return routeSlug(`${parent}${segment}`);
}

function exactName(file: ProcessedFile, slug: string): boolean {
  const sourceStem = file.path.slice(0, -file.extension!.length).toLowerCase();
  return sourceStem === slug;
}

/** A file's folder, as written: `Guides/Guides.md` → `Guides`. */
const folderOf = (path: string): string => path.replaceAll("\\", "/").replace(/\/?[^/]*$/, "");

/**
 * The path each file of `group` sorts by. Each folder's files keep the places their paths give them among other
 * folders' files, and fill those places in {@link folderNoteRank} order. So `index` beats `_index`, and `_index` beats
 * the folder's namesake, inside one folder. Files from different folders keep the order their paths give them.
 */
function sortPaths(group: readonly ProcessedFile[]): Map<ProcessedFile, string> {
  const folders = new Map<string, ProcessedFile[]>();
  for (const file of group) folders.set(folderOf(file.path), [...folders.get(folderOf(file.path)) ?? [], file]);
  const keys = new Map<ProcessedFile, string>();
  for (const files of folders.values()) {
    const places = files.map((file) => file.path).sort((left, right) => left.localeCompare(right));
    [...files]
      .sort((left, right) => folderNoteRank(left.path) - folderNoteRank(right.path) || left.path.localeCompare(right.path))
      .forEach((file, place) => keys.set(file, places[place]!));
  }
  return keys;
}

/**
 * Assign canonical slugs before links, giving explicit slugs priority over filenames. Among one folder's notes that
 * want one URL, `index` beats `_index` beats a note named after its folder ({@link folderNoteRank}); the rest are
 * numbered.
 */
export function allocateRoutes(
  files: readonly ProcessedFile[],
  reservedPaths: ReadonlySet<string> = new Set(),
): void {
  const groups = new Map<string, ProcessedFile[]>();
  const explicitClaims = new Map<string, ProcessedFile>();
  for (const file of files) {
    if (!isNote(file)) continue;
    const slug = requestedSlug(file);
    if (file.frontmatter && "slug" in file.frontmatter) {
      const existing = explicitClaims.get(slug);
      if (existing) {
        throw new Error(`Conflicting slug "${slug}" in ${existing.path} and ${file.path}.`);
      }
      explicitClaims.set(slug, file);
    }
    const group = groups.get(slug) ?? [];
    group.push(file);
    groups.set(slug, group);
  }

  const claimedSlugs = new Set(groups.keys());
  const sortPath = new Map([...groups.values()].flatMap((group) => [...sortPaths(group)]));
  const allocated = new Set<string>();
  const losers: { file: ProcessedFile; slug: string }[] = [];
  const reserved = new Set([...reservedPaths].map((path) => path.replace(/^\/+|\/+$/g, "")));

  for (const slug of [...groups.keys()].sort()) {
    const explicit = explicitClaims.get(slug);
    const group = groups.get(slug)!.sort((left, right) =>
      Number(right === explicit) - Number(left === explicit) ||
      Number(exactName(right, slug)) - Number(exactName(left, slug)) ||
      sortPath.get(left)!.localeCompare(sortPath.get(right)!),
    );
    if (reserved.has(slug === "index" ? "" : slug)) {
      losers.push(...group.map((file) => ({ file, slug })));
      continue;
    }
    group[0]!.slug = slug;
    allocated.add(slug);
    losers.push(...group.slice(1).map((file) => ({ file, slug })));
  }

  for (const { file, slug } of losers.sort((left, right) =>
    left.slug.localeCompare(right.slug) ||
    Number(right.file === explicitClaims.get(right.slug)) - Number(left.file === explicitClaims.get(left.slug)) ||
    sortPath.get(left.file)!.localeCompare(sortPath.get(right.file)!),
  )) {
    for (let suffix = 2; ; suffix++) {
      const candidate = `${slug}-${suffix}`;
      if (claimedSlugs.has(candidate) || allocated.has(candidate) || reserved.has(candidate)) continue;
      file.slug = candidate;
      allocated.add(candidate);
      break;
    }
  }
}

/**
 * The routes a note's alternate names ask to redirect from, below the vault's mount: `aliases: [Old Name]` asks for
 * `old-name`. {@link allocateRedirects} grants those still free.
 */
export function alternateRoutes(frontmatter: Record<string, unknown> | undefined, aliasesField = "aliases"): string[] {
  const routes: string[] = [];
  for (const value of alternateNames(frontmatter, aliasesField)) {
    const path = value.replace(/^\/+|\/+$/g, "");
    if (path.split("/").some((segment) => segment === "." || segment === "..") || /^[a-z]+:/i.test(path)) continue;
    const slug = routeSlug(path.split("/").map(normalizeSlugSegment).join("/"));
    if (slug) routes.push(slug);
  }
  return routes;
}

/** Quartz alternate names are redirects, and only free routes can redirect. */
export function allocateRedirects(
  files: readonly ProcessedFile[],
  mountPath: string,
  reservedPaths: ReadonlySet<string> = new Set(),
  aliasesField = "aliases",
): Record<string, string> {
  const occupied = new Set(files.filter(isNote).map((file) => routeHref(file.slug, mountPath)));
  for (const path of reservedPaths) occupied.add(routeHref(path || "index", mountPath));
  const redirects: Record<string, string> = {};

  for (const file of [...files].filter(isNote).sort((a, b) => a.path.localeCompare(b.path))) {
    for (const slug of alternateRoutes(file.frontmatter, aliasesField)) {
      const href = routeHref(slug, mountPath);
      if (occupied.has(href)) continue;
      redirects[href] = routeHref(file.slug, mountPath);
      occupied.add(href);
    }
  }
  return redirects;
}
