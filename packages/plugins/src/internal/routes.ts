import type { ProcessedFile } from "@svartz/core";
import { fileToSlug, normalizeSlugSegment } from "./slug";

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

function requestedSlug(file: ProcessedFile): string {
  const source = fileToSlug(file.path);
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

/** Assign canonical slugs before links, giving explicit slugs priority over filenames. */
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
  const allocated = new Set<string>();
  const losers: { file: ProcessedFile; slug: string }[] = [];
  const reserved = new Set([...reservedPaths].map((path) => path.replace(/^\/+|\/+$/g, "")));

  for (const slug of [...groups.keys()].sort()) {
    const explicit = explicitClaims.get(slug);
    const group = groups.get(slug)!.sort((left, right) =>
      Number(right === explicit) - Number(left === explicit) ||
      Number(exactName(right, slug)) - Number(exactName(left, slug)) ||
      left.path.localeCompare(right.path),
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
    left.file.path.localeCompare(right.file.path),
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
    for (const value of alternateNames(file.frontmatter, aliasesField)) {
      const path = value.replace(/^\/+|\/+$/g, "");
      if (path.split("/").some((segment) => segment === "." || segment === "..") || /^[a-z]+:/i.test(path)) continue;
      const slug = routeSlug(path.split("/").map(normalizeSlugSegment).join("/"));
      if (!slug) continue;
      const href = routeHref(slug, mountPath);
      if (occupied.has(href)) continue;
      redirects[href] = routeHref(file.slug, mountPath);
      occupied.add(href);
    }
  }
  return redirects;
}
