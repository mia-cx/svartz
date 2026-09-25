import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import DefaultContentElement from './DefaultContentElement.svelte';
import { resolveContentComponents } from './content-components.js';
import ContentFixture from './testing/ContentFixture.svelte';
import HostLink from './testing/HostLink.svelte';
import ThemeLink from './testing/ThemeLink.svelte';

describe('content component precedence', () => {
	it('uses host, theme, then built-in components by slot', () => {
		const selected = resolveContentComponents(
			{ link: HostLink },
			{ link: { default: ThemeLink } }
		);
		expect(selected.link).toBe(HostLink);
		expect(selected.callout).toBe(DefaultContentElement);
		expect(render(ContentFixture, { props: { contentComponents: selected } }).body).toContain('data-owner="host"');
		expect(render(ContentFixture, { props: { contentComponents: resolveContentComponents({}, { link: { default: ThemeLink } }) } }).body).toContain('data-owner="theme"');
		const builtInHtml = render(ContentFixture, { props: { contentComponents: resolveContentComponents({}, {}) } }).body;
		expect(builtInHtml.replace(/<!--.*?-->/g, '')).toContain('<a href="/note/">Note</a>');
	});
});
