import type { IndexEntry } from '@svartz/core';
import type { PageChoice, PageRenderer, ThemeExtension } from './extension.js';

type Page = Pick<IndexEntry, 'slug' | 'path' | 'properties'>;

/** A composed site's themes: the first styles the site; all of them render pages. */
export interface Composition {
	readonly primary: ThemeExtension;
	readonly extensions: readonly ThemeExtension[];
}

export class ThemeSelectionError extends Error {
	override readonly name = 'ThemeSelectionError';
}

const shortName = (extension: ThemeExtension) => extension.name ?? extension.id.replace(/^@svartz\/theme-/, '');

/** The composed theme a `theme:` value names, by short name or package name. */
export function themeNamed(composition: Composition, value: string): ThemeExtension | undefined {
	return composition.extensions.find((extension) => value === extension.id || value === shortName(extension));
}

const themeKey = (page: Page | undefined) => {
	const value = page?.properties?.theme;
	return typeof value === 'string' && value.trim() ? value.trim() : undefined;
};

/**
 * The theme and renderer for a page. The page's own `theme:` wins, then the
 * nearest folder note's (`folderNotes`, nearest first), then whichever
 * renderer detects the page from its frontmatter. A page none of that picks is
 * a plain note in the primary theme, and gets `undefined`.
 *
 * Throws a `ThemeSelectionError` naming the page when `theme:` names a theme
 * the site doesn't compose, when two renderers detect the page, or when a
 * renderer rejects the page's metadata.
 */
export function choosePage(composition: Composition, page: Page, folderNotes: readonly Page[] = []): PageChoice | undefined {
	const where = page.path ?? page.slug;
	const fail = (reason: string, cause?: unknown): never => {
		throw new ThemeSelectionError(`[svartz:theme] "${where}" can't render: ${reason}`, { cause });
	};
	const source = [page, ...folderNotes].find((candidate) => themeKey(candidate) !== undefined);
	const named = themeKey(source);
	const chosen = named === undefined ? undefined : themeNamed(composition, named);
	if (named !== undefined && !chosen) {
		const names = composition.extensions.map(shortName).join(', ');
		fail(`${source === page ? 'its' : `its folder note's (${source!.path ?? source!.slug})`} \`theme: ${named}\` isn't one of this site's themes (${names}).`);
	}

	const claims: { theme: ThemeExtension; renderer: PageRenderer; data: unknown }[] = [];
	for (const theme of chosen ? [chosen] : composition.extensions) {
		for (const renderer of theme.renderers ?? []) {
			let data: unknown;
			try {
				data = renderer.detect(page.properties, page as IndexEntry);
			} catch (error) {
				fail(`the ${renderer.id} renderer rejected its metadata: ${error instanceof Error ? error.message : String(error)}`, error);
			}
			if (data !== undefined) claims.push({ theme, renderer, data });
		}
	}
	// One renderer listed by two themes (a shared schema renderer) is one claim.
	const distinct = [...new Map(claims.map((claim) => [claim.renderer, claim])).values()];
	if (distinct.length > 1) {
		fail(`${distinct.map((claim) => `${claim.renderer.id} (${claim.theme.id})`).join(' and ')} both render it. Set \`theme:\` to choose one.`);
	}
	if (distinct[0]) return distinct[0];
	return chosen && chosen !== composition.primary ? { theme: chosen } : undefined;
}

/**
 * The theme that lists a folder's page: the folder note's `theme:`, then its
 * ancestors' (`folderNotes`, nearest first), then the primary theme.
 */
export function folderTheme(composition: Composition, folderNotes: readonly Page[]): ThemeExtension {
	const source = folderNotes.find((note) => themeKey(note) !== undefined);
	const named = themeKey(source);
	if (named === undefined) return composition.primary;
	const theme = themeNamed(composition, named);
	if (!theme) {
		throw new ThemeSelectionError(
			`[svartz:theme] "${source!.path ?? source!.slug}" names \`theme: ${named}\`, which isn't one of this site's themes (${composition.extensions.map(shortName).join(', ')}).`
		);
	}
	return theme;
}
