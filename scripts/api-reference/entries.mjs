import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

/**
 * @typedef {object} EntryPoint
 * @property {string} packageName `@svartz/plugins`
 * @property {string} packageDir Repository-relative package directory, `packages/plugins`.
 * @property {string} subpath The export key without its `./`: `""` for the root, `content` for `./content`.
 * @property {string} types Absolute path of the entry's `.d.ts`.
 * @property {string} description The package's `description`.
 */

const isPublic = (manifest) => !manifest.private && manifest.exports !== undefined;

/**
 * Every typed entry point of every published package under `dirs`: one per `exports` key with a `types` condition.
 * CSS and other untyped exports are skipped, and so are declaration files that aren't modules. Packages come dependencies first, so a symbol a package re-exports from
 * another is documented where it is declared.
 * @param {string} root
 * @param {readonly string[]} [dirs]
 * @returns {EntryPoint[]}
 */
export function readEntryPoints(root, dirs = ['packages', 'themes']) {
	const manifests = dirs
		.flatMap((dir) => readdirSync(join(root, dir), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => join(root, dir, entry.name)))
		.filter((dir) => existsSync(join(dir, 'package.json')))
		.map((dir) => ({ dir, manifest: JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) }))
		.filter(({ manifest }) => isPublic(manifest))
		.sort((left, right) => left.manifest.name.localeCompare(right.manifest.name));

	return dependenciesFirst(manifests).flatMap(({ dir, manifest }) =>
		Object.entries(manifest.exports).flatMap(([key, target]) => {
			const types = typeof target === 'object' && target !== null ? target.types : undefined;
			if (typeof types !== 'string') return [];
			const path = join(dir, types);
			if (!existsSync(path)) throw new Error(`${manifest.name} exports ${key} with types ${types}, which doesn't exist. Run \`pnpm build\` first.`);
			// `virtual-modules` entries only declare ambient `virtual:svartz/*` modules for Vite; they export nothing.
			if (!ts.isExternalModule(ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest))) return [];
			return [{
				packageName: manifest.name,
				packageDir: relative(root, dir),
				subpath: key.replace(/^\.\/?/, ''),
				types: path,
				description: manifest.description ?? ''
			}];
		})
	);
}

/** Packages ordered so each comes after the workspace packages it depends on. */
function dependenciesFirst(packages) {
	const byName = new Map(packages.map((entry) => [entry.manifest.name, entry]));
	const ordered = [];
	const visit = (entry, path = new Set()) => {
		if (ordered.includes(entry) || path.has(entry)) return;
		path.add(entry);
		const { dependencies = {}, peerDependencies = {} } = entry.manifest;
		for (const name of Object.keys({ ...dependencies, ...peerDependencies })) {
			const dependency = byName.get(name);
			if (dependency) visit(dependency, path);
		}
		ordered.push(entry);
	};
	for (const entry of packages) visit(entry);
	return ordered;
}
