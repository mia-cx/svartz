export interface UiIndexEntry {
	readonly slug: string;
	readonly href?: string;
	readonly path?: string;
	readonly title: string;
}

export interface UiFolderEntry {
	readonly slug: string;
	readonly title: string;
	readonly noteCount: number;
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

/**
 * Folder ids to open so the given slug is visible in the explorer: every ancestor,
 * plus the slug's own folder when it's a folder note (`guides`) or folder page.
 */
export function ancestorFolderIdsForSlug(slug: string | undefined): string[] {
	if (!slug || slug === 'index') return [];
	const segments = slug.split('/').filter(Boolean);
	const ids: string[] = [];
	let path = '';
	for (let i = 0; i < segments.length; i += 1) {
		path = path ? `${path}/${segments[i]}` : (segments[i] ?? '');
		ids.push(`folder:${path}`);
	}
	return ids;
}

/**
 * Home, each ancestor folder, then the note. A folder crumb uses its folder note
 * (`guides/index.md`, published as `guides`) when one exists, then its folder page.
 */
export function buildBreadcrumbs(
	slug: string | undefined,
	entries: readonly UiIndexEntry[] = [],
	homeHref = '/',
	folders: readonly (Pick<UiFolderEntry, 'slug' | 'href'> & Partial<Pick<UiFolderEntry, 'title'>>)[] = []
): Breadcrumb[] {
	const breadcrumbs: Breadcrumb[] = [{ title: 'Home', href: homeHref }];
	if (!slug || slug === 'index') return breadcrumbs;

	const segments = slug.split('/');
	const bySlug = new Map(entries.map((entry) => [entry.slug, entry]));
	const rootHref = homeHref.endsWith('/') ? homeHref : `${homeHref}/`;
	let current = '';

	segments.forEach((segment) => {
		current = current ? `${current}/${segment}` : segment;
		const target = bySlug.get(current) ?? folders.find((candidate) => candidate.slug === current);
		breadcrumbs.push({
			title: target?.title ?? titleFromSlugSegment(segment),
			href: target?.href ?? `${rootHref}${current}/`
		});
	});

	return breadcrumbs;
}

function createFolderNode(id: string, title: string, href: string): ExplorerNode {
	return {
		id,
		title,
		href,
		children: [],
		isFolder: true
	};
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
 * note is left out (the site title links home). A folder takes its title and link
 * from its folder note (`guides/index.md`, published as `guides`) when one exists,
 * otherwise from its generated folder page.
 */
export function buildExplorerTree(
	entries: readonly UiIndexEntry[],
	folders: readonly UiFolderEntry[] = []
): readonly ExplorerNode[] {
	const roots: ExplorerNode[] = [];
	const folderMap = new Map<string, ExplorerNode>();
	const bySlug = new Map(entries.map((entry) => [entry.slug, entry]));
	const parentSlugs = new Set(
		entries.flatMap((entry) => {
			const segments = entry.slug.split('/');
			return segments.slice(1).map((_, depth) => segments.slice(0, depth + 1).join('/'));
		})
	);

	const folderFor = (slug: string, segment: string): ExplorerNode => {
		const existing = folderMap.get(slug);
		if (existing) return existing;
		const landing = bySlug.get(slug);
		const generated = folders.find((folder) => folder.slug === slug);
		const node = createFolderNode(
			`folder:${slug}`,
			landing?.title ?? generated?.title ?? titleFromSlugSegment(segment),
			landing?.href ?? generated?.href ?? `/folders/${slug}/`
		);
		folderMap.set(slug, node);
		return node;
	};

	for (const entry of entries) {
		// The home note and folder notes don't list as notes.
		if (entry.slug === 'index' || parentSlugs.has(entry.slug)) continue;
		const segments = entry.slug.split('/');

		let siblings = roots;
		let parentSlug = '';
		for (const segment of segments.slice(0, -1)) {
			parentSlug = parentSlug ? `${parentSlug}/${segment}` : segment;
			const known = folderMap.has(parentSlug);
			const folder = folderFor(parentSlug, segment);
			if (!known) siblings.push(folder);
			siblings = folder.children as ExplorerNode[];
		}

		siblings.push({
			id: `note:${entry.slug}`,
			title: entry.title,
			href: entry.href ?? slugToHref(entry.slug),
			children: [],
			isFolder: false
		});
	}

	return sortExplorerNodes(roots);
}
