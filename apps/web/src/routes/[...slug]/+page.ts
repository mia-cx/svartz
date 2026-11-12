import type { EntryGenerator } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { assets, base } from '$app/paths';
import { decodeRoutePath } from '@svartz/ui/runtime';
import { hostStylesheets, routes, prepareHostVault } from 'virtual:svartz/host';

export const load = async ({ url }) => {
  const appPath = decodeRoutePath(base ? url.pathname.slice(base.length) || '/' : url.pathname);
  if (appPath === undefined) error(404);
  const pathname = appPath.endsWith('/') ? appPath : `${appPath}/`;
  const destination = routes.redirects[pathname];
  if (destination) redirect(308, `${base}${destination}`);
  await prepareHostVault(pathname);
  if (!routes.all.includes(pathname)) error(404);
  return { svartzStylesheets: hostStylesheets(pathname).map((file) => `${assets}/${file}`) };
};

export const entries: EntryGenerator = async () =>
	routes.all
		.map((pathname) => ({
			slug: pathname.replace(/^\/+|\/+$/g, '')
		}));
