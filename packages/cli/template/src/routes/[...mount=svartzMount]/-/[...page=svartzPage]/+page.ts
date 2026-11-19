import { decodeRoutePath } from '@svartz/ui/runtime';
import { base, prepareHostVault } from 'virtual:svartz/host';

// The theme's shell loads lazily; prepare it before rendering here and before hydrating in the browser.
export const load = async ({ url, data }) => {
  await prepareHostVault(decodeRoutePath(url.pathname.slice(base.length)) ?? '/');
  return data;
};
