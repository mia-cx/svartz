import { defineTheme } from '@svartz/core';
import { composeThemes, type ThemeBuildExtension } from '@svartz/theme-minimal';
import { blogIdentity, type BlogThemeConfig } from './manifest.js';

/** The blog's build extension: minimal's build plugins cover it. */
export const extensions: readonly ThemeBuildExtension[] = [blogIdentity];

export type { PostMeta } from './blog.js';
export type { BlogThemeConfig } from './manifest.js';

/** Node-safe manifest used by the build pipeline. */
export default defineTheme((config?: BlogThemeConfig) => composeThemes(extensions, config));
