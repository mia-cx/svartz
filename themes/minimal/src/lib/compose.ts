import type { SvartzPlugin, SvartzTheme } from '@svartz/core';
import type { ThemeBuildExtension, ThemeExtension } from './extension.js';
import { createMinimalTheme, type MinimalThemeConfig, type MinimalThemeModules } from './manifest.js';
import type { Composition } from './select.js';

/** Minimal itself: the extension every composition falls back to. */
export const minimalExtension: ThemeExtension = { id: '@svartz/theme-minimal', name: 'minimal', displayName: 'Svartz Minimal' };

/** Who a composed theme is. Defaults to the first extension's identity. */
export interface ThemeIdentity {
	readonly id: string;
	readonly displayName?: string;
	readonly description?: string;
	readonly version?: string;
}

/** Where a composed runtime manifest keeps its composition for the layout. */
const COMPOSITION = 'svartz:composition';

/** The composition a runtime manifest carries; minimal alone for any other manifest. */
export function compositionOf(theme: Pick<SvartzTheme, 'hooks'> | undefined): Composition {
	const composition = theme?.hooks?.[COMPOSITION] as Composition | undefined;
	return composition ?? { primary: minimalExtension, extensions: [minimalExtension] };
}

/** The extensions in order, minimal last unless listed, so `theme: minimal` always resolves. */
const withMinimal = <T extends { id: string }>(extensions: readonly T[], minimal: T): T[] =>
	extensions.some((extension) => extension.id === minimal.id) ? [...extensions] : [...extensions, minimal];

/** The manifest's identity fields the composed theme sets; unset ones keep minimal's. */
const identityOf = (extensions: readonly ThemeIdentity[], identity?: ThemeIdentity) => {
	const source = identity ?? extensions[0]!;
	return Object.fromEntries(
		Object.entries({ id: source.id, displayName: source.displayName, description: source.description, version: source.version }).filter(([, value]) => value !== undefined)
	);
};

/** Plugins in order, one per id: a later plugin with the same id replaces an earlier one, as in the pipeline. */
const mergePlugins = (plugins: readonly SvartzPlugin[]) =>
	[...new Map(plugins.map((plugin, index) => ['id' in plugin && typeof plugin.id === 'string' ? plugin.id : index, plugin])).values()];

/**
 * A runtime manifest for these themes on theme-minimal's shell. The first
 * theme styles the site; every theme renders the pages it claims.
 */
export function composeRuntimeTheme(
	modules: MinimalThemeModules,
	extensions: readonly ThemeExtension[],
	config?: MinimalThemeConfig,
	identity?: ThemeIdentity
): SvartzTheme {
	const ordered = withMinimal(extensions, minimalExtension);
	const composition: Composition = { primary: ordered[0]!, extensions: ordered };
	const components = Object.fromEntries(
		[...ordered].reverse().flatMap((extension) => Object.entries(extension.components ?? {}).map(([name, component]) => [name, { default: component }]))
	);
	const base = createMinimalTheme({ ...modules, components: { ...modules.components, ...components } }, config);
	return { ...base, ...identityOf(ordered, identity), hooks: { [COMPOSITION]: composition } };
}

/** The build manifest for the same themes: minimal's routes with every theme's build plugins. */
export function composeBuildTheme(
	modules: MinimalThemeModules,
	extensions: readonly ThemeBuildExtension[],
	config?: MinimalThemeConfig,
	identity?: ThemeIdentity
): SvartzTheme {
	const ordered = withMinimal(extensions, { id: minimalExtension.id });
	const plugins = mergePlugins([...(modules.plugins ?? []), ...ordered.flatMap((extension) => extension.plugins ?? [])]);
	const base = createMinimalTheme({ ...modules, plugins }, config);
	const capabilities = Object.assign({}, base.capabilities, ...ordered.map((extension) => extension.capabilities ?? {}));
	return { ...base, ...identityOf(ordered, identity), capabilities };
}
