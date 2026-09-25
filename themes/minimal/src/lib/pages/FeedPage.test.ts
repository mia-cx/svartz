import { afterEach, expect, it } from 'vitest';
import { render } from 'svelte/server';
import FeedPage from './FeedPage.svelte';

const originalTimezone = process.env.TZ;

afterEach(() => {
	process.env.TZ = originalTimezone;
});

it('uses a valid fallback date and the same UTC day as the note header', () => {
	process.env.TZ = 'America/Los_Angeles';
	const { body } = render(FeedPage, {
		props: {
			index: {
				entries: [{
					slug: 'near-midnight',
					title: 'Near midnight',
					modifiedAt: 'not-a-date',
					createdAt: '2026-09-25T00:30:00.000Z'
				}]
			}
		}
	});

	expect(body).toContain('datetime="2026-09-25T00:30:00.000Z"');
	expect(body).toContain('Sep 25, 2026');
});
