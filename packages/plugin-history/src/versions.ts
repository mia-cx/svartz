/**
 * `history({ source: "git" })`'s build step: each published note that sets `versions: true` gets the list of its
 * versions at `<note>/versions/` and a page per version at `<note>/versions/<short sha>/`, read from the vault's own
 * git repository and prerendered like notes.
 *
 * The pages are page artifacts and routes the build adds after indexing, never files in the pipeline, so search, the
 * explorer, the graph, tags, backlinks, feeds and sitemaps never see them, and the theme renders each in its shell as
 * it renders a listing: the body as the page, without a note around it. A version's body compiles as the note does,
 * through the vault's own steps (`compileNoteVersion`), and the attachments it references are published with it. A
 * compiled version is cached (`cache.ts`), so a later build compiles only versions that are new or whose inputs changed.
 *
 * A version shows only when the build would have published it unprotected at the path it had then. Diffs run between
 * consecutive shown versions, so nothing of a hidden one shows, not even as the "before" of the next.
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { getCompilerContributions, matchThemeRoute, PluginAggregateError, type IndexEntry, type PluginContext, type ProcessedFile, type SvartzTheme } from "@svartz/core";
import { buildFingerprint, fileFingerprints, mayEmbed, VersionCache, versionKey } from "./cache";
import { compileNoteVersion, keepsAttachment, publishedAttachments, publishesNote } from "@svartz/plugins";
import { extractFrontmatter } from "@svartz/plugins/routes";
import { diffLines } from "./diff";
import { commitsOf, filesAt, filesChanged, readFiles, repositoryOf, type Commit, type Repository } from "./git";
import { versionPage, versionsPage, type Version, type VersionsPage } from "./versions-pages";

/** The frontmatter field a note sets to `true` to publish its previous versions. */
export const VERSIONS_FIELD = "versions";
/** How many versions of a note are listed, newest first, unless `maxVersions` says otherwise. */
export const DEFAULT_MAX_VERSIONS = 50;
/** Where the plugin keeps, in `ctx.meta`, every attachment discovery found, before publication filtering drops some. */
export const DISCOVERED = "history:attachments";
/** Commits whose files one `git cat-file` reads at a time, while looking for versions that may show. */
const READ_BATCH = 64;
/** The shortest commit prefix a version's URL uses. */
const SHORT_SHA = 7;
/** The characters of a blob's id that name a deleted attachment's snapshot below a note's versions. */
const BLOB_ID = 12;
/** From a version's page back to its note's: `<note>versions/<sha>/`. */
const TO_NOTE = "../../";
/** Where a version's body goes in its page's HTML. The page escapes every `<` it is given, so only this can be it. */
const BODY = "<!--svartz:version-body-->";
const NOTE_FILE = /\.(?:md|mdx|svx)$/i;

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
    const { frontmatter, bodyMarkdown } = extractFrontmatter(markdown);
    // A block that was there but read as nothing: the build refuses such a note, so the version can't say it's public.
    if (frontmatter === undefined && bodyMarkdown !== markdown) return false;
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
      const markdown = files[index]?.toString("utf8");
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

/** Our own HTML as Svelte markup: braces would start expressions. */
const literal = (html: string) => html.replaceAll("{", "&#123;").replaceAll("}", "&#125;");

/**
 * A generated page as a Svelte component, as the build writes a note's: its `<title>`, kept out of search engines,
 * and its HTML, with `body`, a version's compiled Markdown, where {@link BODY} marks it.
 */
function component(page: VersionsPage, site: string, body = ""): string {
  const [before = "", after = ""] = page.html.split(BODY);
  return [
    "<script>",
    "\tlet { contentComponents } = $props();",
    "</script>",
    "",
    "<svelte:head>",
    `\t<title>{${JSON.stringify(`${page.title} | ${site}`)}}</title>`,
    '\t<meta name="robots" content="noindex" />',
    "</svelte:head>",
    "",
    `${literal(before)}${body}${literal(after)}`,
    "",
  ].join("\n");
}

/**
 * Adds the version pages of every published note that sets `versions: true` and has at least two versions that
 * show, as page artifacts and routes, and the attachments those versions reference that the build doesn't publish
 * already. Answers the routes of those notes, which link their versions. Fails the build when the vault isn't in a
 * git repository with its whole history, or a version page's address is taken.
 *
 * Every exit of a build that walked every note prunes the cache to the versions it used, so it holds only versions
 * that show. A build that fails part way leaves it as it is: it never reached the versions it would have reused, and
 * removing them would only make the next build compile them again. What it keeps of a version hidden since is never
 * served, since visibility is decided before the cache is read, and was published once from the history the build
 * reads anyway.
 */
export async function emitVersions(ctx: PluginContext, maxVersions: number): Promise<string[]> {
  const cache = VersionCache.for(ctx);
  let walked = false;
  try {
    const linked = await buildVersions(ctx, maxVersions, cache);
    walked = true;
    return linked;
  } finally {
    if (walked) await cache.prune();
  }
}

async function buildVersions(ctx: PluginContext, maxVersions: number, cache: VersionCache): Promise<string[]> {
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
  const notePaths = unlocked.map((entry) => entry.path.replaceAll("\\", "/"));
  const published = new Set([...notePaths, ...publishedAttachments(ctx).map((file) => file.path.replaceAll("\\", "/"))]);
  // Every attachment the vault holds now that its rules let through, published or not: an earlier version may use one.
  const inTree = ((ctx.meta.get(DISCOVERED) as readonly ProcessedFile[] | undefined) ?? [])
    .filter((file) => keepsAttachment(ctx.config, file.path));
  const inTreePaths = new Set(inTree.map(({ path }) => path.replaceAll("\\", "/")));
  // Every page and file the site publishes, below the deployment base: a version's link to anything else shows
  // unresolved. Attachments, and files such as feeds that steps before this one emitted, serve at `<mount>/<path>`.
  const urls = new Set([
    ...index.routes.all,
    ...[...published].filter((path) => !NOTE_FILE.test(path)).map((path) => `${mountPath}/${path}`),
    ...[...ctx.artifacts.keys()].filter((key) => key.startsWith("assets/")).map((key) => `${mountPath}/${key.slice("assets/".length)}`),
  ]);
  // What every version's compile reads besides the published files, which each key adds per note: everything here
  // goes in the key, so a version compiles again when any of it changes.
  const build = await buildFingerprint(ctx, { urls: [...urls].sort(), attachments: [...inTreePaths].sort(), prefix: TO_NOTE, blobId: BLOB_ID });
  const files = fileFingerprints(ctx);
  const resources = getCompilerContributions(ctx).browserResources;
  /** Versions compiled now, and versions reused from the cache. */
  const counts = { compiled: 0, reused: 0 };
  /** Attachments still in the vault that version pages reference, by vault path, and where to read each. */
  const fromTree = new Map<string, string>();
  /** Attachments gone from the vault that version pages reference, by the artifact key each publishes at, and the blob to read. */
  const fromGit = new Map<string, string>();

  const taken = new Set([...index.routes.all, ...ctx.files.map((file) => `/${file.slug}/`)]);
  const theme = ctx.meta.get("svartz:theme") as SvartzTheme | undefined;
  const site = ctx.config.site.title;
  const routes: string[] = [];
  const add = (pathname: string, page: VersionsPage, note: IndexEntry, body?: string) => {
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
      contents: component(page, site, body),
    });
    routes.push(pathname);
  };

  /**
   * What `version` of the note listing its versions at `list` may reference beyond what the build publishes: the
   * attachments in the tree now, and those only its commit had. Those are gone from the vault, and may have had other
   * contents in other versions, so each is published by its blob below the listing, at
   * `<list>files/<blob>/<name>`: versions that held the same bytes share it, and no version shows another's.
   */
  const candidatesAt = async ({ commit }: Shown, list: string) => {
    const gone = (await filesAt(repository.root, commit.sha, repository.prefix))
      .map(({ path, blob }) => ({ path: path.slice(repository.prefix.length), blob }))
      .filter(({ path }) => !NOTE_FILE.test(path) && !inTreePaths.has(path) && keepsAttachment(ctx.config, path));
    const files: ProcessedFile[] = [...inTree, ...gone.map(({ path }) => ({ path, slug: path, content: "" }))];
    const snapshots = new Map(gone.map(({ path, blob }) => {
      const at = `files/${blob.slice(0, BLOB_ID)}/${encodeURIComponent(path.slice(path.lastIndexOf("/") + 1))}`;
      // The listing is below the mount, and an attachment artifact is served at `<mount>/<key below assets/>`.
      return [path, { blob, url: `../${at}`, key: `assets${list.slice(mountPath.length)}${decodeURIComponent(at)}` }] as const;
    }));
    return { files, snapshots };
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
      const before = shown[position + 1];
      const newer = listed[position - 1];
      const older = listed[position + 1];
      const key = versionKey(build, files, { slug: note.slug, path: note.path, href: note.href }, {
        sha: version.commit.sha,
        path: version.path,
        embeds: mayEmbed(version.markdown),
      });
      let compiled = await cache.get(key);
      if (compiled) {
        counts.reused++;
        for (const resource of compiled.resources) if (!resources.has(resource.id)) resources.set(resource.id, resource);
      } else {
        counts.compiled++;
        const candidates = await candidatesAt(version, list);
        try {
          const fresh = await compileNoteVersion(ctx, note, version, {
            attachments: candidates.files,
            prefix: TO_NOTE,
            published: (path) => urls.has(path),
            moved: new Map([...candidates.snapshots].map(([path, { url }]) => [path, url])),
          });
          compiled = {
            markup: fresh.markup,
            attachments: fresh.attachments.map((path) => {
              const snapshot = candidates.snapshots.get(path);
              return snapshot ? { path, snapshot: { key: snapshot.key, blob: snapshot.blob } } : { path };
            }),
            resources: fresh.resources,
          };
          await cache.set(key, compiled);
        } catch (error) {
          const where = `the version of "${note.path}" in vault "${vault}" at ${version.commit.sha}`;
          // An old version can't be edited to fix what a plugin couldn't read in it: its page shows its changes without
          // the rendered page, and the build goes on. A fatal error still stops the build, as it does for a note. It
          // isn't cached, so the next build tries again.
          if (!(error instanceof PluginAggregateError) || error.errors.some(({ fatal }) => fatal)) {
            throw new Error(`[history] couldn't build ${where}`, { cause: error });
          }
          console.warn(`[history] showing ${where} without its rendered page: ${error.errors.map(({ message }) => message).join("; ")}`);
        }
      }
      for (const { path, snapshot } of compiled?.attachments ?? []) {
        const sourcePath = inTree.find((file) => file.path === path)?.sourcePath;
        if (snapshot) fromGit.set(snapshot.key, snapshot.blob);
        else if (sourcePath) fromTree.set(path, sourcePath);
      }
      const page = versionPage({
        title: note.title,
        version: describe(version),
        // The version before the oldest listed one has no page.
        before: before && describe(before, older && `../${short(older)}/`),
        hunks: diffLines(before?.markdown ?? "", version.markdown),
        rendered: compiled ? BODY : undefined,
        links: { note: TO_NOTE, versions: "../", ...(newer ? { newer: `../${short(newer)}/` } : {}), ...(older ? { older: `../${short(older)}/` } : {}) },
      });
      add(`${list}${short(version)}/`, page, note, compiled?.markup);
    }
    linked.push(note.href);
  }

  // Published as the build publishes an attachment: the artifact `assets/<path>` is served at `<mount>/<path>`.
  const asset = (key: string, contents: Buffer | undefined) => {
    if (contents) ctx.artifacts.set(key, { key, path: resolve(ctx.config.outDir, "..", "artifacts", key), type: "asset", pluginId: "history", contents });
  };
  for (const [path, sourcePath] of fromTree) asset(`assets/${path}`, await readFile(sourcePath));
  const snapshots = [...fromGit];
  const bytes = await readFiles(repository.root, snapshots.map(([, blob]) => blob));
  snapshots.forEach(([key], index) => asset(key, bytes[index]));

  console.info(`[history] vault "${vault}": compiled ${counts.compiled} ${counts.compiled === 1 ? "version" : "versions"}, reused ${counts.reused} from the cache`);
  ctx.index = { ...index, routes: { ...index.routes, all: [...new Set([...index.routes.all, ...routes])].sort() } };
  return linked;
}
