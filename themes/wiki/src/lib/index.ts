import { defineTheme } from '@svartz/core';
import { composeThemes, type MinimalThemeConfig, type ThemeBuildExtension } from '@svartz/theme-minimal';
import { wikiIdentity } from './manifest.js';

/** The wiki's Node-safe extension. It adds no build plugins of its own. */
export const extensions: readonly ThemeBuildExtension[] = [wikiIdentity];

export type { Infobox, InfoboxSection } from './wiki.js';

/** Node-safe manifest used by the build pipeline. */
export default defineTheme((config?: MinimalThemeConfig) => composeThemes(extensions, config));
