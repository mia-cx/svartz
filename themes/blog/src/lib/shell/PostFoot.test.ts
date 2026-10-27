import type { ShellState } from '@svartz/theme-minimal/runtime';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import PostFoot from './PostFoot.svelte';

// Only the shell fields the post footer reads.
const shell = (entry: { slug: string; tags: string[] }) =>
	({
		entry,
		vault: { tags: [], routes: { mountPath: '' } },
		chrome: { pageNav: true },
		previous: { title: 'Compost', href: '/posts/compost/' },
		next: { title: 'Slugs', href: '/posts/slugs/' }
	}) as unknown as ShellState;

describe('PostFoot', () => {
	it("links a post's tags and the shell's previous and next pages", () => {
		const { body } = render(PostFoot, { props: { shell: shell({ slug: 'posts/tomatoes', tags: ['crops'] }) } });
		expect(body).toContain('href="/tags/crops/"');
		expect(body).toMatch(/href="\/posts\/compost\/" rel="prev"[^]*Compost/);
		expect(body).toMatch(/href="\/posts\/slugs\/" rel="next"[^]*Slugs/);
	});

	it('leaves the home note bare', () => {
		const { body } = render(PostFoot, { props: { shell: shell({ slug: 'index', tags: ['crops'] }) } });
		expect(body).not.toContain('<footer');
	});
});
