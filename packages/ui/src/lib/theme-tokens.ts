import { isRecord } from './theme-settings.js';

/** A token value for both colour schemes, or one per scheme. */
export type ThemeTokenValue = string | { readonly light: string; readonly dark: string };

/**
 * The vault's `theme.tokens`: any design token by name, with or without the
 * `--sv-` prefix (`accent`, `paper`, `radius-m`, `--sv-font-sans`). Config wins
 * over the theme's own tokens, which win over the Svartz defaults.
 */
export type ThemeTokens = Readonly<Record<string, ThemeTokenValue>>;

const NAME = /^[a-z][a-z0-9-]*$/;
// A value can't close the declaration, the rule, or the <style> element it lands in.
const UNSAFE_VALUE = /[;{}<>\\]/;

const safe = (value: unknown): value is string =>
	typeof value === 'string' && value.trim() !== '' && !UNSAFE_VALUE.test(value);

function tokenValue(value: unknown): string | undefined {
	if (safe(value)) return value.trim();
	if (isRecord(value) && safe(value.light) && safe(value.dark)) {
		return `light-dark(${value.light.trim()}, ${value.dark.trim()})`;
	}
	return undefined;
}

/**
 * The CSS for `theme.tokens`, or nothing when there are none. The selector is
 * `html:root` so it outranks the `:root` rules in the Svartz defaults and in
 * every theme. Names and values that could escape the rule are dropped.
 */
export function themeTokenCss(tokens: unknown): string | undefined {
	if (!isRecord(tokens)) return undefined;
	const declarations = Object.entries(tokens).flatMap(([rawName, rawValue]) => {
		const name = rawName.replace(/^--(sv-)?/, '');
		const value = tokenValue(rawValue);
		return NAME.test(name) && value ? [`--sv-${name}:${value}`] : [];
	});
	return declarations.length > 0 ? `html:root{${declarations.join(';')}}` : undefined;
}
