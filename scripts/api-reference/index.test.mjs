import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { generate, splitDefault, writeNotes } from './index.mjs';

const fixture = fileURLToPath(new URL('./fixture', import.meta.url));
const DIR = 'reference/api';

/** Every Markdown file under `dir`, vault-folder relative. */
const files = (dir) => readdirSync(dir, { recursive: true }).filter((file) => file.endsWith('.md')).map((file) => file.split('\\').join('/')).sort();

/** A note's frontmatter: the generator writes each value as JSON. */
function frontmatter(path) {
	const [, block] = /^---\n([\s\S]*?)\n---/.exec(readFileSync(path, 'utf8'));
	return Object.fromEntries(block.split('\n').map((line) => [line.slice(0, line.indexOf(':')), JSON.parse(line.slice(line.indexOf(':') + 2))]));
}

describe('the API reference generator', () => {
	let vault;
	let out;
	before(async () => {
		vault = mkdtempSync(join(tmpdir(), 'svartz-api-reference-'));
		out = join(vault, DIR);
		await generate({ root: fixture, vault, dir: DIR, dirs: ['packages'], tsconfig: join(fixture, 'tsconfig.json') });
	});
	after(() => rmSync(vault, { recursive: true, force: true }));

	it('writes a note per exported symbol of every public typed entry point, and a folder note per entry point', () => {
		assert.deepEqual(files(out), [
			'alpha/Options.md',
			'alpha/SiteSettings.md',
			'alpha/ThemeSettings-interface.md',
			'alpha/extra-variable.md',
			'alpha/extra/Result.md',
			'alpha/extra/index.md',
			'alpha/index.md',
			'alpha/plugin.md',
			'alpha/themeSettings-function.md',
			'beta/BetaConfig.md',
			'beta/index.md',
			'index.md'
		]);
	});

	it('links a type to its note by vault path, across entry points and packages', () => {
		assert.deepEqual(frontmatter(join(out, 'beta/BetaConfig.md')).symbol.extends, ['[[reference/api/alpha/Options|Options]]']);
		assert.equal(frontmatter(join(out, 'alpha/plugin.md')).symbol.returns.type, '[[reference/api/alpha/extra/Result|Result]]');
		assert.equal(frontmatter(join(out, 'alpha/themeSettings-function.md')).symbol.returns.type, '[[reference/api/alpha/ThemeSettings-interface|ThemeSettings]]');
	});

	it('documents a constant holding a function as a function', () => {
		const { symbol } = frontmatter(join(out, 'alpha/plugin.md'));
		assert.equal(symbol.kind, 'function');
		assert.deepEqual(symbol.parameters, [{ name: 'options', type: '[[reference/api/alpha/Options|Options]]', optional: true }]);
	});

	it('lists every option field, nested ones too, with its default and description', () => {
		const rows = frontmatter(join(out, 'alpha/Options.md')).symbol.members.map(({ name, default: value, description }) => ({ name, default: value, description }));
		assert.deepEqual(rows, [
			{ name: 'key', default: '`"p"`', description: 'The key that starts it.' },
			{ name: 'times', default: '`3`', description: 'How often it runs.' },
			{ name: 'signIn', default: undefined, description: 'Sign-in settings.' },
			{ name: 'signIn.required', default: '`false`', description: 'Refuse anonymous readers.' }
		]);
	});

	// The config types are `Schema.Schema.Type<typeof …Schema>`: their fields exist only once TypeScript resolves them.
	it('lists the fields of a type alias derived from another type, with their defaults and descriptions', () => {
		const rows = frontmatter(join(out, 'alpha/SiteSettings.md')).symbol.members.map(({ name, signature, default: value, description }) => ({ name, signature, default: value, description }));
		assert.deepEqual(rows, [
			{ name: 'title', signature: 'title?: string', default: '`"Untitled"`', description: "The site's title." },
			{ name: 'url', signature: 'url: string', default: undefined, description: 'Where it publishes.' },
			// An optional `unknown` stays `unknown`, and only `undefined` leaves an optional type.
			{ name: 'extra', signature: 'extra?: unknown', default: undefined, description: 'Anything a plugin wants.' },
			// A nested object lists its fields under their path.
			{ name: 'social', signature: 'social?: { … }', default: undefined, description: 'Link previews.' },
			{ name: 'social.image', signature: 'image?: string | null', default: undefined, description: 'The preview image.' },
			// Rows of fields can't show a named type's link, extra keys or a `null`, so those keep their full type.
			{ name: 'theme', signature: 'theme?: [[reference/api/alpha/ThemeSettings-interface|ThemeSettings]]', default: undefined, description: 'A named type keeps its link.' },
			{ name: 'meta', signature: 'meta?: { readonly [key: string]: string; }', default: undefined, description: 'Extra keys keep their index signature.' },
			{ name: 'preview', signature: 'preview?: { image: string; } | null', default: undefined, description: '`null` keeps its place beside the object.' }
		]);
	});

	it("links a symbol to where its package's source declares it", () => {
		assert.match(frontmatter(join(out, 'alpha/plugin.md')).symbol.source, /^https:\/\/github\.com\/example\/fixture\/blob\/[^/]+\/packages\/alpha\/src\/plugin\.ts#L3$/);
	});

	it('names symbols in the description without linking them, since descriptions also fill meta tags', () => {
		assert.equal(frontmatter(join(out, 'alpha/Options.md')).description, 'How `plugin` behaves.');
	});

	it('fails with a clear message when a package is not built', async () => {
		const empty = mkdtempSync(join(tmpdir(), 'svartz-api-reference-unbuilt-'));
		try {
			const packages = join(empty, 'packages', 'unbuilt');
			mkdirSync(packages, { recursive: true });
			writeFileSync(join(packages, 'package.json'), JSON.stringify({ name: '@fixture/unbuilt', exports: { '.': { types: './dist/index.d.ts' } } }));
			await assert.rejects(generate({ root: empty, vault: empty, dir: DIR, dirs: ['packages'] }), /Run `pnpm build` first/);
		} finally {
			rmSync(empty, { recursive: true, force: true });
		}
	});
});

it('replaces the folder, so a removed export leaves no stale note', () => {
	const out = mkdtempSync(join(tmpdir(), 'svartz-api-reference-stale-'));
	try {
		writeFileSync(join(out, 'Removed.md'), '');
		writeNotes(out, [{ path: 'alpha/Kept.md', content: '' }]);
		assert.deepEqual(files(out), ['alpha/Kept.md']);
	} finally {
		rmSync(out, { recursive: true, force: true });
	}
});

it('reads the default a description states', () => {
	const cases = [
		// [description, @defaultValue tag, expected]
		['The key. Default: `"p"`.', undefined, { description: 'The key.', default: '`"p"`' }],
		['The branch. Default: the repository\'s default branch.', undefined, { description: 'The branch.', default: "the repository's default branch" }],
		['Base URL. Defaults to `"/"`.', undefined, { description: 'Base URL.', default: '`"/"`' }],
		// Mid-sentence: read, but the description keeps its clause.
		['Folder pages. Default `"folders"`; `"reference"` reads well.', undefined, { description: 'Folder pages. Default `"folders"`; `"reference"` reads well.', default: '`"folders"`' }],
		// A qualified default stays prose.
		['The token. Default, unless `app` is set: `{ env: "TOKEN" }`.', undefined, { description: 'The token. Default, unless `app` is set: `{ env: "TOKEN" }`.', default: undefined }],
		// "Default" starting other prose is not a default.
		['Default themes extend it.', undefined, { description: 'Default themes extend it.', default: undefined }],
		// A tag wins.
		['Times. Default: twice.', '`3`', { description: 'Times. Default: twice.', default: '`3`' }]
	];
	for (const [description, tagged, expected] of cases) assert.deepEqual(splitDefault(description, tagged), expected, description);
});
