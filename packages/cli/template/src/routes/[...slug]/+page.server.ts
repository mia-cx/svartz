import { assets, base } from '$app/paths';
import { hostStylesheets, prepareHostVault } from 'virtual:svartz/host';

export const load = async ({ url }) => {
  const appPath = base ? url.pathname.slice(base.length) || '/' : url.pathname;
  const pathname = appPath.endsWith('/') ? appPath : `${appPath}/`;
  await prepareHostVault(pathname);
  // Serialize CSS URLs because the browser registry is empty during hydration.
  return { svartzStylesheets: hostStylesheets(pathname).map((file) => `${assets}/${file}`) };
};
