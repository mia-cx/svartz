import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { beforeEach, expect, it } from 'vitest';
import FileTrie from './FileTrie.svelte';
import { explorerOpenIds } from './stores.js';

// A root `guides.md` shares its slug with the `guides` folder, not its href.
const entries = [
	{ slug: 'guides', path: 'guides.md', title: 'Root guide', href: '/guides/' },
	{ slug: 'guides/setup', path: 'guides/setup.md', title: 'Setup', href: '/guides/setup/' }
];
const folders = [{ slug: 'guides', title: 'Guides', noteCount: 1, noteSlugs: ['guides/setup'], href: '/folders/guides/' }];

beforeEach(() => explorerOpenIds.set([]));

it.each([
	['/folders/guides/', 'true'],
	['/guides/setup/', 'true'],
	['/guides/', 'false']
])('on %s, the Guides folder has aria-expanded=%s', async (currentHref, expanded) => {
	render(FileTrie, { entries, folders, currentHref });
	await expect.element(page.getByRole('button', { name: 'Guides' })).toHaveAttribute('aria-expanded', expanded);
});
