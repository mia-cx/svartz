import { afterEach, expect, it } from 'vitest';
import { render } from 'svelte/server';
import type { ThemePageProps } from '@svartz/ui';
import FeedPage from './FeedPage.svelte';

const originalTimezone = process.env.TZ;

afterEach(() => {
	if (originalTimezone === undefined) delete process.env.TZ;
	else process.env.TZ = originalTimezone;
});

it('uses a valid fallback date and the same UTC day as the note header', () => {
	process.env.TZ = 'America/Los_Angeles';
	const { body } = render(FeedPage, {
		props: {
			// Only the fields the feed reads.
			vault: {
				entries: [{
					slug: 'near-midnight',
					title: 'Near midnight',
					href: '/near-midnight/',
					tags: [],
					modifiedAt: 'not-a-date',
					createdAt: '2026-09-25T00:30:00.000Z'
				}],
				tags: [],
				routes: { mountPath: '' }
			}
		} as unknown as ThemePageProps
	});

	expect(body).toContain('datetime="2026-09-25T00:30:00.000Z"');
	expect(body).toContain(new Intl.DateTimeFormat(undefined, {
		year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC'
	}).format(new Date('2026-09-25T00:30:00.000Z')));
});
