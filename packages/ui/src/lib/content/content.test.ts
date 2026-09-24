import { describe, expect, it } from 'vitest';
import { resolveCallout } from './callouts';
import { classifyLink } from './links';
import { formatDate, readingTime } from '../format';
import { excerpt, highlight, parseSearchQuery } from '../search';

describe('resolveCallout', () => {
	it('maps Obsidian aliases to their canonical type', () => {
		expect(resolveCallout('tldr').type).toBe('abstract');
		expect(resolveCallout('FAQ').type).toBe('question');
		expect(resolveCallout('caution').type).toBe('warning');
		expect(resolveCallout('error').type).toBe('danger');
	});

	it('falls back to note styling for unknown types but keeps the author title', () => {
		const callout = resolveCallout('recipe', 'Pancakes');
		expect(callout.type).toBe('note');
		expect(callout.title).toBe('Pancakes');
	});

	it('titles an untitled callout from the type the author wrote', () => {
		expect(resolveCallout('my-idea').title).toBe('My idea');
		expect(resolveCallout('hint', '').title).toBe('Hint');
	});
});

describe('classifyLink', () => {
	it('separates internal, external, and in-page links', () => {
		expect(classifyLink('../guides/setup/')).toBe('internal');
		expect(classifyLink('/docs/intro/')).toBe('internal');
		expect(classifyLink('https://example.com')).toBe('external');
		expect(classifyLink('mailto:hi@example.com')).toBe('external');
		expect(classifyLink('#install')).toBe('anchor');
		expect(classifyLink(undefined)).toBe('anchor');
	});

	it('treats links to attachments as files, not pages', () => {
		expect(classifyLink('../attachments/manual.pdf')).toBe('file');
		expect(classifyLink('/media/clip.mp4#t=10')).toBe('file');
		expect(classifyLink('../guides/setup.html')).toBe('internal');
		expect(classifyLink('../v1.2/notes/')).toBe('internal');
	});

	it('recognises heading anchors and footnote references', () => {
		expect(classifyLink('#install', { class: 'heading-anchor' })).toBe('heading-anchor');
		expect(classifyLink('#user-content-fn-1', { 'data-footnote-ref': true })).toBe('footnote');
		expect(classifyLink('#user-content-fnref-1', { 'data-footnote-backref': '' })).toBe('footnote');
	});
});

describe('formatting', () => {
	it('formats dates as short month, day, year', () => {
		expect(formatDate(new Date('2026-09-04T12:00:00Z'))).toBe('Sep 4, 2026');
		expect(formatDate('2025-01-05')).toBe('Jan 5, 2025');
		expect(formatDate(undefined)).toBeUndefined();
	});

	it('rounds reading time up and never reports zero', () => {
		expect(readingTime(0)).toBe('1 min read');
		expect(readingTime(2.4)).toBe('3 min read');
	});
});

describe('parseSearchQuery', () => {
	it('reads a leading #tag as a tag filter', () => {
		expect(parseSearchQuery('#guides setup')).toEqual({ tag: 'guides', text: 'setup' });
		expect(parseSearchQuery('#guides')).toEqual({ tag: 'guides', text: '' });
		expect(parseSearchQuery('  vault  ')).toEqual({ tag: undefined, text: 'vault' });
	});
});

describe('search result text', () => {
	it('splits text into plain and matched segments, case-insensitively', () => {
		expect(highlight('Publish a Vault', ['vault'])).toEqual([
			{ text: 'Publish a ', match: false },
			{ text: 'Vault', match: true }
		]);
		expect(highlight('No match', [])).toEqual([{ text: 'No match', match: false }]);
	});

	it('cuts an excerpt around the first matched term', () => {
		const words = Array.from({ length: 100 }, (_, index) => `w${index}`);
		words[60] = 'needle';
		const cut = excerpt(words.join(' '), ['needle'], 10);
		expect(cut.startsWith('… ')).toBe(true);
		expect(cut.endsWith(' …')).toBe(true);
		expect(cut).toContain('needle');
		expect(cut.split(' ').length).toBeLessThanOrEqual(12);
		expect(excerpt('short text', ['absent'], 10)).toBe('short text');
	});
});
