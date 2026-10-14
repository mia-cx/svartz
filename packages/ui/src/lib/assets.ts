/**
 * The published URL of an attachment named in a note's frontmatter (`cover: hero.jpg`,
 * `image: portrait.svg`); external URLs pass through. Undefined when the vault didn't
 * publish it. Resolves like the pipeline, which publishes attachments named by
 * top-level `image`, `cover`, and `socialImage`: relative to the note's file, then
 * from the vault root, then by a basename only one attachment has.
 */
export function assetHref(
	vault: { readonly routes: { readonly mountPath: string }; readonly assets: readonly { readonly path: string }[] },
	note: { readonly path: string },
	name: string
): string | undefined {
	if (/^[a-z]+:\/\//i.test(name)) return name;
	const byPath = new Map(vault.assets.map((asset) => [asset.path.toLowerCase(), asset.path]));
	const basename = (path: string) => path.slice(path.lastIndexOf('/') + 1).toLowerCase();
	// URL resolution normalises `./` and `../` against the note's folder.
	const resolved = new URL(name, `file:///${note.path}`).pathname.slice(1);
	let relative = resolved;
	try {
		relative = decodeURIComponent(resolved);
	} catch {
		// A literal `%` in a filename isn't an escape; keep the path as written.
	}
	const named = vault.assets.filter((asset) => basename(asset.path) === basename(name));
	const path =
		byPath.get(relative.toLowerCase()) ??
		byPath.get(name.replace(/^\/+/, '').toLowerCase()) ??
		(named.length === 1 ? named[0]!.path : undefined);
	return path ? `${vault.routes.mountPath}/${path}` : undefined;
}
