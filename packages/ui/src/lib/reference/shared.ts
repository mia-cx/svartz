// What both reference entries export: metadata readers, nav helpers, and renderer types.
export { createReferenceTheme } from './theme.js';
export type { ReferenceRouteConfig, ReferenceThemeConfig, ReferenceThemeIdentity, ReferenceThemeModules } from './theme.js';
export { exampleFromSchema, readModel, readSchema, schemaLabel, type SchemaNode, type SchemaProperty } from './schema.js';
export { authLabel, readAuth, readSources, sourceLabel, type ReferenceAuth, type ReferenceSource } from './metadata.js';
export { filterReferenceNav, folderTrail, guideNavItem, navLinks, readingOrder, referenceNav } from './nav.js';
export type { ReferenceNavFolder, ReferenceNavLink, ReferenceNavSection, ReferenceNavStop } from './nav.js';
export {
	defineRenderer,
	referencePage,
	ReferencePageError,
	registerRenderers,
	rendererIdOf,
	SCHEMA_RENDERER,
	themeRegistry
} from './renderers.js';
export type {
	CodeTab,
	ReferenceBadge,
	ReferenceContext,
	ReferenceExamplesProps,
	ReferenceHue,
	ReferenceNavItem,
	ReferencePage,
	ReferencePageProps,
	ReferenceRegistry,
	ReferenceRenderer
} from './renderers.js';
