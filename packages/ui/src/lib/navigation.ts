export interface UiIndexEntry {
  readonly slug: string;
  readonly path: string;
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
  return slug === "index" ? "/" : `/${slug}/`;
}

export function titleFromSlugSegment(segment: string): string {
  return segment
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

/** Returns folder ids that must be open so the given slug is visible in the explorer. */
export function ancestorFolderIdsForSlug(slug: string | undefined): string[] {
	if (!slug || slug === "index") return [];
	const segments = slug.split("/").filter(Boolean);
	if (segments[segments.length - 1] === "index") segments.pop();
	const ids: string[] = [];
	let path = "";
	for (let i = 0; i < segments.length - 1; i += 1) {
		path = path ? `${path}/${segments[i]}` : (segments[i] ?? "");
		ids.push(`folder:${path}`);
	}
	return ids;
}

export function buildBreadcrumbs(slug: string | undefined): Breadcrumb[] {
  if (!slug || slug === "index") {
    return [{ title: "Home", href: "/" }];
  }

  const segments = slug.split("/");
  const breadcrumbs: Breadcrumb[] = [{ title: "Home", href: "/" }];
  let current = "";

  for (const segment of segments) {
    current = current ? `${current}/${segment}` : segment;
    breadcrumbs.push({
      title: titleFromSlugSegment(segment),
      href: slugToHref(current),
    });
  }

  return breadcrumbs;
}

function createFolderNode(id: string, title: string, href: string): ExplorerNode {
  return {
    id,
    title,
    href,
    children: [],
    isFolder: true,
  };
}

export function buildExplorerTree(entries: readonly UiIndexEntry[]): readonly ExplorerNode[] {
  const roots: ExplorerNode[] = [];
  const folderMap = new Map<string, ExplorerNode>();

  for (const entry of [...entries].sort((left, right) => left.slug.localeCompare(right.slug))) {
    const segments = entry.slug.split("/");
    const noteSegments = segments[segments.length - 1] === "index"
      ? segments.slice(0, -1)
      : segments;

    let parentChildren = roots;
    let parentSlug = "";

    for (let index = 0; index < noteSegments.length - 1; index += 1) {
      const segment = noteSegments[index]!;
      parentSlug = parentSlug ? `${parentSlug}/${segment}` : segment;
      let node = folderMap.get(parentSlug);

      if (!node) {
        node = createFolderNode(
          `folder:${parentSlug}`,
          titleFromSlugSegment(segment),
          `/folders/${parentSlug}/`,
        );
        folderMap.set(parentSlug, node);
        parentChildren.push(node);
      }

      parentChildren = node.children as ExplorerNode[];
    }

    const title =
      entry.slug.endsWith("/index") || entry.slug === "index"
        ? titleFromSlugSegment(noteSegments[noteSegments.length - 1] ?? "home")
        : entry.title;
    parentChildren.push({
      id: `note:${entry.slug}`,
      title: entry.slug === "index" ? "Home" : title,
      href: slugToHref(entry.slug),
      children: [],
      isFolder: false,
    });
  }

  return roots;
}
