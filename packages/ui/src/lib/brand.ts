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

/** The Svartz mark: an ink block with a vermilion proof mark. The default favicon. */
export const SVARTZ_MARK_SVG =
	'<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">' +
	`<rect x="18" y="18" width="40" height="40" rx="4" fill="${ACCENT}"/>` +
	`<rect x="6" y="6" width="44" height="44" rx="4" fill="${INK}"/>` +
	'</svg>';

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
  <rect x="84" y="86" width="26" height="26" rx="2" fill="${ACCENT}"/>
  <rect x="78" y="80" width="26" height="26" rx="2" fill="${INK}"/>
  <text x="128" y="101" fill="${MUTED}" font-family="monospace" font-size="24" letter-spacing="2">${escapeXml(siteTitle.toUpperCase().slice(0, 48))}</text>
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
