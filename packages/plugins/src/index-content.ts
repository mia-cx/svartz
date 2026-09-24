/**
 * core:index — single canonical index artifact producer.
 *
 * Builds the Index from ctx.files (with slugs, frontmatter, and resolved links).
 * Produces: entries (search), graph (forward links), backlinks (reverse links).
 *
 * Precondition: all transforms complete; files have slug, frontmatter, and links.
 * Postcondition: ctx.index is populated with the canonical Index artifact.
 */

import { definePlugin, matchThemeRoute } from "@svartz/core";
import type {
  DateSource,
  FolderIndexEntry,
  IndexEntry,
  IndexLink,
  Index,
  RouteIndex,
  SearchDocument,
  SvartzTheme,
  TagIndexEntry,
} from "@svartz/core";
import { countWords, extractDescription, stripMarkdownToText } from "./internal/parse";
import { normalizeDateTime, publicationOverride } from "./internal/datetime";
import { allocateRedirects, alternateNames, routeHref } from "./internal/routes";
import { normalizeSlugSegment } from "./internal/slug";

const INDEX_VERSION = "1.0.0";
const DEFAULT_INDEX_TIMESTAMP = new Date(0);

function isMarkdownFile(extension: string | undefined): boolean {
  return extension !== undefined && [".md", ".mdx", ".svx"].includes(extension);
}

function folderSlugsFromPath(path: string): string[] {
  const segments = path.replaceAll("\\", "/").split("/").slice(0, -1).map(normalizeSlugSegment);
  return segments.map((_, index) => segments.slice(0, index + 1).join("/"));
}

function folderTitle(slug: string): string {
  return slug
    .split("/")
    .pop()
    ?.replace(/[-_]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    ?? "Folder";
}

function staticThemeRoutes(theme: SvartzTheme | undefined, mountPath: string): string[] {
  return theme?.routes.flatMap((route) => {
    const dynamic = route.pattern.split("/").some((segment) =>
      segment === ":slug" || segment === "[slug]" || segment === "[...slug]");
    if (!route.component || route.prerender === false || dynamic) return [];
    if (matchThemeRoute(theme.routes, { pathname: route.pattern })?.route !== route) return [];
    return [routeHref(route.pattern.replace(/^\/+|\/+$/g, "") || "index", mountPath)];
  }) ?? [];
}

function chooseDate(
  sources: readonly DateSource[],
  frontmatter: unknown,
  git: Date | undefined,
  filesystem: Date | undefined,
  format?: string,
): Date {
  for (const source of sources) {
    const date = source === "frontmatter" ? normalizeDateTime(frontmatter, format)
      : source === "git" ? git : filesystem;
    if (date) return date;
  }
  return DEFAULT_INDEX_TIMESTAMP;
}

/** Route prefix config that themes may place under `theme.routes.*` in the vault config. */
interface ThemeRouteConfig {
  tags?: string;
  folders?: string;
  feed?: string;
}

function resolveThemeRouteConfig(theme: { base: string; [key: string]: unknown }): Required<ThemeRouteConfig> {
  const routes = (theme as { routes?: ThemeRouteConfig }).routes;
  return {
    tags: routes?.tags ?? "tags",
    folders: routes?.folders ?? "folders",
    feed: routes?.feed ?? "feed",
  };
}

export const indexContent = definePlugin(() => ({
  id: "core:index",

  indexContent: {
    run(ctx) {
      const fm = ctx.config.frontmatter;
      const routeConfig = resolveThemeRouteConfig(ctx.config.theme);
      const mountPath = ctx.config.mountPath ?? "";
      const reservedPaths = (ctx.meta.get("reservedRoutes") as ReadonlySet<string> | undefined) ?? new Set<string>();
      const entries: IndexEntry[] = [];
      const protectedEntries = new Map<string, IndexEntry[]>();
      const search: SearchDocument[] = [];
      const tagCounts = new Map<string, number>();
      const folderMembers = new Map<string, string[]>();
      const noteRouteSet = new Set<string>();
      const publicAssetPaths = ctx.meta.get("svartz:publicAssetPaths") as ReadonlySet<string> | undefined;
      const assetRecords = ctx.files
        .filter((file) => !isMarkdownFile(file.extension))
        .filter((file) => !publicAssetPaths || publicAssetPaths.has(file.path))
        .map((file) => ({
          path: file.path,
          sourcePath: file.sourcePath ?? file.path,
        }))
        .sort((left, right) => left.path.localeCompare(right.path));

      for (const file of ctx.files) {
        if (!isMarkdownFile(file.extension)) continue;

        const frontmatter = file.frontmatter ?? {};

        const fmTitle = frontmatter[fm.titleField];
        const title =
          typeof fmTitle === "string" && fmTitle.length > 0
            ? fmTitle
            : "Untitled";

        const tags = [...new Set([
          ...(Array.isArray(frontmatter[fm.tagsField]) ? frontmatter[fm.tagsField] as unknown[] : [])
            .filter((tag): tag is string => typeof tag === "string")
            .map((tag) => tag.trim().replace(/^#/, "").toLowerCase())
            .filter(Boolean),
          ...(file.inlineTags ?? []),
        ])];

        const aliases = alternateNames(frontmatter, fm.aliasesField);

        const fmDesc = frontmatter[fm.descriptionField];
        const description =
          typeof fmDesc === "string" && fmDesc.length > 0
            ? fmDesc
            : extractDescription(file.content);
        const plainTextContent = stripMarkdownToText(file.content);

        const sources = ctx.config.discovery?.dateSources ?? ["frontmatter", "git", "filesystem"];
        const createdAt = chooseDate(sources, frontmatter[fm.createdAtField], file.gitCreatedAt, file.createdAt, fm.dateFormat);
        const modifiedAt = chooseDate(sources, frontmatter[fm.updatedAtField], file.gitModifiedAt, file.modifiedAt, fm.dateFormat);

        let publishedAt: Date | undefined;
        if (fm.publishedField) {
          const pubVal = publicationOverride(frontmatter, fm.publishedField);
          if (pubVal === true) {
            publishedAt = createdAt;
          } else if (pubVal && pubVal !== false && pubVal !== "") {
            publishedAt =
              normalizeDateTime(pubVal, fm.dateFormat) ?? undefined;
          }
        }

        const wc = countWords(file.content);

        const links: IndexLink[] = (file.rawLinks ?? []).map((rl) => ({
          raw: rl.raw,
          href: file.linkTargets?.[rl.raw] ?? null,
          section: rl.section,
          label: rl.label,
        }));

        const entry: IndexEntry = {
          slug: file.slug,
          href: routeHref(file.slug, mountPath),
          path: file.path,
          properties: frontmatter,
          page: {
            toc: frontmatter.enableToc !== false && frontmatter.toc !== false,
            comments: frontmatter.comments !== false,
          },
          title,
          tags,
          aliases,
          description,
          content: plainTextContent,
          links,
          toc: file.toc ?? [],
          wordCount: wc,
          readingTimeMinutes: Math.ceil(wc / 200) || 1,
          createdAt,
          modifiedAt,
          publishedAt,
        };

        if (file.protection) {
          const groupEntries = protectedEntries.get(file.protection.group) ?? [];
          groupEntries.push(entry);
          protectedEntries.set(file.protection.group, groupEntries);
          if (!file.protection.hidden) {
            entries.push({
              slug: file.slug,
              href: entry.href,
              path: "",
              properties: {},
              page: { toc: false, comments: false },
              title,
              locked: true,
              tags: [],
              aliases: [],
              content: "",
              links: [],
              toc: [],
              wordCount: 0,
              readingTimeMinutes: 0,
            });
          }
          noteRouteSet.add(entry.href);
          if (file.protection.hidden) continue;
        } else {
          entries.push(entry);
        }

        if (!file.protection) search.push({
          id: file.slug,
          slug: file.slug,
          href: routeHref(file.slug, mountPath),
          title,
          description,
          content: plainTextContent,
          tags,
          aliases,
        });

        for (const tag of file.protection ? [] : tags) {
          tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
        }

        if (!file.protection?.hidden) {
          for (const folderSlug of folderSlugsFromPath(file.path)) {
            const members = folderMembers.get(folderSlug) ?? [];
            members.push(file.slug);
            folderMembers.set(folderSlug, members);
          }
        }

        noteRouteSet.add(routeHref(file.slug, mountPath));
      }

      ctx.meta.set("svartz:protectedEntries", protectedEntries);

      entries.sort((a, b) => a.slug.localeCompare(b.slug));
      search.sort((a, b) => a.slug.localeCompare(b.slug));

      const graph: Record<string, readonly string[]> = {};
      const backlinks: Record<string, string[]> = {};

      for (const entry of entries) {
        backlinks[entry.slug] = [];
      }

      const publicSlugs = new Set(ctx.files
        .filter((file) => isMarkdownFile(file.extension) && !file.protection)
        .map((file) => file.slug));
      for (const file of ctx.files) {
        if (!isMarkdownFile(file.extension) || file.protection) continue;
        const resolvedLinks = (file.links ?? []).filter((target) => publicSlugs.has(target));
        graph[file.slug] = [...resolvedLinks].sort();

        for (const target of resolvedLinks) {
          if (!backlinks[target]) {
            backlinks[target] = [];
          }
          backlinks[target].push(file.slug);
        }
      }

      for (const slug of Object.keys(backlinks)) {
        backlinks[slug]!.sort();
      }

      const sortedBacklinks: Record<string, readonly string[]> = {};
      for (const slug of Object.keys(backlinks).sort()) {
        sortedBacklinks[slug] = backlinks[slug]!;
      }

      const sortedGraph: Record<string, readonly string[]> = {};
      for (const slug of Object.keys(graph).sort()) {
        sortedGraph[slug] = graph[slug]!;
      }

      const tags: TagIndexEntry[] = [...tagCounts.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([slug, noteCount]) => ({
          slug,
          title: slug,
          noteCount,
          href: routeHref(`${routeConfig.tags}/${slug}`, mountPath),
        }));

      const folders: FolderIndexEntry[] = [...folderMembers.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([slug, noteSlugs]) => ({
          slug,
          title: folderTitle(slug),
          noteCount: noteSlugs.length,
          noteSlugs: noteSlugs.sort(),
          href: routeHref(`${routeConfig.folders}/${slug}`, mountPath),
        }));

      const tagsRoot = routeHref(routeConfig.tags, mountPath);
      const foldersRoot = routeHref(routeConfig.folders, mountPath);
      const feedRoot = routeHref(routeConfig.feed, mountPath);
      const home = routeHref("index", mountPath);
      const isManualRoute = (href: string) =>
        reservedPaths.has(href.slice(mountPath.length).replace(/^\/+|\/+$/g, ""));
      const themeRoutes = staticThemeRoutes(ctx.meta.get("svartz:theme") as SvartzTheme | undefined, mountPath)
        .filter((href) => !isManualRoute(href));
      const naturalFolderRoutes = folders
        .map((folder) => routeHref(folder.slug, mountPath))
        .filter((href) => !isManualRoute(href));
      const tagRoutes = [tagsRoot, ...tags.map((entry) => entry.href)].filter((href) => !isManualRoute(href));
      const folderRoutes = [foldersRoot, ...folders.map((entry) => entry.href), ...naturalFolderRoutes]
        .filter((href) => !isManualRoute(href));
      const feedRoutes = entries.length > 0 && !isManualRoute(feedRoot) ? [feedRoot] : [];
      const listingPaths = [home, ...tagRoutes, ...folderRoutes, ...feedRoutes, ...themeRoutes]
        .map((href) => href.slice(mountPath.length).replace(/^\/+|\/+$/g, ""));
      const redirects = allocateRedirects(
        ctx.files.filter((file) => !file.protection), mountPath,
        new Set([...reservedPaths, ...listingPaths]), fm.aliasesField,
      );

      const routes: RouteIndex = {
        mountPath,
        notes: [...noteRouteSet].sort(),
        redirects,
        tags: tagRoutes,
        folders: folderRoutes,
        feed: feedRoutes,
        theme: themeRoutes,
        all: [...new Set([
          ...(!isManualRoute(home) ? [home] : []),
          ...noteRouteSet,
          ...tagRoutes,
          ...folderRoutes,
          ...feedRoutes,
          ...themeRoutes,
          ...Object.keys(redirects),
        ])].sort(),
      };

      const index: Index = {
        version: INDEX_VERSION,
        entries,
        graph: sortedGraph,
        backlinks: sortedBacklinks,
        search,
        tags,
        folders,
        routes,
        assets: assetRecords,
      };

      ctx.index = index;
    },
    options: { fatal: true },
  },
}));

export const INDEX_CONTENT_ID = "core:index" as const;
