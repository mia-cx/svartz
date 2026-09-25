import type { EntryGenerator } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { base } from '$app/paths';
import { routes } from 'virtual:svartz/artifacts';

export const load = ({ url }) => {
  const appPath = base ? url.pathname.slice(base.length) || '/' : url.pathname;
  const pathname = appPath.endsWith('/') ? appPath : `${appPath}/`;
  const destination = routes.redirects[pathname];
  if (destination) redirect(308, `${base}${destination}`);
  if (!routes.all.includes(pathname)) error(404);
};

export const entries: EntryGenerator = async () => routes.all
  .filter((pathname) => pathname !== '/')
  .map((pathname) => ({ slug: pathname.replace(/^\/+|\/+$/g, '') }));
