import { page } from 'vitest/browser';
import { afterEach, expect, it } from 'vitest';
import { svartzContentComponents } from '../content/index.js';
import { resolveContentComponents } from './content-components.js';
import { mountContent } from './mount-content.svelte.js';

const components = resolveContentComponents({}, svartzContentComponents);
let target: HTMLElement;

afterEach(() => target.remove());

function show(html: string) {
	target = Object.assign(document.createElement('div'), { className: 'sv-prose' });
	document.body.append(target);
	const view = mountContent(target, components);
	view.render(html);
	return view;
}

it('renders callouts, code, links and embeds through the content components', async () => {
	show(
		[
			'<blockquote><p><span class="callout-marker" data-callout="warning" aria-hidden="true"></span> <strong>Mind it</strong></p><p>Body</p></blockquote>',
			'<pre><code class="language-ts">const a = 1;\n  indented</code></pre>',
			'<p><a href="/wiki/ada/">Ada</a> <a href="https://example.com/">out</a></p>',
			'<div class="svartz-embed" data-embed="ada"><p class="svartz-embed-source"><a href="/wiki/ada/">Ada</a></p></div>'
		].join('')
	);

	await expect.element(page.getByRole('button', { name: 'Copy code' })).toBeVisible();
	expect(target.querySelector('.sv-callout')?.getAttribute('data-callout')).toBe('warning');
	expect(target.querySelector('.sv-callout-title-text')?.textContent).toBe('Mind it');
	expect(target.querySelector('.sv-code pre code')?.textContent).toBe('const a = 1;\n  indented');
	expect(target.querySelector('.sv-embed a')?.classList.contains('sv-link-internal')).toBe(true);
	expect(target.querySelector('a[href="https://example.com/"]')?.classList.contains('sv-link-external')).toBe(true);
});

it('drops scripts, handlers and script URLs, as the build does', async () => {
	show('<p onclick="alert(1)">Safe<script>window.pwned = true</script><a href="javascript:alert(1)">x</a></p>');

	await expect.element(page.getByText('Safe')).toBeVisible();
	expect(target.querySelector('script')).toBeNull();
	expect(target.querySelector('p')?.hasAttribute('onclick')).toBe(false);
	expect(target.querySelector('a')?.hasAttribute('href')).toBe(false);
	expect('pwned' in window).toBe(false);
});

it('draws inline SVG, and HTML inside its foreignObject, in their own namespaces', async () => {
	show(
		'<p><svg width="100" height="100"><circle cx="50" cy="50" r="40"></circle><foreignObject width="100" height="20"><p>Label</p></foreignObject></svg></p>'
	);

	await expect.element(page.getByText('Label')).toBeVisible();
	const circle = target.querySelector('circle');
	expect(circle).toBeInstanceOf(SVGCircleElement);
	expect((circle as SVGCircleElement).getBBox().width).toBe(80);
	expect(target.querySelector('foreignObject p')?.namespaceURI).toBe('http://www.w3.org/1999/xhtml');
});

it('keeps HTML inside MathML text, as the HTML parser does', async () => {
	show('<p><math><mtext><span>Math text</span></mtext></math></p>');

	await expect.element(page.getByText('Math text')).toBeVisible();
	expect(target.querySelector('mtext')?.namespaceURI).toBe('http://www.w3.org/1998/Math/MathML');
	expect(target.querySelector('mtext span')?.namespaceURI).toBe('http://www.w3.org/1999/xhtml');
});

it('replaces what shows on each render', async () => {
	const view = show('<p>First</p>');
	await expect.element(page.getByText('First')).toBeVisible();

	view.render('<p>Second</p>');

	await expect.element(page.getByText('Second')).toBeVisible();
	expect(target.textContent).not.toContain('First');
	view.destroy();
	expect(target.textContent).toBe('');
});

it('keeps the blocks a render left unchanged, so a long page redraws only what changed', async () => {
	const view = show('<p>First</p><p>Kept</p>');
	await expect.element(page.getByText('Kept')).toBeVisible();
	const kept = page.getByText('Kept').element();

	view.render('<p>Inserted</p><p>First, edited</p><p>Kept</p>');

	await expect.element(page.getByText('Inserted')).toBeVisible();
	expect(page.getByText('Kept').element()).toBe(kept);
});
