import type { ShellState } from '@svartz/theme-minimal/runtime';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import BlogFooter from './BlogFooter.svelte';

// Only the shell fields the blog footer reads.
const shell = (themeConfig: object) =>
	({ site: { title: 'Allotment' }, vault: { routes: { mountPath: '' } }, themeConfig }) as unknown as ShellState;

describe('BlogFooter', () => {
	it('lists two labels that share a URL, and a label in both lists once', () => {
		const { body } = render(BlogFooter, {
			props: {
				shell: shell({
					nav: { Source: 'https://github.com/mia-cx/svartz', Issues: 'https://github.com/mia-cx/svartz' },
					footer: { links: { Source: 'https://example.com/source', Mastodon: 'https://example.com/@mia' } }
				})
			}
		});
		expect(body.match(/>(Source|Issues|Mastodon)</g)).toEqual(['>Source<', '>Issues<', '>Mastodon<']);
	});
});
