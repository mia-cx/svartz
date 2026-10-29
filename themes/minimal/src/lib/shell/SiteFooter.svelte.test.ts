import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { expect, it } from 'vitest';
import type { ShellState } from '../extension.js';
import SiteFooter from './SiteFooter.svelte';

it('lists two labels that share a URL', async () => {
	const url = 'https://github.com/mia-cx/svartz';
	const shell = { site: { title: 'Garden' }, themeConfig: { footer: { links: { Source: url, Issues: url } } } };
	render(SiteFooter, { shell: shell as unknown as ShellState });
	await expect.element(page.getByRole('link', { name: 'Source' })).toHaveAttribute('href', url);
	await expect.element(page.getByRole('link', { name: 'Issues' })).toHaveAttribute('href', url);
});
