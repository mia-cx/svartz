export interface UiIndexEntry {
	readonly slug: string;
	readonly href?: string;
	/** Vault-relative source path. Finds a folder's `index.md` whatever slug it published under. */
	readonly path?: string;
	readonly title: string;
}

export interface UiFolderEntry {
	readonly slug: string;
	/** The folder note's frontmatter title, else one generated from the folder name. */
	readonly title: string;
	readonly noteCount: number;
	/** Final slugs of the published notes physically inside the folder, nested ones included. */
	readonly noteSlugs: readonly string[];
	readonly href: string;
}

export interface UiTagEntry {
	readonly slug: string;
	readonly title: string;
	readonly noteCount: number;
	readonly href: string;
}

export interface ExplorerNode {
	readonly id: string;
	readonly title: string;
	readonly href: string;
	readonly children: readonly ExplorerNode[];
	readonly isFolder: boolean;
}

export interface Breadcrumb {
	readonly title: string;
	readonly href: string;
}

export function slugToHref(slug: string): string {
	return slug === 'index' ? '/' : `/${slug}/`;
}

export function titleFromSlugSegment(segment: string): string {
	return segment.replace(/[-_]/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

const INDEX_FILE = /(?:^|[\\/])index\.[^\\/]+$/i;

/** The folder holding `folder`, or `undefined` at the vault root. */
const parentFolder = (folder: string) => (folder.includes('/') ? folder.slice(0, folder.lastIndexOf('/')) : undefined);

export interface FolderLayout<T> {
	/** The folder the note's file sits in, or `undefined` at the vault root. */
	folderOf(slug: string): string | undefined;
	/** The folder's own note, its `index.md`. */
	noteOf(folder: string): T | undefined;
}

/**
 * Where each note's file sits, read from the index's folder records. Slugs can't
 * tell: when two files want one URL, one gets a suffix (`guides/index.md` may
 * publish as `guides-2`), and a root `guides.md` may hold the folder's slug.
 */
export function folderLayout<T extends UiIndexEntry>(
	entries: readonly T[],
	folders: readonly Pick<UiFolderEntry, 'slug' | 'noteSlugs'>[]
): FolderLayout<T> {
	const homes = new Map<string, string>();
	for (const folder of folders) {
		for (const slug of folder.noteSlugs) {
			// Every ancestor lists the note too; the longest slug is the folder it sits in.
			if (folder.slug.length > (homes.get(slug)?.length ?? -1)) homes.set(slug, folder.slug);
		}
	}
	const notes = new Map<string, T>();
	for (const entry of entries) {
		const folder = homes.get(entry.slug);
		// Locked notes publish without a path, so only their slug can place them.
		const isIndex = entry.path ? INDEX_FILE.test(entry.path) : entry.slug === folder;
		if (folder !== undefined && isIndex) notes.set(folder, entry);
	}
	return { folderOf: (slug) => homes.get(slug), noteOf: (folder) => notes.get(folder) };
}

/** Folder ids to open so `folder` shows in the explorer: it and every folder above it. */
export function openFolderIds(folder: string | undefined): string[] {
	const ids: string[] = [];
	for (let current = folder; current !== undefined; current = parentFolder(current)) ids.unshift(`folder:${current}`);
	return ids;
}

type CrumbFolder = Pick<UiFolderEntry, 'slug' | 'title' | 'href' | 'noteSlugs'>;

/** A crumb per folder down to `folder`, linking its folder note when it has one, else its folder page. */
function folderTrail(
	folder: string | undefined,
	layout: FolderLayout<UiIndexEntry>,
	folders: readonly CrumbFolder[],
	rootHref: string
): Breadcrumb[] {
	return openFolderIds(folder).map((id) => {
		const slug = id.slice('folder:'.length);
		const record = folders.find((candidate) => candidate.slug === slug);
		return {
			title: record?.title ?? titleFromSlugSegment(slug.split('/').at(-1)!),
			href: layout.noteOf(slug)?.href ?? record?.href ?? `${rootHref}${slug}/`
		};
	});
}

const withSlash = (href: string) => (href.endsWith('/') ? href : `${href}/`);

/**
 * Home, each folder the note sits in, then the note. A folder note ends its own
 * folder's trail instead of repeating it. A slug missing from `entries` falls back
 * to its own segments.
 */
export function buildBreadcrumbs(
	slug: string | undefined,
	entries: readonly UiIndexEntry[] = [],
	homeHref = '/',
	folders: readonly CrumbFolder[] = []
): Breadcrumb[] {
	const home = { title: 'Home', href: homeHref };
	if (!slug || slug === 'index') return [home];

	const layout = folderLayout(entries, folders);
	const entry = entries.find((candidate) => candidate.slug === slug);
	const folder = entry ? layout.folderOf(slug) : parentFolder(slug);
	const trail = [home, ...folderTrail(folder, layout, folders, withSlash(homeHref))];
	if (entry && folder !== undefined && layout.noteOf(folder) === entry) return trail;
	return [
		...trail,
		{
			title: entry?.title ?? titleFromSlugSegment(slug.split('/').at(-1)!),
			href: entry?.href ?? `${withSlash(homeHref)}${slug}/`
		}
	];
}

/** Home, then each folder down to `folder` (a folder page's trail). */
export function folderBreadcrumbs(
	folder: string,
	entries: readonly UiIndexEntry[],
	homeHref: string,
	folders: readonly CrumbFolder[]
): Breadcrumb[] {
	const layout = folderLayout(entries, folders);
	return [{ title: 'Home', href: homeHref }, ...folderTrail(folder, layout, folders, withSlash(homeHref))];
}

const naturalOrder = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function sortExplorerNodes(nodes: ExplorerNode[]): ExplorerNode[] {
	return nodes
		.map((node) => ({ ...node, children: sortExplorerNodes([...node.children]) }))
		.sort(
			(left, right) =>
				Number(right.isFolder) - Number(left.isFolder) || naturalOrder.compare(left.title, right.title)
		);
}

/**
 * The vault as a tree: folders first, then notes, each in natural order. The home
 * note is left out (the site title links home). A folder links its folder note
 * (`guides/index.md`) when one exists, otherwise its generated folder page.
 */
export function buildExplorerTree(
	entries: readonly UiIndexEntry[],
	folders: readonly UiFolderEntry[]
): readonly ExplorerNode[] {
	const layout = folderLayout(entries, folders);
	const roots: ExplorerNode[] = [];
	const nodes = new Map<string, ExplorerNode>();
	for (const folder of folders) {
		nodes.set(folder.slug, {
			id: `folder:${folder.slug}`,
			title: folder.title,
			href: layout.noteOf(folder.slug)?.href ?? folder.href,
			children: [],
			isFolder: true
		});
	}
	// Every ancestor of a non-empty folder is in the index too.
	const childrenOf = (folder: string | undefined) =>
		folder === undefined ? roots : (nodes.get(folder)!.children as ExplorerNode[]);

	for (const [slug, node] of nodes) childrenOf(parentFolder(slug)).push(node);
	for (const entry of entries) {
		const folder = layout.folderOf(entry.slug);
		// The home note and folder notes don't list as notes.
		if (entry.slug === 'index' || (folder !== undefined && layout.noteOf(folder) === entry)) continue;
		childrenOf(folder).push({
			id: `note:${entry.slug}`,
			title: entry.title,
			href: entry.href ?? slugToHref(entry.slug),
			children: [],
			isFolder: false
		});
	}

	return sortExplorerNodes(roots);
}
