import * as artifacts from './runtime-artifacts';
import * as theme from './runtime-theme';

export const vaults = [{ id: 'test', mountPath: '', artifacts, theme }];
export const routes = { all: artifacts.routes.all, redirects: artifacts.routes.redirects };

export function resolveHostVault(pathname: string) {
	return pathname.startsWith('/') ? vaults[0] : undefined;
}

export async function prepareHostVault(pathname: string) {
	return resolveHostVault(pathname);
}
