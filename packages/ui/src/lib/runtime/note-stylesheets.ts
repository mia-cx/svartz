import { assets } from '$app/paths';
import { hostStylesheets, prepareHostVault } from 'virtual:svartz/host';

/**
 * Stylesheet URLs for a host note route. Call it in the route's server `load`
 * (`+page.server.ts`): it prepares the vault itself, and `hostStylesheets` is
 * empty in the browser, so serialized server data must carry the SSR list.
 */
export async function noteStylesheets(pathname: string): Promise<string[]> {
	const appPathname = pathname.endsWith('/') ? pathname : `${pathname}/`;
	await prepareHostVault(appPathname);
	return hostStylesheets(appPathname).map((file) => `${assets}/${file}`);
}
