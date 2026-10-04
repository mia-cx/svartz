import { folderLayout } from './navigation.js';

interface Listable {
	readonly slug: string;
	readonly title: string;
	readonly path?: string;
	readonly tags: readonly string[];
	// Artifacts carry ISO strings; tests and hosts may pass Dates.
	readonly modifiedAt?: Date | string;
	readonly publishedAt?: Date | string;
	readonly createdAt?: Date | string;
}

interface Folder {
	readonly slug: string;
	readonly noteSlugs: readonly string[];
	readonly noteSlug?: string;
}

interface Linked {
	readonly slug: string;
	readonly title: string;
	readonly path?: string;
	readonly href: string;
}

/** `1 note`, `3 notes`. */
export const count = (n: number, word: string) => `${n} ${n === 1 ? word : `${word}s`}`;

/**
 * The date a list shows for a note: last modified, else published, else created.
 * An unparseable date is skipped, so one bad value can't hide the note's date.
 */
export const noteDate = (entry: Listable) =>
	[entry.modifiedAt, entry.publishedAt, entry.createdAt].find(
		(value) => value !== undefined && !Number.isNaN(new Date(value).getTime())
	);

const time = (entry: Listable) => {
	const date = noteDate(entry);
	return date ? new Date(date).getTime() : -Infinity;
};

export function newestFirst<T extends Listable>(entries: readonly T[]): T[] {
	return [...entries].sort((left, right) => time(right) - time(left) || left.title.localeCompare(right.title));
}

/**
 * Every note under a folder, nested ones included, plus its direct subfolders.
 * The folder's own note (`log/index.md`) is its page, not an item.
 */
export function folderContents<T extends Listable, F extends Folder>(
	slug: string,
	entries: readonly T[],
	folders: readonly F[]
): { notes: T[]; folders: F[] } {
	const members = new Set(folders.find((folder) => folder.slug === slug)?.noteSlugs);
	const own = folderLayout(entries, folders).noteOf(slug);
	const prefix = `${slug}/`;
	const isDirect = (candidate: string) =>
		candidate.startsWith(prefix) && !candidate.slice(prefix.length).includes('/');
	return {
		notes: newestFirst(entries.filter((entry) => members.has(entry.slug) && entry !== own)),
		folders: folders.filter((folder) => isDirect(folder.slug))
	};
}

export interface FolderSection<T> {
	/** The top-level folder, or `""` for notes at the vault root. */
	readonly slug: string;
	/** The folder's title (its `index.md` can rename it). `""` for the root. */
	readonly title: string;
	/** The folder note, else the generated folder page. */
	readonly href?: string;
	readonly entries: T[];
}

/**
 * Notes grouped by top-level folder, in first-seen order, without the home note.
 * A folder note (`guides/index.md`) links its section instead of listing in it;
 * a folder with only its note is an empty section.
 */
export function topLevelSections<T extends Linked>(
	entries: readonly T[],
	folders: readonly (Linked & Folder)[]
): FolderSection<T>[] {
	const layout = folderLayout(entries, folders);
	const sections = new Map<string, T[]>();
	for (const entry of entries) {
		if (entry.slug === 'index') continue;
		const key = layout.folderOf(entry.slug)?.split('/')[0] ?? '';
		// The folder note holds its section's place even if the folder has no other notes.
		const grouped = sections.get(key) ?? [];
		sections.set(key, grouped);
		if (!key || layout.noteOf(key) !== entry) grouped.push(entry);
	}
	return [...sections].map(([slug, grouped]) => {
		const note = slug ? layout.noteOf(slug) : undefined;
		const folder = slug ? folders.find((candidate) => candidate.slug === slug) : undefined;
		return { slug, title: folder?.title ?? slug, href: note?.href ?? folder?.href, entries: grouped };
	});
}

/** Notes tagged `tag` or a nested tag under it (`tag/…`). */
export function notesTagged<T extends Listable>(entries: readonly T[], tag: string): T[] {
	return newestFirst(
		entries.filter((entry) => entry.tags.some((candidate) => candidate === tag || candidate.startsWith(`${tag}/`)))
	);
}
