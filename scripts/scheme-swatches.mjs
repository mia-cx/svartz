// Draw each shipped colour scheme as an SVG swatch for the docs: `node scripts/scheme-swatches.mjs` after building
// @svartz/config. Rerun it whenever a scheme in packages/config/src/schemes.ts changes.
import { mkdirSync, writeFileSync } from 'node:fs';
import { colorSchemes } from '../packages/config/dist/schemes.js';

const out = new URL('../vaults/docs/attachments/schemes/', import.meta.url);
const FONT = 'system-ui, -apple-system, Segoe UI, sans-serif';
const WIDTH = 280;
const HEIGHT = 128;

/** One mode's panel: a heading, body text, muted text, a link, a highlight, the accent, and the background steps. */
const NAMES = {
	catppuccin: 'Catppuccin',
	'rose-pine': 'Rosé Pine',
	nord: 'Nord',
	gruvbox: 'Gruvbox',
	'tokyo-night': 'Tokyo Night',
	dracula: 'Dracula',
	solarized: 'Solarized',
	everforest: 'Everforest',
};

function panel(name, scheme, mode, x) {
	const c = (token) => scheme[token][mode];
	const chips = ['surface', 'sunken', 'rule', 'rule-strong']
		.map((token, index) => `<rect x="${x + 20 + index * 22}" y="104" width="16" height="10" rx="2" fill="${c(token)}"/>`)
		.join('');
	return `<g font-family="${FONT}">
<rect x="${x}" width="${WIDTH}" height="${HEIGHT}" rx="10" fill="${c('paper')}"/>
<text x="${x + 20}" y="40" font-size="26" font-weight="700" fill="${c('ink')}">Aa</text>
<circle cx="${x + 70}" cy="31" r="7" fill="${c('accent')}"/>
<text x="${x + WIDTH - 20}" y="28" font-size="11" text-anchor="end" fill="${c('muted')}">${NAMES[name]} · ${mode}</text>
<text x="${x + 20}" y="66" font-size="14" fill="${c('text')}">Body text with a <tspan fill="${c('accent-text')}" text-decoration="underline">link</tspan></text>
<rect x="${x + 20}" y="77" width="56" height="18" rx="2" fill="${c('mark')}"/>
<text x="${x + 24}" y="90" font-size="13" fill="${c('text')}">marked</text>
<text x="${x + 84}" y="90" font-size="13" fill="${c('muted')}">and muted text</text>
${chips}
</g>`;
}

mkdirSync(out, { recursive: true });
for (const [name, scheme] of Object.entries(colorSchemes)) {
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH * 2 + 8}" height="${HEIGHT}" viewBox="0 0 ${WIDTH * 2 + 8} ${HEIGHT}">
${panel(name, scheme, 'light', 0)}
${panel(name, scheme, 'dark', WIDTH + 8)}
</svg>
`;
	writeFileSync(new URL(`${name}.svg`, out), svg);
}
