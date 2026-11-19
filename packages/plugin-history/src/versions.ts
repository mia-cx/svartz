/**
 * `history({ source: "git" })`'s build step: each published note that sets `versions: true` gets the list of its
 * versions at `<note>/versions/` and a page per version at `<note>/versions/<short sha>/`, read from the vault's own
 * git repository and prerendered like notes.
 *
 * The pages are page artifacts and routes the build adds after indexing, never files in the pipeline, so search, the
 * explorer, the graph, tags, backlinks, feeds and sitemaps never see them, and the theme renders each in its shell as
 * it renders a listing: the body as the page, without a note around it.
 *
 * A version shows only when the build would have published it unprotected at the path it had then. Diffs run between
 * consecutive shown versions, so nothing of a hidden one shows, not even as the "before" of the next.
 */
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { matchThemeRoute, type IndexEntry, type PluginContext, type SvartzTheme } from "@svartz/core";
import { renderRevision } from "@svartz/plugin-submissions/render";
import { publishedAttachments, publishesNote, sharedAttachmentNames } from "@svartz/plugins";
import type { PreviewNote, PreviewOptions } from "@svartz/plugins/preview";
import { alternateNames, extractFrontmatter } from "@svartz/plugins/routes";
import { diffLines } from "./diff";
import { commitsOf, filesChanged, readFiles, repositoryOf, type Commit, type Repository } from "./git";
import { versionPage, versionsPage, type Version, type VersionsPage } from "./versions-pages";

/** The frontmatter field a note sets to `true` to publish its previous versions. */
export const VERSIONS_FIELD = "versions";
/** How many versions of a note are listed, newest first, unless `maxVersions` says otherwise. */
export const DEFAULT_MAX_VERSIONS = 50;
/** Commits whose files one `git cat-file` reads at a time, while looking for versions that may show. */
const READ_BATCH = 64;
/** The shortest commit prefix a version's URL uses. */
const SHORT_SHA = 7;

function fail(message: string): never {
  throw new Error(`[history] ${message}`);
}

/** A version that may show: the commit, the file's text after it, and the file's path in the vault then. */
interface Shown {
  readonly commit: Commit;
  readonly markdown: string;
  readonly path: string;
}

/** Whether the build would publish `markdown` at `path` in the vault, unprotected. Unreadable frontmatter hides it. */
function isPublic(ctx: PluginContext, path: string, markdown: string): boolean {
  if (!/\.md$/i.test(path)) return false;
  try {
    const { frontmatter } = extractFrontmatter(markdown);
    return publishesNote(ctx.config, path, frontmatter) && frontmatter?.password_group === undefined;
  } catch {
    return false;
  }
}

/**
 * The newest `limit` versions of the note at `path` in the vault that may show, newest first: git follows it back
 * through renames, and a version shows only where {@link isPublic} holds for it.
 */
async function shownVersions(ctx: PluginContext, repository: Repository, path: string, limit: number): Promise<Shown[]> {
  const commits = await commitsOf(repository.root, `${repository.prefix}${path}`);
  const shown: Shown[] = [];
  for (let start = 0; start < commits.length && shown.length < limit; start += READ_BATCH) {
    // A version outside the vault's folder was never the vault's to publish.
    const batch = commits.slice(start, start + READ_BATCH).flatMap((commit) => {
      const inVault = commit.path?.startsWith(repository.prefix) && !commit.path.includes("\n") ? commit.path.slice(repository.prefix.length) : undefined;
      return inVault === undefined ? [] : [{ commit, path: inVault }];
    });
    const files = await readFiles(repository.root, batch.map(({ commit }) => `${commit.sha}:${commit.path}`));
    batch.forEach(({ commit, path: at }, index) => {
      const markdown = files[index];
      if (markdown !== undefined && isPublic(ctx, at, markdown)) shown.push({ commit, markdown, path: at });
    });
  }
  return shown.slice(0, limit);
}

/** The shortest prefix, from {@link SHORT_SHA} characters, that tells every one of `shas` apart. */
function shortLength(shas: readonly string[]): number {
  let length = SHORT_SHA;
  while (new Set(shas.map((sha) => sha.slice(0, length))).size < shas.length) length++;
  return length;
}

/** `../` for each segment of `pathname`, which ends in a slash: from that page back to the deployment base. */
const upFrom = (pathname: string) => "../".repeat(pathname.split("/").length - 2);

/** A generated page as a Svelte component: its `<title>`, kept out of search engines, and its HTML. */
const component = (page: VersionsPage, site: string) => [
  "<svelte:head>",
  `\t<title>{${JSON.stringify(`${page.title} | ${site}`)}}</title>`,
  '\t<meta name="robots" content="noindex" />',
  "</svelte:head>",
  "",
  `{@html ${JSON.stringify(page.html)}}`,
  "",
].join("\n");

/**
 * Adds the version pages of every published note that sets `versions: true` and has at least two versions that
 * show, as page artifacts and routes. Answers the routes of those notes, which link their versions. Fails the build
 * when the vault isn't in a git repository with its whole history, or a version page's address is taken.
 */
export async function emitVersions(ctx: PluginContext, maxVersions: number): Promise<string[]> {
  const index = ctx.index;
  if (!index) return [];
  const vault = ctx.config.id;
  const frontmatter = new Map(ctx.files.map((file) => [file.slug, file.frontmatter]));
  const unlocked = index.entries.filter((entry) => !entry.locked);
  const opted = unlocked.filter((entry) => /\.md$/i.test(entry.path) && frontmatter.get(entry.slug)?.[VERSIONS_FIELD] === true);
  if (opted.length === 0) return [];

  const repository = await repositoryOf(ctx.config.path);
  if (!repository) fail(`vault "${vault}" shows previous versions, but ${ctx.config.path} isn't in a git repository`);
  if (repository.shallow) {
    fail(`vault "${vault}" shows previous versions, but its repository is a shallow clone without the history they come from. Fetch the full history: with actions/checkout, set fetch-depth: 0`);
  }

  const mountPath = ctx.config.mountPath ?? "";
  const notes: PreviewNote[] = unlocked.map((entry) => {
    const aliases = alternateNames(frontmatter.get(entry.slug), ctx.config.frontmatter.aliasesField);
    return { slug: entry.slug, path: entry.path.replaceAll("\\", "/"), href: entry.href, title: entry.title, ...(aliases.length ? { aliases } : {}) };
  });
  const attachments = publishedAttachments(ctx).map((file) => file.path.replaceAll("\\", "/"));
  // Revisions render with links from a placeholder base, then each page makes them relative to itself, since the
  // deployment base is only known to SvelteKit.
  const base = `/svartz-base-${randomUUID()}`;
  const preview: Omit<PreviewOptions, "path"> = {
    notes,
    base,
    mountPath,
    linkResolution: ctx.config.linkResolution,
    // Inline `#tags` link under the theme's tags route, as core:transform-ofm links them.
    tagsRoute: (ctx.config.theme.routes as { tags?: string } | undefined)?.tags ?? "tags",
    attachments,
    sharedNames: sharedAttachmentNames(ctx),
  };
  const published = new Set([...notes.map(({ path }) => path), ...attachments]);
  const taken = new Set([...index.routes.all, ...ctx.files.map((file) => `/${file.slug}/`)]);
  const theme = ctx.meta.get("svartz:theme") as SvartzTheme | undefined;
  const site = ctx.config.site.title;

  const routes: string[] = [];
  const add = (pathname: string, page: VersionsPage, note: IndexEntry) => {
    // The theme finds a page's component by its path below the vault's mount, as it finds a note's.
    const below = mountPath && pathname.startsWith(`${mountPath}/`) ? pathname.slice(mountPath.length) : pathname;
    const slug = below.replace(/^\/+|\/+$/g, "");
    const route = theme && matchThemeRoute(theme.routes, { pathname: below, slug });
    if (taken.has(pathname) || taken.has(`/${slug}/`) || (theme && (!route || route.route.component))) {
      fail(`"${note.path}" in vault "${vault}" shows previous versions at ${pathname}, but another page has that address`);
    }
    const key = `pages/${slug}.svelte`;
    ctx.artifacts.set(key, {
      key,
      path: resolve(ctx.config.outDir, "..", "artifacts", key),
      type: "svelte",
      pluginId: "history",
      contents: component(page, site),
    });
    routes.push(pathname);
  };

  const linked: string[] = [];
  for (const note of opted) {
    // One more than are listed: the oldest listed version's diff starts from the version before it.
    const shown = await shownVersions(ctx, repository, note.path.replaceAll("\\", "/"), maxVersions + 1);
    if (shown.length < 2) continue;
    const listed = shown.slice(0, maxVersions);
    const changed = await filesChanged(repository.root, shown.map(({ commit }) => commit.sha));
    // A summary can name what the site keeps back, so it shows only when every vault file its commit changed is
    // public: published now, or a path this note had in a version that shows, as a rename's commit changes.
    const paths = new Set(shown.map(({ path }) => path));
    const summary = ({ commit }: Shown) => {
      const files = changed.get(commit.sha);
      const known = files?.every((file) => {
        const path = file.slice(repository.prefix.length);
        return !file.startsWith(repository.prefix) || published.has(path) || paths.has(path);
      });
      return known && commit.summary ? commit.summary : undefined;
    };
    const length = shortLength(listed.map(({ commit }) => commit.sha));
    const short = ({ commit }: Shown) => commit.sha.slice(0, length);
    const describe = (version: Shown, href?: string): Version =>
      ({ at: version.commit.at, author: version.commit.author, summary: summary(version), ...(href ? { href } : {}) });

    const list = `${note.href}versions/`;
    add(list, versionsPage({
      title: note.title,
      note: "../",
      versions: listed.map((version) => describe(version, `${short(version)}/`)),
      ...(shown.length > maxVersions ? { max: maxVersions } : {}),
    }), note);
    for (const [position, version] of listed.entries()) {
      const pathname = `${list}${short(version)}/`;
      const before = shown[position + 1];
      const newer = listed[position - 1];
      const older = listed[position + 1];
      const rendered = await renderRevision(version.markdown, { ...preview, path: version.path });
      const page = versionPage({
        title: note.title,
        version: describe(version),
        // The version before the oldest listed one has no page.
        before: before && describe(before, older && `../${short(older)}/`),
        hunks: diffLines(before?.markdown ?? "", version.markdown),
        rendered: rendered.replaceAll(`${base}/`, upFrom(pathname)),
        links: { note: "../../", versions: "../", ...(newer ? { newer: `../${short(newer)}/` } : {}), ...(older ? { older: `../${short(older)}/` } : {}) },
      });
      add(pathname, page, note);
    }
    linked.push(note.href);
  }

  ctx.index = { ...index, routes: { ...index.routes, all: [...new Set([...index.routes.all, ...routes])].sort() } };
  return linked;
}
