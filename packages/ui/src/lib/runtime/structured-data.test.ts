import type { VaultView } from '@svartz/core';
import { describe, expect, it } from 'vitest';
import { jsonLdScript, pageGraph } from './structured-data.js';

describe('jsonLdScript', () => {
	it('keeps note text from closing the script tag', () => {
		const script = jsonLdScript([{ '@type': 'Article', headline: '</script><script>alert(1)</script>' }]);

		expect(script.match(/<\/script>/g)).toHaveLength(1);
		expect(script).toContain('\\u003c/script>\\u003cscript>alert(1)\\u003c/script>');
	});
});

describe('pageGraph', () => {
	it('lets a theme that shows no breadcrumbs drop them from list pages too', () => {
		const graph = pageGraph({
			site: { title: 'Plot 14' },
			vault: { routes: { mountPath: '' } } as VaultView,
			theme: { structuredData: ({ article }) => ({ article }) },
			crumbs: [{ title: 'Home', href: '/' }, { title: 'Tags', href: '/tags/' }],
			url: 'https://plot14.example/tags/',
			absolute: (path) => new URL(path, 'https://plot14.example').href
		});

		expect(graph).toEqual([{ '@type': 'WebSite', name: 'Plot 14', url: 'https://plot14.example/' }]);
	});
});
