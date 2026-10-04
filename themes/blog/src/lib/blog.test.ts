import { describe, expect, it } from 'vitest';
import { adjacentPosts, archive, blogPosts, readPost, relatedPosts } from './blog.js';

const post = (slug: string, publishedAt: string, tags: string[] = [], properties: Record<string, unknown> = {}) => ({
	slug,
	title: slug,
	tags,
	properties,
	publishedAt: new Date(publishedAt),
	modifiedAt: new Date('2026-09-24')
});

const posts = [
	post('a', '2026-01-10', ['garden']),
	post('b', '2026-03-02', ['garden', 'tools']),
	post('c', '2025-11-20', ['tools']),
	post('d', '2026-03-15', ['travel'])
];

describe('blogPosts', () => {
	it('lists posts by publish date, newest first, without the home note', () => {
		expect(blogPosts([...posts, post('index', '2026-09-01')]).map((entry) => entry.slug)).toEqual(['d', 'b', 'a', 'c']);
	});
});

describe('readPost', () => {
	it('reads cover, alt text, excerpt, and author, falling back to the description', () => {
		expect(readPost({ cover: 'hero.jpg', coverAlt: 'A path', author: 'Mia' }, 'Short summary')).toEqual({
			cover: 'hero.jpg',
			coverAlt: 'A path',
			excerpt: 'Short summary',
			author: 'Mia'
		});
		expect(readPost({ excerpt: 'Own excerpt', cover: 3 }, 'Summary')).toEqual({
			cover: undefined,
			coverAlt: undefined,
			excerpt: 'Own excerpt',
			author: undefined
		});
	});
});

describe('post navigation', () => {
	it('ranks related posts by shared tags, then recency', () => {
		const ordered = blogPosts(posts);
		expect(relatedPosts(ordered[1]!, ordered, 2).map((entry) => entry.slug)).toEqual(['a', 'c']);
	});

	it('finds the newer and older neighbours', () => {
		const ordered = blogPosts(posts);
		const b = ordered.find((entry) => entry.slug === 'b')!;
		expect(adjacentPosts(b, ordered)).toMatchObject({ newer: { slug: 'd' }, older: { slug: 'a' } });
	});

	it('groups the archive by year and month, newest first', () => {
		expect(archive(blogPosts(posts)).map((year) => [year.year, year.months.map((month) => [month.month, month.posts.length])])).toEqual([
			['2026', [['March', 2], ['January', 1]]],
			['2025', [['November', 1]]]
		]);
	});
});
