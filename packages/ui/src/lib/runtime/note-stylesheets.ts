import { assets } from '$app/paths';
import { hostStylesheets } from 'virtual:svartz/host';

/**
 * Stylesheet URLs for a host note route. Call it in the route's universal `load`:
 * `hostStylesheets` is empty in the browser, so page data must carry the SSR list through hydration.
 */
export function noteStylesheets(pathname: string): string[] {
	const appPathname = pathname.endsWith('/') ? pathname : `${pathname}/`;
	return hostStylesheets(appPathname).map((file) => `${assets}/${file}`);
}
