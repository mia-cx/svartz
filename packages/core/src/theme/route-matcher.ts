import type { ThemeRouteDefinition } from "./types";

interface RuntimeRouteInput {
  readonly pathname: string;
  readonly slug?: string;
}

interface RuntimeRouteMatch {
  readonly route: ThemeRouteDefinition;
  readonly pathname: string;
  readonly params: {
    readonly slug?: string;
  };
  readonly layoutSlot?: string;
  readonly artifactKey?: string;
}

interface ParsedPattern {
  readonly route: ThemeRouteDefinition;
  readonly pattern: string;
  readonly segments: readonly string[];
  readonly priority: number;
  readonly staticCount: number;
  readonly dynamicCount: number;
  readonly restCount: number;
}

function normalizePathname(pathname: string): string {
  const [pathWithoutQuery] = pathname.split(/[?#]/, 1);
  const normalized = pathWithoutQuery && pathWithoutQuery.length > 0
    ? pathWithoutQuery
    : "/";

  if (normalized === "/") return normalized;
  return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
}

function splitPath(pathname: string): string[] {
  const normalized = normalizePathname(pathname);
  if (normalized === "/") return [];
  return normalized.slice(1).split("/").filter((segment) => segment.length > 0);
}

function isSlugSegment(segment: string): boolean {
  return segment === ":slug" || segment === "[slug]" || segment === "[...slug]";
}

function parsePattern(route: ThemeRouteDefinition): ParsedPattern {
  const segments = splitPath(route.pattern);
  let staticCount = 0;
  let dynamicCount = 0;
  let restCount = 0;

  for (const segment of segments) {
    if (segment === "[...slug]") {
      restCount += 1;
      continue;
    }

    if (isSlugSegment(segment)) {
      dynamicCount += 1;
      continue;
    }

    staticCount += 1;
  }

  return {
    route,
    pattern: normalizePathname(route.pattern),
    segments,
    priority: route.priority ?? 0,
    staticCount,
    dynamicCount,
    restCount,
  };
}

function compareParsedPatterns(left: ParsedPattern, right: ParsedPattern): number {
  if (left.priority !== right.priority) {
    return right.priority - left.priority;
  }

  if (left.staticCount !== right.staticCount) {
    return right.staticCount - left.staticCount;
  }

  if (left.dynamicCount !== right.dynamicCount) {
    return left.dynamicCount - right.dynamicCount;
  }

  if (left.restCount !== right.restCount) {
    return left.restCount - right.restCount;
  }

  if (left.segments.length !== right.segments.length) {
    return right.segments.length - left.segments.length;
  }

  return left.pattern.localeCompare(right.pattern);
}

function matchParsedPattern(
  parsed: ParsedPattern,
  pathname: string,
): RuntimeRouteMatch | undefined {
  const pathnameSegments = splitPath(pathname);
  const params: { slug?: string } = {};

  let routeIndex = 0;
  let pathIndex = 0;

  while (routeIndex < parsed.segments.length) {
    const segment = parsed.segments[routeIndex]!;
    const isFinalSegment = routeIndex === parsed.segments.length - 1;

    if (segment === "[...slug]") {
      params.slug = pathnameSegments.slice(pathIndex).join("/");
      pathIndex = pathnameSegments.length;
      routeIndex += 1;
      continue;
    }

    if (segment === ":slug" || segment === "[slug]") {
      if (isFinalSegment) {
        const captured = pathnameSegments.slice(pathIndex).join("/");
        if (captured.length === 0) return undefined;
        params.slug = captured;
        pathIndex = pathnameSegments.length;
      } else {
        const captured = pathnameSegments[pathIndex];
        if (!captured) return undefined;
        params.slug = captured;
        pathIndex += 1;
      }

      routeIndex += 1;
      continue;
    }

    const candidate = pathnameSegments[pathIndex];
    if (candidate !== segment) return undefined;

    pathIndex += 1;
    routeIndex += 1;
  }

  if (pathIndex !== pathnameSegments.length) {
    return undefined;
  }

  return {
    route: parsed.route,
    pathname: normalizePathname(pathname),
    params,
    layoutSlot: parsed.route.layoutSlot,
  };
}

function getArtifactStem(input: RuntimeRouteInput, match: RuntimeRouteMatch): string {
  const slug = input.slug ?? match.params.slug;
  if (slug && slug.length > 0) return slug;
  if (match.pathname === "/") return "index";
  return match.pathname.slice(1);
}

function matchThemeRoute(
  routes: readonly ThemeRouteDefinition[],
  input: RuntimeRouteInput,
): RuntimeRouteMatch | undefined {
  const pathname = normalizePathname(input.pathname);
  const sortedRoutes = [...routes].map(parsePattern).sort(compareParsedPatterns);

  for (const parsed of sortedRoutes) {
    const match = matchParsedPattern(parsed, pathname);
    if (!match) continue;

    return {
      ...match,
      artifactKey: `pages/${getArtifactStem(input, match)}.svelte`,
    };
  }

  return undefined;
}

function resolveThemeRouteToArtifactKey(
  routes: readonly ThemeRouteDefinition[],
  input: RuntimeRouteInput,
): string | undefined {
  return matchThemeRoute(routes, input)?.artifactKey;
}

export {
  matchThemeRoute,
  normalizePathname,
  resolveThemeRouteToArtifactKey,
};
export type { RuntimeRouteInput, RuntimeRouteMatch };
