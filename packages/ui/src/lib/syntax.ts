/**
 * Build-time only: import from a theme's Node manifest, never from browser code.
 *
 * Replaces the core syntax plugin (same id) with Shiki's css-variables theme, so
 * code colours come from the `--shiki-*` tokens in prose.css and follow the
 * colour mode without a second highlighting pass.
 */
import { transformSyntax } from '@svartz/plugins';
import { createCssVariablesTheme } from 'shiki';

type SyntaxTheme = NonNullable<Parameters<typeof transformSyntax>[0]>['theme'];

// rehype-pretty-code types its theme against its own Shiki copy; the shapes match.
const svartzCodeTheme = createCssVariablesTheme({
	name: 'svartz',
	variablePrefix: '--shiki-',
	variableDefaults: {},
	fontStyle: true
}) as SyntaxTheme;

/** The syntax plugin for a first-party theme's `pluginPreset`. */
export const svartzSyntax = () => transformSyntax({ theme: svartzCodeTheme, keepBackground: false });
