/**
 * The published URL of an attachment named in frontmatter (`cover: hero.jpg`,
 * `image: portrait.svg`); external URLs pass through. Undefined when the vault
 * didn't publish it. The pipeline publishes attachments named by top-level
 * `image`, `cover`, and `socialImage`.
 */
export function assetHref(
	vault: { readonly routes: { readonly mountPath: string }; readonly assets: readonly { readonly path: string }[] },
	name: string
): string | undefined {
	if (/^[a-z]+:\/\//i.test(name)) return name;
	const clean = name.replace(/^\.?\//, '');
	const asset = vault.assets.find((candidate) => candidate.path === clean || candidate.path.endsWith(`/${clean}`));
	return asset ? `${vault.routes.mountPath}/${asset.path}` : undefined;
}
