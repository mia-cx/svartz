declare module "virtual:svartz/theme" {
  import type { SvartzTheme, ThemeRouteDefinition } from "@svartz/core";

  export const theme: SvartzTheme;
  export const routes: readonly ThemeRouteDefinition[];
  export function resolveRuntimeRoute(input: {
    pathname: string;
    slug?: string;
  }):
    | {
        route: ThemeRouteDefinition;
        layoutSlot?: string;
        artifactKey?: string;
      }
    | undefined;
  export function resolveRouteToArtifactKey(input: {
    pathname: string;
    slug?: string;
  }): string | undefined;
}

declare module "virtual:svartz/artifacts" {
  import type { ProtectedGroupPayload } from "@svartz/core";
  import type { Graph, Index, VaultView } from "@svartz/core";

  export interface RuntimeArtifactRecord {
    readonly key: string;
    readonly path: string;
    readonly type: string;
    readonly noteSlug?: string;
  }

  export const artifacts: ReadonlyMap<string, RuntimeArtifactRecord>;
  export const browserResources: Readonly<Record<string, string>>;
  export function loadProtectedBridgeUrls(ids: readonly string[]): Promise<Readonly<Record<string, string>>>;
  export function hasNoteArtifact(key: string): boolean;
  export function getNoteArtifact(
    key: string,
  ): { default: unknown; svartzProtected?: { slug: string; payloadId: string; payloadPath: string } };
  export const index: Index;
  export const vault: VaultView;
  export const searchOptions: typeof import("@svartz/core").SEARCH_INDEX_OPTIONS;
  export const graph: Graph;
  export const backlinks: Index["backlinks"];
  export const search: Index["search"];
  export const tags: Index["tags"];
  export const folders: Index["folders"];
  export const routes: Index["routes"];
  export const assets: Index["assets"];
  export const searchDocuments: Index["search"];
  export const searchIndex: unknown;
  export function createUnlockedVault(groups: readonly ProtectedGroupPayload[]): {
    index: Index;
    vault: VaultView;
    searchDocuments: Index["search"];
    searchIndex: unknown;
  };
  export const themeConfig: Readonly<Record<string, unknown>>;
  export const siteConfig: Readonly<{
    title: string;
    description?: string;
    url?: string;
    author?: string;
    image?: string;
  }>;
}

declare module "virtual:svartz/host" {
  export const vaults: readonly {
    readonly id: string;
    readonly mountPath: string;
    readonly artifacts: typeof import("virtual:svartz/artifacts");
    readonly theme: typeof import("virtual:svartz/theme");
  }[];
  export const routes: {
    readonly all: readonly string[];
    readonly redirects: Readonly<Record<string, string>>;
  };
  export function resolveHostVault(pathname: string): typeof vaults[number] | undefined;
}
