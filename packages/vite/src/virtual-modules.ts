const SVARTZ_THEME_VIRTUAL_ID = "virtual:svartz/theme" as const;
const SVARTZ_ARTIFACTS_VIRTUAL_ID = "virtual:svartz/artifacts" as const;

const RESOLVED_THEME_VIRTUAL_ID = "\0svartz:theme" as const;
const RESOLVED_ARTIFACTS_VIRTUAL_ID = "\0svartz:artifacts" as const;

const THEME_PLACEHOLDER_SOURCE = [
  'export const theme = {',
  '  id: "svartz:theme-placeholder",',
  '  version: "0.0.0",',
  '  contractVersion: "1.0.0",',
  '  layouts: {},',
  '  routes: []',
  '};',
  'export const routes = [];',
  'export function resolveRuntimeRoute() {',
  '  return undefined;',
  '}',
  'export function resolveRouteToArtifactKey() {',
  '  return undefined;',
  '}',
].join("\n");

const ARTIFACTS_PLACEHOLDER_SOURCE = [
  'export const artifacts = new Map();',
  'export function hasNoteArtifact() {',
  '  return false;',
  '}',
  '',
  'export function getNoteArtifact(key) {',
  '  throw new Error(`[svartz:vite] note artifact "${key}" is not available yet`);',
  '}',
  'export const index = { version: "0.0.0", entries: [], graph: {}, backlinks: {}, search: [], tags: [], folders: [], routes: { notes: [], tags: [], folders: [], feed: [], all: [] }, assets: [] };',
  'export const graph = index.graph;',
  'export const backlinks = index.backlinks;',
  'export const search = index.search;',
  'export const tags = index.tags;',
  'export const folders = index.folders;',
  'export const routes = index.routes;',
  'export const assets = index.assets;',
  'export const searchDocuments = [];',
  'export const searchIndex = { documentCount: 0, nextId: 0, storedFields: {}, fieldIds: {}, fieldLength: {}, averageFieldLength: {}, index: [], serializationVersion: 2 };',
  'export const themeConfig = {};',
  'export const siteConfig = { title: "Svartz" };',
].join("\n");

type SvartzVirtualModuleId =
  | typeof SVARTZ_THEME_VIRTUAL_ID
  | typeof SVARTZ_ARTIFACTS_VIRTUAL_ID;

type ResolvedSvartzVirtualModuleId =
  | typeof RESOLVED_THEME_VIRTUAL_ID
  | typeof RESOLVED_ARTIFACTS_VIRTUAL_ID;

function resolveVirtualModuleId(
  id: string,
): ResolvedSvartzVirtualModuleId | undefined {
  switch (id) {
    case SVARTZ_THEME_VIRTUAL_ID:
      return RESOLVED_THEME_VIRTUAL_ID;
    case SVARTZ_ARTIFACTS_VIRTUAL_ID:
      return RESOLVED_ARTIFACTS_VIRTUAL_ID;
    default:
      return undefined;
  }
}

function loadVirtualModule(id: string): string | undefined {
  switch (id) {
    case RESOLVED_THEME_VIRTUAL_ID:
      return THEME_PLACEHOLDER_SOURCE;
    case RESOLVED_ARTIFACTS_VIRTUAL_ID:
      return ARTIFACTS_PLACEHOLDER_SOURCE;
    default:
      return undefined;
  }
}

export {
  RESOLVED_ARTIFACTS_VIRTUAL_ID,
  RESOLVED_THEME_VIRTUAL_ID,
  SVARTZ_ARTIFACTS_VIRTUAL_ID,
  SVARTZ_THEME_VIRTUAL_ID,
  loadVirtualModule,
  resolveVirtualModuleId,
};
export type { ResolvedSvartzVirtualModuleId, SvartzVirtualModuleId };
