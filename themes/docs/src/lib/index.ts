import { defineTheme } from '@svartz/core';
import { composeThemes, type ThemeBuildExtension } from '@svartz/theme-minimal';
import { docsIdentity, type DocsThemeConfig } from './manifest.js';

/** The docs theme's build extension: it renders no graph or backlinks. */
export const extensions: readonly ThemeBuildExtension[] = [{ ...docsIdentity, capabilities: { graph: false, backlinks: false } }];

export type { DocSymbol, SymbolKind, SymbolMember, SymbolParameter } from './symbols.js';
export type { DocsThemeConfig } from './manifest.js';

/** Node-safe manifest used by the build pipeline. */
export default defineTheme((config?: DocsThemeConfig) => composeThemes(extensions, config));
