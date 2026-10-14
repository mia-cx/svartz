import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import SvartzNoteContent from './SvartzNoteContent.svelte';
import { noteStylesheets } from './note-stylesheets.js';

describe('SvartzNoteContent SSR', () => {
	it('renders a plain note body with no theme layout', () => {
		const { body } = render(SvartzNoteContent, {
			props: { pathname: '/work/plain/', stylesheets: [] }
		});
		expect(body).toContain('Plain body');
		expect(body).toContain('class="sv-prose"');
		expect(body).toContain('data-sv-preview');
		expect(body).not.toContain('THEME LAYOUT');
	});

	it('emits the stylesheet links its route computed in load', async () => {
		const { head, body } = render(SvartzNoteContent, {
			props: {
				pathname: '/work/callouts/',
				stylesheets: await noteStylesheets('/work/callouts/')
			}
		});
		expect(body).toContain('Callout body');
		expect(head).toContain('/_app/immutable/assets/shared.css');
		expect(head).toContain('/_app/immutable/assets/callouts.css');
	});

	it('computes stylesheets for a pathname without a trailing slash', async () => {
		expect(await noteStylesheets('/work/callouts')).toEqual([
			'/_app/immutable/assets/shared.css',
			'/_app/immutable/assets/callouts.css'
		]);
	});

	it('renders nothing for a non-note pathname', () => {
		const { body, head } = render(SvartzNoteContent, {
			props: {
				pathname: '/work/tags/demo/',
				stylesheets: ['/_app/immutable/assets/shared.css']
			}
		});
		expect(body.replace(/<!--.*?-->/g, '').trim()).toBe('');
		expect(head).not.toContain('stylesheet');
	});

	it('renders the unlock form for a protected note', () => {
		const { body } = render(SvartzNoteContent, {
			props: { pathname: '/work/secret/', stylesheets: [] }
		});
		expect(body).toContain('Unlock note');
		expect(body).toContain('data-clarity-mask="true"');
	});
});
