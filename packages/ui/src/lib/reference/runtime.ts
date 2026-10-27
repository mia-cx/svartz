/**
 * Runtime entry for reference themes: the renderer building blocks (schema
 * trees, code panels, endpoint bars), the schema renderer, and
 * `referenceExtension`, which turns renderers into a theme-minimal extension
 * with the reference frame and top bar.
 */
export * from './shared.js';
export { referenceChrome, referenceExtension, referenceRenderer, type ReferencePageRenderer } from './adapter.js';
export { schemaRenderer } from './schema-renderer.js';
export { default as AuthSummary } from './AuthSummary.svelte';
export { default as Badge } from './Badge.svelte';
export { default as CodePanel } from './CodePanel.svelte';
export { default as EndpointBar } from './EndpointBar.svelte';
export { default as ReferenceBody } from './ReferenceBody.svelte';
export { default as ReferenceExamples } from './ReferenceExamples.svelte';
export { default as ReferenceFrame } from './ReferenceFrame.svelte';
export { default as ReferenceSection } from './ReferenceSection.svelte';
export { default as ReferenceTopBar } from './ReferenceTopBar.svelte';
export { default as SchemaTree } from './SchemaTree.svelte';
export { default as SourceLinks } from './SourceLinks.svelte';
