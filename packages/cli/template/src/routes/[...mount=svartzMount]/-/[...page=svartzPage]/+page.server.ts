import { error, redirect } from '@sveltejs/kit';
import { decodeRoutePath } from '@svartz/ui/runtime';
import { assets, base, hostStylesheets, prepareHostVault } from 'virtual:svartz/host';
import { svartzPage } from 'virtual:svartz/server';

// Plugin pages under /-/ render on every request; notes stay prerendered.
export const prerender = false;

export const load = async (event) => {
  const page = await svartzPage(event);
  if (!page) error(404);
  if ('redirect' in page) redirect(303, page.redirect);
  const pathname = decodeRoutePath(event.url.pathname.slice(base.length)) ?? '/';
  await prepareHostVault(pathname);
  return { svartzPage: page, svartzStylesheets: hostStylesheets(pathname).map((file) => `${assets}/${file}`) };
};
