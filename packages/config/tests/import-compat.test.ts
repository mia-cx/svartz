import { describe, it, expect } from "vitest";

/**
 * Import compatibility tests: verify that all tailwind and wrangler
 * schemas/types previously defined in @svartz/config are still
 * importable from @svartz/config after the move to @svartz/core.
 *
 * These guard against import-path breakage for existing consumers.
 */

describe("tailwind schema re-exports from config", () => {
  it("exports TailwindThemeConfigPropertyRecordSchema", async () => {
    const mod = await import("../src/schemas/tailwind");
    expect(mod.TailwindThemeConfigPropertyRecordSchema).toBeDefined();
  });

  it("exports TailwindThemeConfigSchema", async () => {
    const mod = await import("../src/schemas/tailwind");
    expect(mod.TailwindThemeConfigSchema).toBeDefined();
  });
});

describe("tailwind type re-exports from config", () => {
  it("re-exports TailwindThemeConfig type", async () => {
    const mod = await import("../src/types/tailwind");
    expect(mod).toBeDefined();
  });

  it("re-exports DefaultThemeOverrideHints type", async () => {
    const mod = await import("../src/types/tailwind");
    expect(mod).toBeDefined();
  });
});

describe("wrangler schema re-exports from config", () => {
  it("exports CustomDomainRouteSchema", async () => {
    const mod = await import("../src/schemas/wrangler");
    expect(mod.CustomDomainRouteSchema).toBeDefined();
  });

  it("exports ZoneIdRouteSchema", async () => {
    const mod = await import("../src/schemas/wrangler");
    expect(mod.ZoneIdRouteSchema).toBeDefined();
  });

  it("exports ZoneNameRouteSchema", async () => {
    const mod = await import("../src/schemas/wrangler");
    expect(mod.ZoneNameRouteSchema).toBeDefined();
  });

  it("exports WranglerRouteSchema", async () => {
    const mod = await import("../src/schemas/wrangler");
    expect(mod.WranglerRouteSchema).toBeDefined();
  });

  it("exports WranglerAssetsSchema", async () => {
    const mod = await import("../src/schemas/wrangler");
    expect(mod.WranglerAssetsSchema).toBeDefined();
  });

  it("exports WranglerBuildSchema", async () => {
    const mod = await import("../src/schemas/wrangler");
    expect(mod.WranglerBuildSchema).toBeDefined();
  });

  it("exports WranglerLimitsSchema", async () => {
    const mod = await import("../src/schemas/wrangler");
    expect(mod.WranglerLimitsSchema).toBeDefined();
  });

  it("exports WranglerObservabilitySchema", async () => {
    const mod = await import("../src/schemas/wrangler");
    expect(mod.WranglerObservabilitySchema).toBeDefined();
  });

  it("exports WranglerPlacementSchema", async () => {
    const mod = await import("../src/schemas/wrangler");
    expect(mod.WranglerPlacementSchema).toBeDefined();
  });

  it("exports WranglerTriggersSchema", async () => {
    const mod = await import("../src/schemas/wrangler");
    expect(mod.WranglerTriggersSchema).toBeDefined();
  });

  it("exports WranglerConfigFieldsSchema", async () => {
    const mod = await import("../src/schemas/wrangler");
    expect(mod.WranglerConfigFieldsSchema).toBeDefined();
  });

  it("exports WranglerEnvRecordSchema", async () => {
    const mod = await import("../src/schemas/wrangler");
    expect(mod.WranglerEnvRecordSchema).toBeDefined();
  });

  it("exports WranglerConfigSchema", async () => {
    const mod = await import("../src/schemas/wrangler");
    expect(mod.WranglerConfigSchema).toBeDefined();
  });
});

describe("wrangler type re-exports from config", () => {
  it("re-exports all wrangler types", async () => {
    const mod = await import("../src/types/wrangler");
    expect(mod).toBeDefined();
  });
});

describe("barrel exports from config index", () => {
  it("schemas barrel includes tailwind and wrangler", async () => {
    const schemas = await import("../src/schemas/index");
    expect(schemas.TailwindThemeConfigSchema).toBeDefined();
    expect(schemas.WranglerConfigSchema).toBeDefined();
  });

  it("types barrel includes tailwind and wrangler", async () => {
    const types = await import("../src/types/index");
    expect(types).toBeDefined();
  });
});
