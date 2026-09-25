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
  import type { Graph, Index } from "@svartz/core";

  export interface RuntimeArtifactRecord {
    readonly key: string;
    readonly path: string;
    readonly type: string;
    readonly noteSlug?: string;
  }

  export const artifacts: ReadonlyMap<string, RuntimeArtifactRecord>;
  export function hasNoteArtifact(key: string): boolean;
  export function getNoteArtifact(
    key: string,
  ): { default: unknown };
  export const index: Index;
  export const graph: Graph;
  export const backlinks: Index["backlinks"];
  export const search: Index["entries"];
  export const themeConfig: Readonly<Record<string, unknown>>;
  export const siteConfig: Readonly<{
    title: string;
    description?: string;
    url?: string;
    author?: string;
    image?: string;
  }>;
}
