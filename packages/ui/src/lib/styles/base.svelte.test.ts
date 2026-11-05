import { afterEach, describe, expect, it } from 'vitest';
import './base.css';

afterEach(() => {
	document.documentElement.removeAttribute('style');
	document.querySelector('[data-svartz-site]')?.remove();
});

describe('base.css element defaults', () => {
	it('leave a host page that shows a note body in its own design alone', () => {
		document.documentElement.style.setProperty('--sv-paper', 'rgb(1, 2, 3)');
		expect(getComputedStyle(document.documentElement).backgroundColor).not.toBe('rgb(1, 2, 3)');
		expect(getComputedStyle(document.body).backgroundColor).not.toBe('rgb(1, 2, 3)');
	});

	it("style a page the theme's site layout renders", () => {
		document.documentElement.style.setProperty('--sv-paper', 'rgb(1, 2, 3)');
		const marker = document.createElement('a');
		marker.dataset.svartzSite = '';
		document.body.append(marker);
		expect(getComputedStyle(document.documentElement).backgroundColor).toBe('rgb(1, 2, 3)');
		expect(getComputedStyle(document.body).backgroundColor).toBe('rgb(1, 2, 3)');
		expect(getComputedStyle(document.body).margin).toBe('0px');
	});
});
