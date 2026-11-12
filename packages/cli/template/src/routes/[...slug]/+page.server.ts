import { assets, base } from '$app/paths';
import { error } from '@sveltejs/kit';
import { decodeRoutePath } from '@svartz/ui/runtime';
import { hostStylesheets, prepareHostVault } from 'virtual:svartz/host';

export const load = async ({ url }) => {
  const appPath = decodeRoutePath(base ? url.pathname.slice(base.length) || '/' : url.pathname);
  if (appPath === undefined) error(404);
  const pathname = appPath.endsWith('/') ? appPath : `${appPath}/`;
  await prepareHostVault(pathname);
  // Serialize CSS URLs because the browser registry is empty during hydration.
  return { svartzStylesheets: hostStylesheets(pathname).map((file) => `${assets}/${file}`) };
};
