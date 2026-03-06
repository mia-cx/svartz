import { describe, expect, it } from "vitest";
import {
  matchThemeRoute,
  resolveThemeRouteToArtifactKey,
  type ThemeRouteDefinition,
} from "../src/index";

const routes: readonly ThemeRouteDefinition[] = [
  { id: "catchall", pattern: "/:slug" },
  { id: "home", pattern: "/" },
  { id: "tags", pattern: "/tags/:slug", layoutSlot: "tagPage" },
  { id: "static-about", pattern: "/about" },
  { id: "docs", pattern: "/docs/[...slug]", layoutSlot: "notePage" },
];

describe("matchThemeRoute", () => {
  it("prefers static routes over dynamic ones", () => {
    const match = matchThemeRoute(routes, { pathname: "/about" });
    expect(match?.route.id).toBe("static-about");
    expect(match?.artifactKey).toBe("pages/about.svelte");
  });

  it("matches the root route", () => {
    const match = matchThemeRoute(routes, { pathname: "/" });
    expect(match?.route.id).toBe("home");
    expect(match?.artifactKey).toBe("pages/index.svelte");
  });

  it("captures final :slug as the remaining path", () => {
    const match = matchThemeRoute(routes, { pathname: "/tags/api/rest" });
    expect(match?.route.id).toBe("tags");
    expect(match?.params.slug).toBe("api/rest");
    expect(match?.layoutSlot).toBe("tagPage");
    expect(match?.artifactKey).toBe("pages/api/rest.svelte");
  });

  it("supports explicit rest-style slug routes", () => {
    const match = matchThemeRoute(routes, {
      pathname: "/docs/guides/getting-started",
    });
    expect(match?.route.id).toBe("docs");
    expect(match?.params.slug).toBe("guides/getting-started");
    expect(match?.artifactKey).toBe("pages/guides/getting-started.svelte");
  });

  it("uses an explicit input slug for artifact resolution", () => {
    const key = resolveThemeRouteToArtifactKey(routes, {
      pathname: "/tags/api/rest",
      slug: "tags/api/rest",
    });
    expect(key).toBe("pages/tags/api/rest.svelte");
  });

  it("returns undefined when no route matches", () => {
    const match = matchThemeRoute([{ id: "only-home", pattern: "/" }], {
      pathname: "/missing",
    });
    expect(match).toBeUndefined();
  });

  it("honors explicit priority before specificity", () => {
    const priorityRoutes: readonly ThemeRouteDefinition[] = [
      { id: "generic", pattern: "/:slug" },
      { id: "preferred", pattern: "/:slug", priority: 10 },
    ];

    const match = matchThemeRoute(priorityRoutes, { pathname: "/hello" });
    expect(match?.route.id).toBe("preferred");
  });
});
