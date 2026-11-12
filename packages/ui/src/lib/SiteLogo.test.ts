import { expect, it } from 'vitest';
import { render } from 'svelte/server';
import SiteLogo from './SiteLogo.svelte';

it('gives a logo outside a Svartz page the deployment base it is passed', () => {
	const { body } = render(SiteLogo, { props: { logo: { src: '/logo.svg', alt: 'Docs' }, base: '/docs' } });

	expect(body).toContain('src="/docs/logo.svg"');
});
