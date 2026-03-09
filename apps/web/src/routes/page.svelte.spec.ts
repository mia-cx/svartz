import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import SvartzRuntimePage from '$lib/svartz/SvartzRuntimePage.svelte';

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
		render(SvartzRuntimePage, { pathname: '/tags/testing/' });

		await expect.element(page.getByRole('heading', { level: 1 })).toHaveTextContent(
			'Svartz test layout'
		);
		await expect.element(page.getByRole('heading', { level: 2 })).toHaveTextContent(
			'Tag: testing'
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
