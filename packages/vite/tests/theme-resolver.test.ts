import { describe, expect, it } from "vitest";
import { createThemeVirtualModuleSource } from "../src/theme-resolver";

describe("@svartz/vite theme bridge", () => {
  it("builds a virtual theme module that re-exports the real theme package", () => {
    const source = createThemeVirtualModuleSource("@svartz/theme-minimal");

    expect(source).toContain('import * as themeModule from "@svartz/theme-minimal";');
    expect(source).toContain(
      'import { matchThemeRoute, resolveThemeRouteToArtifactKey } from "@svartz/core";',
    );
    expect(source).toContain("export const theme = themeModule.default ?? themeModule.theme ?? themeModule;");
    expect(source).toContain("return matchThemeRoute(routes, input);");
    expect(source).toContain("return resolveThemeRouteToArtifactKey(routes, input);");
  });
});
