import { isRecord } from '../theme-settings.js';

/** `latest` is served at the unversioned URL; `deprecated` pages point readers to it. */
export type VersionStatus = 'latest' | 'supported' | 'deprecated';

/** One documented version, as the build gives it to the theme in `versions`. */
export interface ReferenceVersion {
	readonly id: string;
	readonly status: VersionStatus;
}

/** A version to switch to: where the reader lands, and whether they're reading it now. */
export interface VersionLink extends ReferenceVersion {
	readonly href: string;
	/** Whether `href` is the reader's page in this version, rather than the version's home page. */
	readonly samePage: boolean;
	readonly current: boolean;
}

const STATUSES: readonly string[] = ['latest', 'supported', 'deprecated'];

const isVersion = (value: unknown): value is ReferenceVersion =>
	isRecord(value) && typeof value.id === 'string' && STATUSES.includes(value.status as string);

/**
 * The site's versions in config order, each linking to the page the reader is on as that version has it, or to that
 * version's home page when it has no such page. Empty unless the build lists `versions` and names the current one in
 * `version`. The latest version lives at the vault's mount, and every other at `<mount>/<id>/`.
 */
export function versionLinks(
	themeConfig: Readonly<Record<string, unknown>>,
	page: { readonly homeHref: string; readonly currentHref: string; readonly hasRoute: (href: string) => boolean }
): VersionLink[] {
	const versions = Array.isArray(themeConfig.versions) ? themeConfig.versions.filter(isVersion) : [];
	const current = versions.find((version) => version.id === themeConfig.version);
	if (!current) return [];
	const latestHome = current.status === 'latest' ? page.homeHref : page.homeHref.slice(0, -(current.id.length + 1));
	const path = page.currentHref.startsWith(page.homeHref) ? page.currentHref.slice(page.homeHref.length) : '';
	return versions.map(({ id, status }) => {
		const home = status === 'latest' ? latestHome : `${latestHome}${id}/`;
		const same = `${home}${path}`;
		const samePage = id === current.id || page.hasRoute(same);
		return { id, status, current: id === current.id, samePage, href: samePage ? same : home };
	});
}
