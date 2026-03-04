import { describe, it, expect } from "vitest";
import { Schema, Either, Effect } from "effect";
import {
  SvartzConfigSchema,
  VaultThemeConfigSchema,
  TargetConfigSchema,
  LinkResolutionStrategySchema,
} from "../src/schema.js";

const decode = <A, I>(schema: Schema.Schema<A, I>, input: unknown) =>
  Effect.runSync(
    Schema.decodeUnknown(schema)(input).pipe(Effect.either),
  );

describe("SvartzConfigSchema", () => {
  it("decodes a valid full config", () => {
    const result = decode(SvartzConfigSchema, {
      version: "1.0.0",
      workspace: { rootDir: "." },
      defaults: {
        vault: {
          include: ["**/*.md"],
          exclude: [],
          linkResolution: "closest",
          theme: { base: "@svartz/theme-minimal", colors: { brand: "red" } },
          frontmatter: { titleField: "name" },
        },
        build: { concurrency: 5, maxRetries: 2 },
      },
      vaults: [
        {
          id: "docs",
          path: "vaults/docs",
          target: { type: "pages", projectName: "docs" },
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
  it("accepts worker target", () => {
    const result = decode(TargetConfigSchema, {
      type: "worker",
      name: "my-worker",
      routes: ["/api/*"],
    });
    expect(Either.isRight(result)).toBe(true);
  });

  it("accepts pages target", () => {
    const result = decode(TargetConfigSchema, {
      type: "pages",
      projectName: "my-pages",
    });
    expect(Either.isRight(result)).toBe(true);
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
