import { describe, expect, it } from 'vitest';
import { themeTokenCss } from './theme-tokens.js';

describe('themeTokenCss', () => {
	it('writes config tokens as custom properties that outrank theme :root rules', () => {
		expect(
			themeTokenCss({
				accent: 'oklch(0.62 0.19 250)',
				'--sv-radius-m': '4px',
				paper: { light: 'oklch(0.99 0 0)', dark: 'oklch(0.14 0 0)' }
			})
		).toBe(
			'html:root{--sv-accent:oklch(0.62 0.19 250);--sv-radius-m:4px;--sv-paper:light-dark(oklch(0.99 0 0), oklch(0.14 0 0))}'
		);
	});

	it('drops names and values that could escape the rule, and returns nothing when empty', () => {
		expect(themeTokenCss({ 'bad name': 'red', accent: 'red;}body{display:none', ink: '</style>' })).toBeUndefined();
		expect(themeTokenCss(undefined)).toBeUndefined();
	});
});
