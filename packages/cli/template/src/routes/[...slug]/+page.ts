import type { EntryGenerator } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { decodeRoutePath } from '@svartz/ui/runtime';
import { base, prepareHostVault, routes } from 'virtual:svartz/host';

export const load = async ({ url, data }) => {
  const appPath = decodeRoutePath(base ? url.pathname.slice(base.length) || '/' : url.pathname);
  if (appPath === undefined) error(404);
  const pathname = appPath.endsWith('/') ? appPath : `${appPath}/`;
  const destination = routes.redirects[pathname];
  if (destination) redirect(308, `${base}${destination}`);
  await prepareHostVault(pathname);
  if (!routes.all.includes(pathname)) error(404);
  return data;
};

export const entries: EntryGenerator = async () => routes.all
  .map((pathname) => ({ slug: pathname.replace(/^\/+|\/+$/g, '') }));
