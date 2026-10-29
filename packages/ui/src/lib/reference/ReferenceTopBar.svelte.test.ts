import { render } from 'vitest-browser-svelte';
import { afterEach, expect, it, vi } from 'vitest';
import '../styles/base.css';
import ReferenceTopBar from './ReferenceTopBar.svelte';

vi.mock('$app/paths', () => ({ base: '/docs', assets: '/docs' }));

const renderTopBar = (themeConfig: Record<string, unknown>) => {
	const shell = {
		vault: { search: [] },
		site: { title: 'Logitland' },
		homeHref: '/docs/',
		themeConfig,
		drawer: false,
		toggleDrawer: () => {}
	};
	const { container } = render(ReferenceTopBar, { shell: shell as never });
	return [...container.querySelectorAll<HTMLImageElement>('.sv-wordmark img')];
};

afterEach(() => document.documentElement.classList.remove('light', 'dark'));

it('shows the mark in the wordmark, with site-root paths under the deployment base and URLs as written', () => {
	const images = renderTopBar({ logo: { src: '/logo.svg', dark: 'https://cdn.example/logo-dark.svg' } });
	expect(images.map((image) => image.getAttribute('src'))).toEqual(['/docs/logo.svg', 'https://cdn.example/logo-dark.svg']);
	expect(images.map((image) => image.alt)).toEqual(['', '']);
});

it('shows no image without a logo', () => {
	expect(renderTopBar({})).toEqual([]);
});

it.each([
	['dark', ['none', 'block']],
	['light', ['block', 'none']]
])('in pinned %s mode, shows only that mode’s mark', (mode, displays) => {
	document.documentElement.classList.add(mode);
	const images = renderTopBar({ logo: { src: '/light.svg', dark: '/dark.svg' } });
	expect(images.map((image) => getComputedStyle(image).display)).toEqual(displays);
});
