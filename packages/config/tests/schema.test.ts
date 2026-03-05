import { describe, it, expect } from "vitest";
import { Schema, Either, Effect } from "effect";
import {
  SvartzConfigSchema,
  VaultThemeConfigSchema,
  TargetConfigSchema,
  LinkResolutionStrategySchema,
} from "../src/schemas";

const decode = <A, I>(schema: Schema.Schema<A, I>, input: unknown) =>
  Effect.runSync(
    Schema.decodeUnknown(schema)(input).pipe(Effect.either),
  );

describe("SvartzConfigSchema", () => {
  it("decodes a valid full config", () => {
    const result = decode(SvartzConfigSchema, {
      version: "1.0.0",
      defaults: {
        include: ["**/*.md"],
        exclude: [],
        linkResolution: "closest",
        theme: { base: "@svartz/theme-minimal", colors: { brand: "red" } },
        frontmatter: { titleField: "name" },
      },
      build: { concurrency: 5, maxRetries: 2 },
      vaults: [
        {
          id: "docs",
          path: "vaults/docs",
          target: { type: "static" },
        },
      ],
    });
    expect(Either.isRight(result)).toBe(true);
  });

  it("decodes a minimal config (only required fields)", () => {
    const result = decode(SvartzConfigSchema, {
      version: "1.0.0",
      vaults: [
        { id: "main", path: "vault", target: { type: "static" } },
      ],
    });
    expect(Either.isRight(result)).toBe(true);
  });

  it("rejects missing vaults field", () => {
    const result = decode(SvartzConfigSchema, { version: "1.0.0" });
    expect(Either.isLeft(result)).toBe(true);
  });

  it("rejects missing version field", () => {
    const result = decode(SvartzConfigSchema, {
      vaults: [{ id: "a", path: "b", target: { type: "static" } }],
    });
    expect(Either.isLeft(result)).toBe(true);
  });

  it("rejects non-semver version", () => {
    const result = decode(SvartzConfigSchema, {
      version: 2,
      vaults: [{ id: "a", path: "b", target: { type: "static" } }],
    });
    expect(Either.isLeft(result)).toBe(true);
  });

  it("rejects invalid semver format", () => {
    const result = decode(SvartzConfigSchema, {
      version: "not-semver",
      vaults: [{ id: "a", path: "b", target: { type: "static" } }],
    });
    expect(Either.isLeft(result)).toBe(true);
  });

  it("accepts semver with pre-release and build metadata", () => {
    const result = decode(SvartzConfigSchema, {
      version: "1.2.3-beta.1+build.42",
      vaults: [{ id: "a", path: "b", target: { type: "static" } }],
    });
    expect(Either.isRight(result)).toBe(true);
  });

  it("accepts $schema field", () => {
    const result = decode(SvartzConfigSchema, {
      $schema: "https://example.com/schema.json",
      version: "1.0.0",
      vaults: [{ id: "a", path: "b", target: { type: "static" } }],
    });
    expect(Either.isRight(result)).toBe(true);
  });

  it("accepts optional plugins on defaults (shallow, shape TBD)", () => {
    const result = decode(SvartzConfigSchema, {
      version: "1.0.0",
      defaults: { plugins: [] },
      vaults: [{ id: "a", path: "b", target: { type: "static" } }],
    });
    expect(Either.isRight(result)).toBe(true);
    const withEntries = decode(SvartzConfigSchema, {
      version: "1.0.0",
      defaults: { plugins: [{ name: "default-plugin" }] },
      vaults: [{ id: "a", path: "b", target: { type: "static" } }],
    });
    expect(Either.isRight(withEntries)).toBe(true);
  });

  it("accepts optional plugins on vault (shallow, shape TBD)", () => {
    const result = decode(SvartzConfigSchema, {
      version: "1.0.0",
      vaults: [
        {
          id: "a",
          path: "b",
          target: { type: "static" },
          plugins: [{ name: "vault-plugin" }],
        },
      ],
    });
    expect(Either.isRight(result)).toBe(true);
  });
});

describe("VaultThemeConfigSchema", () => {
  it("accepts a string theme", () => {
    const result = decode(VaultThemeConfigSchema, "@svartz/theme-minimal");
    expect(Either.isRight(result)).toBe(true);
    if (Either.isRight(result)) {
      expect(result.right).toBe("@svartz/theme-minimal");
    }
  });

  it("accepts an object theme with base and overrides", () => {
    const result = decode(VaultThemeConfigSchema, {
      base: "@svartz/theme-docs",
      colors: { accent: "oklch(0.74 0.16 190)" },
    });
    expect(Either.isRight(result)).toBe(true);
  });

  it("rejects object theme without base", () => {
    const result = decode(VaultThemeConfigSchema, {
      colors: { accent: "red" },
    });
    expect(Either.isLeft(result)).toBe(true);
  });
});

describe("TargetConfigSchema", () => {
  it("accepts cloudflare-workers target with wrangler Route shapes (string, ZoneNameRoute)", () => {
    const result = decode(TargetConfigSchema, {
      type: "cloudflare-workers",
      name: "my-worker",
      routes: ["/api/*", { pattern: "sub.example.com/*", zone_name: "example.com" }],
    });
    expect(Either.isRight(result)).toBe(true);
  });

  it("accepts cloudflare-workers target with ZoneIdRoute and CustomDomainRoute", () => {
    const result = decode(TargetConfigSchema, {
      type: "cloudflare-workers",
      name: "my-worker",
      routes: [
        { pattern: "*.example.com/*", zone_id: "abc123" },
        { pattern: "app.example.com/*", custom_domain: true },
      ],
    });
    expect(Either.isRight(result)).toBe(true);
  });

  it("accepts cloudflare-workers target with wrangler env fields (main, assets, compatibility_date)", () => {
    const result = decode(TargetConfigSchema, {
      type: "cloudflare-workers",
      name: "web",
      main: ".svelte-kit/cloudflare/_worker.js",
      assets: { directory: ".svelte-kit/cloudflare", binding: "ASSETS" },
      compatibility_date: "2026-03-03",
      compatibility_flags: ["nodejs_compat"],
      observability: { enabled: true },
    });
    expect(Either.isRight(result)).toBe(true);
  });

  it("accepts cloudflare-workers target with only type (all env fields optional)", () => {
    const result = decode(TargetConfigSchema, { type: "cloudflare-workers" });
    expect(Either.isRight(result)).toBe(true);
  });

  it("accepts cloudflare-pages target (projectName optional)", () => {
    expect(Either.isRight(decode(TargetConfigSchema, { type: "cloudflare-pages" }))).toBe(true);
    expect(
      Either.isRight(
        decode(TargetConfigSchema, {
          type: "cloudflare-pages",
          projectName: "my-docs",
        }),
      ),
    ).toBe(true);
  });

  it("accepts static target", () => {
    const result = decode(TargetConfigSchema, { type: "static" });
    expect(Either.isRight(result)).toBe(true);
  });

  it("accepts node target", () => {
    const result = decode(TargetConfigSchema, { type: "node" });
    expect(Either.isRight(result)).toBe(true);
  });

  it("rejects unknown target type", () => {
    const result = decode(TargetConfigSchema, { type: "lambda" });
    expect(Either.isLeft(result)).toBe(true);
  });
});

describe("LinkResolutionStrategySchema", () => {
  it.each(["closest", "shallowest", "absolute"])("accepts '%s'", (strategy) => {
    const result = decode(LinkResolutionStrategySchema, strategy);
    expect(Either.isRight(result)).toBe(true);
  });

  it("rejects invalid strategy", () => {
    const result = decode(LinkResolutionStrategySchema, "random");
    expect(Either.isLeft(result)).toBe(true);
  });
});
