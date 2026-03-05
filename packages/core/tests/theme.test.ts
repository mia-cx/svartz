import { describe, it, expect, vi } from "vitest";
import { defineTheme, validateTheme } from "../src/theme/define-theme";
import { ThemeValidationError } from "../src/theme/errors";
import { CONTRACT_VERSION } from "../src/theme/types";
import type { SvartzTheme, ThemeComponentLoader } from "../src/theme/types";

const stubLoader: ThemeComponentLoader = { default: {} };

function makeValidTheme(
  overrides?: Partial<SvartzTheme>,
): SvartzTheme {
  return {
    id: "test-theme",
    version: "0.1.0",
    contractVersion: CONTRACT_VERSION,
    layouts: {
      defaultPage: stubLoader,
      notePage: stubLoader,
    },
    routes: [{ id: "note", pattern: "/notes/:slug" }],
    ...overrides,
  };
}

describe("CONTRACT_VERSION", () => {
  it("is a semver string with major 1", () => {
    expect(CONTRACT_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(CONTRACT_VERSION.split(".")[0]).toBe("1");
  });
});

describe("validateTheme", () => {
  it("accepts a valid theme manifest", () => {
    expect(() => validateTheme(makeValidTheme())).not.toThrow();
  });

  it("throws when id is missing", () => {
    expect(() =>
      validateTheme(makeValidTheme({ id: "" })),
    ).toThrow(ThemeValidationError);
  });

  it("throws when version is missing", () => {
    expect(() =>
      validateTheme(makeValidTheme({ version: "" })),
    ).toThrow(ThemeValidationError);
  });

  it("throws when contractVersion is missing", () => {
    expect(() =>
      validateTheme(makeValidTheme({ contractVersion: "" })),
    ).toThrow(ThemeValidationError);
  });

  it("throws when contractVersion major does not match", () => {
    expect(() =>
      validateTheme(makeValidTheme({ contractVersion: "2.0.0" })),
    ).toThrow(/does not match expected/);
  });

  it("accepts matching major with different minor/patch", () => {
    expect(() =>
      validateTheme(makeValidTheme({ contractVersion: "1.5.3" })),
    ).not.toThrow();
  });

  it("throws when layouts is missing", () => {
    expect(() =>
      validateTheme({ ...makeValidTheme(), layouts: undefined } as never),
    ).toThrow(/layouts/);
  });

  it("throws when defaultPage layout slot is missing", () => {
    expect(() =>
      validateTheme(
        makeValidTheme({
          layouts: { notePage: stubLoader } as never,
        }),
      ),
    ).toThrow(/defaultPage/);
  });

  it("throws when notePage layout slot is missing", () => {
    expect(() =>
      validateTheme(
        makeValidTheme({
          layouts: { defaultPage: stubLoader } as never,
        }),
      ),
    ).toThrow(/notePage/);
  });

  it("throws when routes is empty", () => {
    expect(() => validateTheme(makeValidTheme({ routes: [] }))).toThrow(
      /at least one route/,
    );
  });

  it('throws when no route has id "note"', () => {
    expect(() =>
      validateTheme(
        makeValidTheme({
          routes: [{ id: "home", pattern: "/" }],
        }),
      ),
    ).toThrow(/id "note"/);
  });

  it("throws when note route pattern lacks :slug", () => {
    expect(() =>
      validateTheme(
        makeValidTheme({
          routes: [{ id: "note", pattern: "/notes/fixed" }],
        }),
      ),
    ).toThrow(/:slug/);
  });

  it("warns on unknown keys", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    validateTheme({ ...makeValidTheme(), customField: true } as never);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("unknown key"),
    );
    warnSpy.mockRestore();
  });

  it("does not warn for known optional keys", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    validateTheme(
      makeValidTheme({
        displayName: "My Theme",
        description: "A test theme",
        author: "test",
        homepage: "https://example.com",
        components: { callout: stubLoader },
        capabilities: { callouts: true },
        artifactRequirements: { index: true },
        pluginPreset: { plugins: [] },
        defaults: { brand: "blue" },
        hooks: {},
      }),
    );
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe("defineTheme", () => {
  it("accepts a static theme object", () => {
    const factory = defineTheme(makeValidTheme());
    const theme = factory();
    expect(theme.id).toBe("test-theme");
    expect(theme.version).toBe("0.1.0");
  });

  it("accepts a factory function", () => {
    const factory = defineTheme<{ brand: string }>((opts) =>
      makeValidTheme({
        id: "factory-theme",
        defaults: { brand: opts?.brand ?? "default" },
      }),
    );
    const theme = factory({ brand: "red" });
    expect(theme.id).toBe("factory-theme");
    expect(theme.defaults?.brand).toBe("red");
  });

  it("validates on each call", () => {
    const factory = defineTheme(() => makeValidTheme({ id: "" }));
    expect(() => factory()).toThrow(ThemeValidationError);
  });

  it("returns a fresh copy per call for static themes", () => {
    const base = makeValidTheme();
    const factory = defineTheme(base);
    const a = factory();
    const b = factory();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });

  it("supports lazy component loaders in layouts", () => {
    const lazyLoader: ThemeComponentLoader = () =>
      Promise.resolve({ default: {} });
    const factory = defineTheme(
      makeValidTheme({
        layouts: {
          defaultPage: lazyLoader,
          notePage: lazyLoader,
        },
      }),
    );
    const theme = factory();
    expect(typeof theme.layouts.defaultPage).toBe("function");
  });

  it("supports custom layout slots", () => {
    const factory = defineTheme(
      makeValidTheme({
        layouts: {
          defaultPage: stubLoader,
          notePage: stubLoader,
          customSlot: stubLoader,
        },
      }),
    );
    const theme = factory();
    expect(theme.layouts.customSlot).toBe(stubLoader);
  });

  it("includes pluginPreset in the theme manifest", () => {
    const factory = defineTheme(
      makeValidTheme({
        pluginPreset: {
          plugins: [
            {
              id: "theme-plugin",
              buildStart() {},
            },
          ],
        },
      }),
    );
    const theme = factory();
    expect(theme.pluginPreset?.plugins).toHaveLength(1);
    expect(theme.pluginPreset?.plugins?.[0]?.id).toBe("theme-plugin");
  });

  it("supports multiple routes beyond note", () => {
    const factory = defineTheme(
      makeValidTheme({
        routes: [
          { id: "note", pattern: "/notes/:slug" },
          { id: "tag", pattern: "/tags/:tag" },
          { id: "home", pattern: "/" },
        ],
      }),
    );
    const theme = factory();
    expect(theme.routes).toHaveLength(3);
  });
});
