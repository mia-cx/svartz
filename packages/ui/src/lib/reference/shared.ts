// What both reference entries export: metadata readers and renderer types.
export type { ReferenceRouteConfig, ReferenceThemeConfig, ReferenceThemeIdentity, ReferenceVersionConfig } from './theme.js';
export { versionLinks, type ReferenceVersion, type VersionLink, type VersionStatus } from './versions.js';
export { exampleFromSchema, readModel, readSchema, schemaLabel, type SchemaNode, type SchemaProperty } from './schema.js';
export { authLabel, readAuth, readSources, sourceLabel, type ReferenceAuth, type ReferenceSource } from './metadata.js';
export { defineRenderer, readReferencePage, referenceContext, ReferencePageError, rendererIdOf, SCHEMA_RENDERER } from './renderers.js';
export type {
	CodeTab,
	ReferenceBadge,
	ReferenceContext,
	ReferenceExamplesProps,
	ReferenceHue,
	ReferenceNavItem,
	ReferencePageProps,
	ReferenceRenderer,
	ReferenceShell,
	ReferenceShellProps
} from './renderers.js';
