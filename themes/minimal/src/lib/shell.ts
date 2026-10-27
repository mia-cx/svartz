import type { ExplorerNode, UiIndexEntry } from '@svartz/ui';
import type { ReadingStop } from './extension.js';

/**
 * The folder ids above the page or folder page at `href`, outermost first,
 * ending with that folder itself when `href` is a folder's page.
 */
export function explorerTrail<T extends UiIndexEntry>(tree: readonly ExplorerNode<T>[], href: string): string[] {
	const search = (nodes: readonly ExplorerNode<T>[], trail: readonly string[]): string[] | undefined => {
		for (const node of nodes) {
			if (!node.isFolder) {
				if (node.href === href) return [...trail];
				continue;
			}
			if (node.href === href) return [...trail, node.id];
			const found = search(node.children, [...trail, node.id]);
			if (found) return found;
		}
		return undefined;
	};
	return search(tree, []) ?? [];
}

/** The explorer top to bottom: each folder's page, then what it holds. */
export function readingOrder<T extends UiIndexEntry>(tree: readonly ExplorerNode<T>[]): ReadingStop[] {
	return tree.flatMap((node) => [{ title: node.title, href: node.href }, ...readingOrder(node.children)]);
}

/** The pages before and after `href` in reading order. */
export function adjacentPages(order: readonly ReadingStop[], href: string): { previous?: ReadingStop; next?: ReadingStop } {
	const index = order.findIndex((stop) => stop.href === href);
	return index < 0 ? {} : { previous: order[index - 1], next: order[index + 1] };
}

/**
 * The explorer narrowed to notes matching every word of `query`, checked
 * against the title, the explorer label and badge, and every folder above the
 * note. Folders keep only what matches below them, so each match shows with
 * its path; a folder whose own name matches keeps everything in it.
 */
export function filterExplorer<T extends UiIndexEntry>(tree: readonly ExplorerNode<T>[], query: string): ExplorerNode<T>[] {
	const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
	if (words.length === 0) return [...tree];
	const prune = (nodes: readonly ExplorerNode<T>[], path: readonly string[]): ExplorerNode<T>[] =>
		nodes.flatMap((node) => {
			if (!node.isFolder) {
				const haystack = [node.title, node.item?.label, node.item?.badge?.label, ...path].join(' ').toLocaleLowerCase();
				return words.every((word) => haystack.includes(word)) ? [node] : [];
			}
			const children = prune(node.children, [...path, node.title]);
			return children.length ? [{ ...node, children }] : [];
		});
	return prune(tree, []);
}

const directoryOf = (path: string) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');

/**
 * The folder a note sits in when the folder records don't list it, as for an
 * unlocked hidden note. Its published slug can't tell (a collision may
 * suffix it: `guides/section-2`), so its file's directory decides: the folder
 * of a listed note in the same directory, else in the nearest one above.
 */
export function physicalFolder<T extends UiIndexEntry>(
	entry: Pick<T, 'path'>,
	listed: readonly T[],
	folderOf: (slug: string) => string | undefined
): string | undefined {
	if (!entry.path) return undefined;
	for (let directory = directoryOf(entry.path); directory; directory = directoryOf(directory)) {
		for (const note of listed) {
			if (note.path === undefined || directoryOf(note.path) !== directory) continue;
			const folder = folderOf(note.slug);
			if (folder !== undefined) return folder;
		}
	}
	return undefined;
}

/** Every note in the tree, in order. */
export const explorerNotes = <T extends UiIndexEntry>(tree: readonly ExplorerNode<T>[]): ExplorerNode<T>[] =>
	tree.flatMap((node) => (node.isFolder ? explorerNotes(node.children) : [node]));
