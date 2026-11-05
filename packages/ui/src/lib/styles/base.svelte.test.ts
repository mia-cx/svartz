import { afterEach, describe, expect, it } from 'vitest';
import './base.css';

afterEach(() => {
	document.documentElement.removeAttribute('style');
	delete document.documentElement.dataset.svartzHostPage;
	document.querySelector('[data-svartz-note-content]')?.remove();
});

describe('base.css element defaults', () => {
	it('style a page that renders through a Svartz theme, its layout marked or not', () => {
		document.documentElement.style.setProperty('--sv-paper', 'rgb(1, 2, 3)');
		expect(getComputedStyle(document.documentElement).backgroundColor).toBe('rgb(1, 2, 3)');
		expect(getComputedStyle(document.body).backgroundColor).toBe('rgb(1, 2, 3)');
		expect(getComputedStyle(document.body).margin).toBe('0px');
	});

	it('leave a host page that shows a note body in its own design alone', () => {
		document.documentElement.style.setProperty('--sv-paper', 'rgb(1, 2, 3)');
		const body = document.createElement('div');
		body.dataset.svartzNoteContent = '';
		document.body.append(body);
		expect(getComputedStyle(document.documentElement).backgroundColor).not.toBe('rgb(1, 2, 3)');
		expect(getComputedStyle(document.body).backgroundColor).not.toBe('rgb(1, 2, 3)');
	});

	it('leave the host page alone after the note body has gone', () => {
		document.documentElement.style.setProperty('--sv-paper', 'rgb(1, 2, 3)');
		document.documentElement.dataset.svartzHostPage = '';
		expect(getComputedStyle(document.documentElement).backgroundColor).not.toBe('rgb(1, 2, 3)');
		expect(getComputedStyle(document.body).backgroundColor).not.toBe('rgb(1, 2, 3)');
	});
});
