// Build manifest: every reference theme has the same routes, so it needs no renderers.
import { referenceTheme } from '@svartz/ui/reference';

/** @param {import('@svartz/ui/reference').ReferenceThemeConfig} [config] */
export default (config) => referenceTheme({ id: '@svartz/showcase-reference-theme', displayName: 'Harbour developer docs' }, config);
