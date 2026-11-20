import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import SvartzRuntimePage from './SvartzRuntimePage.svelte';

// A one-vault host with stub theme pages, as a standalone build generates.
vi.mock('virtual:svartz/host', () => import('./testing/shell/runtime-host'));

describe('/+page.svelte', () => {
	it('renders the runtime layout and page from virtual modules', async () => {
		render(SvartzRuntimePage, { pathname: '/' });

		await expect.element(page.getByRole('heading', { level: 1 })).toHaveTextContent(
			'Svartz test layout'
		);
		await expect.element(page.getByRole('heading', { level: 2 })).toHaveTextContent(
			'Svartz test page'
		);
	});
});

describe('/[...slug]/+page.svelte', () => {
	it('renders tag routes through the runtime shell', async () => {
		render(SvartzRuntimePage, { pathname: '/tags/other/' });

		await expect.element(page.getByRole('heading', { level: 1 })).toHaveTextContent(
			'Svartz test layout'
		);
		await expect.element(page.getByRole('heading', { level: 2 })).toHaveTextContent(
			'Tag: other'
		);
	});

	it('renders an authored note ahead of a generated tag route', async () => {
		render(SvartzRuntimePage, { pathname: '/tags/testing/' });
		await expect.element(page.getByRole('heading', { level: 2 })).toHaveTextContent(
			'Authored tag landing'
		);
	});

	it('renders folder routes through the runtime shell', async () => {
		render(SvartzRuntimePage, { pathname: '/folders/guides/' });

		await expect.element(page.getByRole('heading', { level: 1 })).toHaveTextContent(
			'Svartz test layout'
		);
		await expect.element(page.getByRole('heading', { level: 2 })).toHaveTextContent(
			'Folder: guides'
		);
	});

	it('renders the not found component when no runtime route matches', async () => {
		render(SvartzRuntimePage, { pathname: '/missing/' });

		await expect.element(page.getByRole('heading', { level: 2 })).toHaveTextContent(
			'Svartz test not found'
		);
		await expect.element(page.getByText('Missing runtime route.')).toBeInTheDocument();
	});
});
