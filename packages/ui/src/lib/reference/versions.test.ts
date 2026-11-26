import { expect, it } from 'vitest';
import { versionLinks } from './versions.js';

const versions = [
	{ id: '2026-04', status: 'latest' },
	{ id: '2026-01', status: 'supported' },
	{ id: '2025-07', status: 'deprecated' }
];
/** Pages each version has, under a `/docs` deployment base: `pets` everywhere, `webhooks` only in 2026-04. */
const routes = new Set(['/docs/', '/docs/pets/', '/docs/webhooks/', '/docs/2026-01/', '/docs/2026-01/pets/', '/docs/2025-07/', '/docs/2025-07/pets/']);
const hasRoute = (href: string) => routes.has(href);
const hrefs = (version: string, homeHref: string, currentHref: string) =>
	versionLinks({ version, versions }, { homeHref, currentHref, hasRoute }).map(({ id, href, current }) => [id, href, current]);

// Proves the picker keeps the reader on the page they're reading, from the latest version and from an older one, and
// lands on a version's home page when it has no such page.
it.each([
	['latest, on a page every version has', '2026-04', '/docs/', '/docs/pets/', ['/docs/pets/', '/docs/2026-01/pets/', '/docs/2025-07/pets/']],
	['latest, on a page only it has', '2026-04', '/docs/', '/docs/webhooks/', ['/docs/webhooks/', '/docs/2026-01/', '/docs/2025-07/']],
	['an older version, on a page every version has', '2026-01', '/docs/2026-01/', '/docs/2026-01/pets/', ['/docs/pets/', '/docs/2026-01/pets/', '/docs/2025-07/pets/']],
	['an older version, on its home page', '2025-07', '/docs/2025-07/', '/docs/2025-07/', ['/docs/', '/docs/2026-01/', '/docs/2025-07/']]
])('links each version from %s', (_case, version, homeHref, currentHref, expected) => {
	expect(hrefs(version, homeHref, currentHref)).toEqual([
		['2026-04', expected[0], version === '2026-04'],
		['2026-01', expected[1], version === '2026-01'],
		['2025-07', expected[2], version === '2025-07']
	]);
});

// Proves a site without versions keeps its plain `version` badge.
it('lists nothing without versions', () => {
	expect(versionLinks({ version: 'v2' }, { homeHref: '/', currentHref: '/pets/', hasRoute })).toEqual([]);
});
