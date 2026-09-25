import type { ProcessedFile } from "@svartz/core";
import { fileToSlug } from "./slug";

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

function naturalSlug(file: ProcessedFile): string {
  return routeSlug(fileToSlug(file.path));
}

function exactName(file: ProcessedFile, slug: string): boolean {
  const sourceStem = file.path.slice(0, -file.extension!.length).toLowerCase();
  return sourceStem === slug;
}

/** Assign canonical slugs after publication filtering, before links or artifacts. */
export function allocateRoutes(
  files: readonly ProcessedFile[],
  reservedPaths: ReadonlySet<string> = new Set(),
): void {
  const groups = new Map<string, ProcessedFile[]>();
  for (const file of files) {
    if (!isNote(file)) continue;
    const natural = naturalSlug(file);
    const group = groups.get(natural) ?? [];
    group.push(file);
    groups.set(natural, group);
  }

  const naturalSlugs = new Set(groups.keys());
  const allocated = new Set<string>();
  const losers: ProcessedFile[] = [];
  const reserved = new Set([...reservedPaths].map((path) => path.replace(/^\/+|\/+$/g, "")));

  for (const natural of [...groups.keys()].sort()) {
    const group = groups.get(natural)!.sort((left, right) =>
      Number(exactName(right, natural)) - Number(exactName(left, natural)) ||
      left.path.localeCompare(right.path),
    );
    if (reserved.has(natural === "index" ? "" : natural)) {
      losers.push(...group);
      continue;
    }
    group[0]!.slug = natural;
    allocated.add(natural);
    losers.push(...group.slice(1));
  }

  for (const file of losers.sort((left, right) =>
    naturalSlug(left).localeCompare(naturalSlug(right)) || left.path.localeCompare(right.path),
  )) {
    const natural = naturalSlug(file);
    for (let suffix = 2; ; suffix++) {
      const candidate = `${natural === "index" ? "index" : natural}-${suffix}`;
      if (naturalSlugs.has(candidate) || allocated.has(candidate) || reserved.has(candidate)) continue;
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
      const slug = routeSlug(fileToSlug(path));
      if (!slug) continue;
      const href = routeHref(slug, mountPath);
      if (occupied.has(href)) continue;
      redirects[href] = routeHref(file.slug, mountPath);
      occupied.add(href);
    }
  }
  return redirects;
}
