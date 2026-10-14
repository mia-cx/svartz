import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import SvartzNoteContent from './SvartzNoteContent.svelte';

describe('SvartzNoteContent SSR', () => {
	it('renders a plain note body with no theme layout', () => {
		const { body } = render(SvartzNoteContent, { props: { pathname: '/work/plain/' } });
		expect(body).toContain('Plain body');
		expect(body).not.toContain('THEME LAYOUT');
	});

	it('emits shared and note-specific stylesheet links', () => {
		const { head, body } = render(SvartzNoteContent, { props: { pathname: '/work/callouts/' } });
		expect(body).toContain('Callout body');
		expect(head).toContain('/_app/immutable/assets/shared.css');
		expect(head).toContain('/_app/immutable/assets/callouts.css');
	});

	it('renders nothing for a non-note pathname', () => {
		const { body, head } = render(SvartzNoteContent, { props: { pathname: '/work/tags/demo/' } });
		expect(body.replace(/<!--.*?-->/g, '').trim()).toBe('');
		expect(head).not.toContain('stylesheet');
	});

	it('renders the unlock form for a protected note', () => {
		const { body } = render(SvartzNoteContent, { props: { pathname: '/work/secret/' } });
		expect(body).toContain('Unlock note');
		expect(body).toContain('data-clarity-mask="true"');
	});
});
