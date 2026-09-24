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

/** Returns folder ids that must be open so the given slug is visible in the explorer. */
export function ancestorFolderIdsForSlug(slug: string | undefined): string[] {
	if (!slug || slug === 'index') return [];
	const segments = slug.split('/').filter(Boolean);
	if (segments[segments.length - 1] === 'index') segments.pop();
	const ids: string[] = [];
	let path = '';
	for (let i = 0; i < segments.length - 1; i += 1) {
		path = path ? `${path}/${segments[i]}` : (segments[i] ?? '');
		ids.push(`folder:${path}`);
	}
	return ids;
}

/**
 * Home, each ancestor folder, then the note. A folder crumb uses its `index` note
 * when one exists, then its generated folder page.
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
	if (segments.at(-1) === 'index') segments.pop();
	const bySlug = new Map(entries.map((entry) => [entry.slug, entry]));
	const rootHref = homeHref.endsWith('/') ? homeHref : `${homeHref}/`;
	let current = '';

	segments.forEach((segment, position) => {
		current = current ? `${current}/${segment}` : segment;
		const isLast = position === segments.length - 1;
		const note = bySlug.get(current) ?? bySlug.get(`${current}/index`);
		const folder = folders.find((candidate) => candidate.slug === current);
		const target = isLast ? (note ?? folder) : (bySlug.get(`${current}/index`) ?? folder ?? note);
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
 * from its `index` note when one exists, otherwise from its generated folder page.
 */
export function buildExplorerTree(
	entries: readonly UiIndexEntry[],
	folders: readonly UiFolderEntry[] = []
): readonly ExplorerNode[] {
	const roots: ExplorerNode[] = [];
	const folderMap = new Map<string, ExplorerNode>();
	const folderIndexes = new Map(
		entries.filter((entry) => entry.slug.endsWith('/index')).map((entry) => [entry.slug.slice(0, -'/index'.length), entry])
	);

	const folderFor = (slug: string, segment: string): ExplorerNode => {
		const existing = folderMap.get(slug);
		if (existing) return existing;
		const landing = folderIndexes.get(slug);
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
		if (entry.slug === 'index') continue;
		const segments = entry.slug.split('/');
		const isFolderIndex = segments.at(-1) === 'index';

		let siblings = roots;
		let parentSlug = '';
		for (const segment of segments.slice(0, -1)) {
			parentSlug = parentSlug ? `${parentSlug}/${segment}` : segment;
			const known = folderMap.has(parentSlug);
			const folder = folderFor(parentSlug, segment);
			if (!known) siblings.push(folder);
			siblings = folder.children as ExplorerNode[];
		}

		if (isFolderIndex) continue;
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
