import { describe, it, expect } from "vitest";
import { Schema, Either, Effect } from "effect";
import {
  SvartzConfigSchema,
  VaultThemeConfigSchema,
  AnalyticsConfigSchema,
  PasswordGroupsSchema,
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

  it("accepts static mount paths and rejects traversal or dynamic segments", () => {
    const vault = { id: "blog", path: "vault", target: { type: "host" } };
    expect(Either.isRight(decode(SvartzConfigSchema, {
      version: "1.0.0", vaults: [{ ...vault, mountPath: "/blog/posts" }],
    }))).toBe(true);
    for (const mountPath of ["/blog/../private", "/blog/[slug]", "https://site.test/blog"]) {
      expect(Either.isLeft(decode(SvartzConfigSchema, {
        version: "1.0.0", vaults: [{ ...vault, mountPath }],
      }))).toBe(true);
    }
  });

  it("requires a public base URL and at least one date source for discovery", () => {
    const vault = { id: "blog", path: "vault", target: { type: "host" }, site: { title: "Blog" } };
    for (const url of ["https://example.com/?preview=1", "https://user@example.com/", "https://example.com/#draft"]) {
      expect(Either.isLeft(decode(SvartzConfigSchema, {
        version: "1.0.0", vaults: [{ ...vault, site: { ...vault.site, url } }],
      }))).toBe(true);
    }
    expect(Either.isLeft(decode(SvartzConfigSchema, {
      version: "1.0.0", vaults: [{ ...vault, discovery: { dateSources: [] } }],
    }))).toBe(true);
  });

  it("accepts local favicon sources and rejects remote sources", () => {
    const vault = { id: "blog", path: "vault", target: { type: "host" } };
    expect(Either.isRight(decode(SvartzConfigSchema, {
      version: "1.0.0", vaults: [{ ...vault, site: { title: "Blog", favicon: "./icon.webp" } }],
    }))).toBe(true);
    expect(Either.isLeft(decode(SvartzConfigSchema, {
      version: "1.0.0", vaults: [{ ...vault, site: { title: "Blog", favicon: "https://example.test/icon.png" } }],
    }))).toBe(true);
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

  it("preserves Giscus settings and requires a term for explicit mappings", () => {
    const result = decode(VaultThemeConfigSchema, {
      base: "@svartz/theme-minimal",
      comments: { repo: "mia/site", repoId: "R_1", category: "Notes", categoryId: "D_1", mapping: "specific", term: "journal", reactionsEnabled: false },
    });
    expect(Either.isRight(result)).toBe(true);
    if (Either.isRight(result) && typeof result.right !== "string") {
      expect(result.right.comments?.term).toBe("journal");
      expect(result.right.comments?.reactionsEnabled).toBe(false);
    }
    expect(Either.isLeft(decode(VaultThemeConfigSchema, {
      base: "@svartz/theme-minimal",
      comments: { repo: "mia/site", repoId: "R_1", category: "Notes", categoryId: "D_1", mapping: "number" },
    }))).toBe(true);
  });
});

describe("AnalyticsConfigSchema", () => {
  it.each([
    { provider: "plausible" },
    { provider: "google", tagId: "G-123" },
    { provider: "umami", websiteId: "abc" },
    { provider: "goatcounter", websiteId: "mia" },
    { provider: "posthog", apiKey: "phc_123" },
    { provider: "tinylytics", siteId: "abc" },
    { provider: "cabin" },
    { provider: "clarity", projectId: "abc" },
    { provider: "matomo", host: "https://stats.example.com", siteId: "1" },
    { provider: "vercel" },
    { provider: "rybbit", siteId: "abc" },
  ])("accepts $provider", (analytics) => {
    expect(Either.isRight(decode(AnalyticsConfigSchema, analytics))).toBe(true);
  });

  it("rejects invalid provider URLs and missing IDs", () => {
    expect(Either.isLeft(decode(AnalyticsConfigSchema, { provider: "matomo", host: "javascript:alert(1)", siteId: "1" }))).toBe(true);
    expect(Either.isLeft(decode(AnalyticsConfigSchema, { provider: "google" }))).toBe(true);
  });
});

describe("PasswordGroupsSchema", () => {
  it("accepts environment references but not plaintext passwords", () => {
    expect(Either.isRight(decode(PasswordGroupsSchema, {
      friends: { env: "SVARTZ_FRIENDS_PASSWORD" },
    }))).toBe(true);
    expect(Either.isRight(decode(PasswordGroupsSchema, {
      friends: { env: "PRIVATE_FRIENDS_PASSWORD" },
    }))).toBe(true);
    expect(Either.isLeft(decode(PasswordGroupsSchema, {
      friends: { password: "plaintext" },
    }))).toBe(true);
    expect(Either.isLeft(decode(PasswordGroupsSchema, {
      friends: { env: "bad-name" },
    }))).toBe(true);
    for (const env of ["PUBLIC_FRIENDS_PASSWORD", "VITE_FRIENDS_PASSWORD"]) {
      expect(Either.isLeft(decode(PasswordGroupsSchema, { friends: { env } }))).toBe(true);
    }
  });
});

describe("TargetConfigSchema", () => {
  it("accepts a host-owned SvelteKit adapter", () => {
    expect(Either.isRight(decode(TargetConfigSchema, { type: "host" }))).toBe(true);
  });

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
