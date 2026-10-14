import { assets } from '$app/paths';
import { hostStylesheets } from 'virtual:svartz/host';

/**
 * Stylesheet URLs for a host note route. Call it in the route's server `load`
 * (`+page.server.ts`): a universal `load` reruns during hydration and `hostStylesheets`
 * is empty in the browser, so serialized server data must carry the SSR list.
 */
export function noteStylesheets(pathname: string): string[] {
	const appPathname = pathname.endsWith('/') ? pathname : `${pathname}/`;
	return hostStylesheets(appPathname).map((file) => `${assets}/${file}`);
}
