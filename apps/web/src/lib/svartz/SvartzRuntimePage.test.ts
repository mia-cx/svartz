import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import SvartzRuntimePage from './SvartzRuntimePage.svelte';

describe('SvartzRuntimePage SSR', () => {
	it('renders the layout and note content without a loading placeholder', () => {
		const { body } = render(SvartzRuntimePage, { props: { pathname: '/' } });

		expect(body).toContain('Svartz test layout');
		expect(body).toContain('Svartz test page');
		expect(body).not.toContain('Loading...');
	});
});
