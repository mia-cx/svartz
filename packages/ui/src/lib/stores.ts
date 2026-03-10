import { persistentAtom } from "@nanostores/persistent";

const jsonArray = {
	encode: (value: string[]) => JSON.stringify(value),
	decode: (raw: string): string[] => {
		try {
			const parsed = JSON.parse(raw);
			return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
		} catch {
			return [];
		}
	},
};

/** Persisted set of open folder IDs in the explorer. */
export const explorerOpenIds = persistentAtom<string[]>("svartz:ui:explorer:open", [], jsonArray);

/** Persisted set of collapsed ToC section slugs (e.g. h2 slugs). Empty = all expanded. */
export const tocCollapsedSlugs = persistentAtom<string[]>("svartz:ui:toc:collapsed", [], jsonArray);
