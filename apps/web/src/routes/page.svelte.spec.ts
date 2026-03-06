import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Page from './+page.svelte';

describe('/+page.svelte', () => {
	it('renders the runtime layout and page from virtual modules', async () => {
		render(Page);

		await expect.element(page.getByRole('heading', { level: 1 })).toHaveTextContent(
			'Svartz test layout'
		);
		await expect.element(page.getByRole('heading', { level: 2 })).toHaveTextContent(
			'Svartz test page'
		);
	});
});
