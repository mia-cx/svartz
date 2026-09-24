import type { VaultView } from '@svartz/core';

/** The URL of a tag's page, including the mount path, for tags the index knows or not. */
export const tagHrefFor = (vault: VaultView) => (tag: string) =>
	vault.tags.find((candidate) => candidate.slug === tag)?.href ?? `${vault.routes.mountPath}/tags/${tag}/`;
