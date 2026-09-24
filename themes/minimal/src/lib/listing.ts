interface Listable {
	readonly slug: string;
	readonly title: string;
	readonly tags: readonly string[];
	readonly modifiedAt?: Date;
	readonly publishedAt?: Date;
	readonly createdAt?: Date;
}

interface Folder {
	readonly slug: string;
}

/** `1 note`, `3 notes`. */
export const count = (n: number, word: string) => `${n} ${n === 1 ? word : `${word}s`}`;

/** The date a list shows for a note: last modified, else published, else created. */
export const noteDate = (entry: Listable) => entry.modifiedAt ?? entry.publishedAt ?? entry.createdAt;

const time = (entry: Listable) => {
	const date = noteDate(entry);
	return date ? new Date(date).getTime() : -Infinity;
};

export function newestFirst<T extends Listable>(entries: readonly T[]): T[] {
	return [...entries].sort((left, right) => time(right) - time(left) || left.title.localeCompare(right.title));
}

/**
 * Every note under a folder, nested ones included, plus its direct subfolders.
 * The folder's own index note is its page, not an item.
 */
export function folderContents<T extends Listable, F extends Folder>(
	slug: string,
	entries: readonly T[],
	folders: readonly F[]
): { notes: T[]; folders: F[] } {
	const prefix = `${slug}/`;
	const isDirect = (candidate: string) =>
		candidate.startsWith(prefix) && !candidate.slice(prefix.length).includes('/');
	return {
		notes: newestFirst(entries.filter((entry) => entry.slug.startsWith(prefix) && entry.slug !== `${slug}/index`)),
		folders: folders.filter((folder) => isDirect(folder.slug))
	};
}

/** Notes tagged `tag` or a nested tag under it (`tag/…`). */
export function notesTagged<T extends Listable>(entries: readonly T[], tag: string): T[] {
	return newestFirst(
		entries.filter((entry) => entry.tags.some((candidate) => candidate === tag || candidate.startsWith(`${tag}/`)))
	);
}
