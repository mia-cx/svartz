import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { expect, it } from 'vitest';
import FileTrie from './FileTrie.svelte';

it("opens the current folder page's folder", async () => {
	render(FileTrie, {
		entries: [{ slug: 'guides/setup', path: 'guides/setup.md', title: 'Setup' }],
		folders: [{ slug: 'guides', title: 'Guides', noteCount: 1, noteSlugs: ['guides/setup'], href: '/folders/guides/' }],
		currentSlug: 'guides'
	});
	await expect.element(page.getByRole('button', { name: 'Guides' })).toHaveAttribute('aria-expanded', 'true');
});
