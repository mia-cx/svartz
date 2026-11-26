/**
 * Svartz brand assets as plain strings, safe to import from Node (theme
 * manifests) and the browser. Hex values mirror the tokens in `tokens.css`
 * because image converters may not read OKLCH.
 */
import type { SocialImageMetadata } from '@svartz/core';

const INK = '#120f0b';
const PAPER = '#fbfaf7';
const MUTED = '#6d6861';
const ACCENT = '#de3f20';

/** The mark's shapes, in a 107×128 viewBox: Svelte's logo, as `sv create` ships it, until Svartz has a mark of its own. */
const MARK_PATHS =
	'<path d="M94.157 22.819c-10.4-14.885-30.94-19.297-45.792-9.835L22.282 29.608A29.92 29.92 0 0 0 8.764 49.65a31.5 31.5 0 0 0 3.108 20.231 30 30 0 0 0-4.477 11.183 31.9 31.9 0 0 0 5.448 24.116c10.402 14.887 30.942 19.297 45.791 9.835l26.083-16.624A29.92 29.92 0 0 0 98.235 78.35a31.53 31.53 0 0 0-3.105-20.232 30 30 0 0 0 4.474-11.182 31.88 31.88 0 0 0-5.447-24.116" style="fill:#ff3e00"/>' +
	'<path d="M45.817 106.582a20.72 20.72 0 0 1-22.237-8.243 19.17 19.17 0 0 1-3.277-14.503 18 18 0 0 1 .624-2.435l.49-1.498 1.337.981a33.6 33.6 0 0 0 10.203 5.098l.97.294-.09.968a5.85 5.85 0 0 0 1.052 3.878 6.24 6.24 0 0 0 6.695 2.485 5.8 5.8 0 0 0 1.603-.704L69.27 76.28a5.43 5.43 0 0 0 2.45-3.631 5.8 5.8 0 0 0-.987-4.371 6.24 6.24 0 0 0-6.698-2.487 5.7 5.7 0 0 0-1.6.704l-9.953 6.345a19 19 0 0 1-5.296 2.326 20.72 20.72 0 0 1-22.237-8.243 19.17 19.17 0 0 1-3.277-14.502 17.99 17.99 0 0 1 8.13-12.052l26.081-16.623a19 19 0 0 1 5.3-2.329 20.72 20.72 0 0 1 22.237 8.243 19.17 19.17 0 0 1 3.277 14.503 18 18 0 0 1-.624 2.435l-.49 1.498-1.337-.98a33.6 33.6 0 0 0-10.203-5.1l-.97-.294.09-.968a5.86 5.86 0 0 0-1.052-3.878 6.24 6.24 0 0 0-6.696-2.485 5.8 5.8 0 0 0-1.602.704L37.73 51.72a5.42 5.42 0 0 0-2.449 3.63 5.79 5.79 0 0 0 .986 4.372 6.24 6.24 0 0 0 6.698 2.486 5.8 5.8 0 0 0 1.602-.704l9.952-6.342a19 19 0 0 1 5.295-2.328 20.72 20.72 0 0 1 22.237 8.242 19.17 19.17 0 0 1 3.277 14.503 18 18 0 0 1-8.13 12.053l-26.081 16.622a19 19 0 0 1-5.3 2.328" style="fill:#fff"/>';

/** The default favicon. A placeholder until Svartz has its own mark: Svelte's logo, as `sv create` ships it. */
export const SVARTZ_MARK_SVG =
	`<svg xmlns="http://www.w3.org/2000/svg" width="107" height="128" viewBox="0 0 107 128">${MARK_PATHS}</svg>`;

const escapeXml = (value: string) =>
	value.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);

/** Break a title into at most `lines` lines of about `width` characters, on word boundaries. */
function wrap(text: string, width: number, lines: number): string[] {
	const result: string[] = [];
	let line = '';
	for (const word of text.split(/\s+/)) {
		if (line && `${line} ${word}`.length > width) {
			result.push(line);
			line = word;
		} else line = line ? `${line} ${word}` : word;
	}
	if (line) result.push(line);
	if (result.length > lines) {
		result.length = lines;
		result[lines - 1] = `${result[lines - 1]!.replace(/\s+\S*$/, '')}…`;
	}
	return result;
}

/** The 1200×630 social preview shared by first-party themes. */
export function svartzSocialImage({ title, description, siteTitle }: SocialImageMetadata): string {
	const titleLines = wrap(title, 24, 3);
	const titleY = 330 - (titleLines.length - 1) * 42;
	return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="${PAPER}"/>
  <svg x="78" y="78" width="27" height="32" viewBox="0 0 107 128">${MARK_PATHS}</svg>
  <text x="128" y="101" fill="${MUTED}" font-family="monospace" font-size="24">${escapeXml(siteTitle.toUpperCase().slice(0, 48))}</text>
  ${titleLines
		.map(
			(line, index) =>
				`<text x="78" y="${titleY + index * 84}" fill="${INK}" font-family="Georgia, serif" font-size="76" font-weight="600">${escapeXml(line)}</text>`
		)
		.join('\n  ')}
  <text x="78" y="${titleY + titleLines.length * 84 + 18}" fill="${MUTED}" font-family="sans-serif" font-size="30">${escapeXml((description ?? '').slice(0, 72))}</text>
  <rect x="78" y="548" width="96" height="6" fill="${ACCENT}"/>
</svg>`;
}
