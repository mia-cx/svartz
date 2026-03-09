import { describe, it, expect, vi, afterEach } from "vitest";
import { resolve } from "node:path";
import {
  loadConfig,
  parseConfig,
  ConfigNotFound,
  ConfigImportFailed,
  ConfigDecodeFailed,
} from "../src/index";

const FIXTURES = resolve(__dirname, "fixtures/configs");

describe("parseConfig", () => {
  it("decodes a valid raw object", async () => {
    const result = await parseConfig({
      version: "1.0.0",
      vaults: [{ id: "a", path: "b", target: { type: "static" } }],
    });
    expect(result.version).toBe("1.0.0");
    expect(result.vaults).toHaveLength(1);
  });

  it("throws ConfigDecodeFailed on invalid object", async () => {
    await expect(parseConfig({ version: "1.0.0" })).rejects.toThrow(
      ConfigDecodeFailed,
    );
    try {
      await parseConfig({ version: "1.0.0" });
    } catch (e) {
      expect(e).toBeInstanceOf(ConfigDecodeFailed);
      expect((e as ConfigDecodeFailed)._tag).toBe("ConfigDecodeFailed");
      expect((e as ConfigDecodeFailed).issues.length).toBeGreaterThan(0);
    }
  });

  it("throws ConfigDecodeFailed on wrong major version", async () => {
    await expect(
      parseConfig({
        version: "2.0.0",
        vaults: [{ id: "a", path: "b", target: { type: "static" } }],
      }),
    ).rejects.toThrow(ConfigDecodeFailed);
  });

  it("accepts compatible minor/patch versions", async () => {
    const result = await parseConfig({
      version: "1.5.3",
      vaults: [{ id: "a", path: "b", target: { type: "static" } }],
    });
    expect(result.version).toBe("1.5.3");
  });
});

describe("loadConfig", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("loads a valid .mjs config file", async () => {
    const configPath = resolve(FIXTURES, "valid-minimal.mjs");
    const config = await loadConfig(configPath);
    expect(config.configDir).toBe(FIXTURES);
    expect(config.vaults).toHaveLength(1);
    expect(config.vaults[0]!.id).toBe("main");
  });

  it("loads a full config with defaults and multiple vaults", async () => {
    const configPath = resolve(FIXTURES, "valid-full.mjs");
    const config = await loadConfig(configPath);
    expect(config.vaults).toHaveLength(2);
    // Defaults are merged into each vault; docs vault gets file defaults for include/exclude
    expect(config.vaults[0]!.include).toEqual(["**/*.md"]);
    expect(config.vaults[0]!.exclude).toEqual([
      ".trash/**",
      "**/.trash/**",
      "archive/**",
    ]);
  });

  it("throws ConfigNotFound for missing file", async () => {
    const bad = resolve(FIXTURES, "nonexistent.mjs");
    await expect(loadConfig(bad)).rejects.toThrow(ConfigNotFound);
    try {
      await loadConfig(bad);
    } catch (e) {
      expect((e as ConfigNotFound)._tag).toBe("ConfigNotFound");
      expect((e as ConfigNotFound).searchPath).toBe(bad);
    }
  });

  it("throws ConfigDecodeFailed for wrong version", async () => {
    const configPath = resolve(FIXTURES, "invalid-version.mjs");
    await expect(loadConfig(configPath)).rejects.toThrow(ConfigDecodeFailed);
  });

  it("throws ConfigDecodeFailed for missing vaults", async () => {
    const configPath = resolve(FIXTURES, "missing-vaults.mjs");
    await expect(loadConfig(configPath)).rejects.toThrow(ConfigDecodeFailed);
  });

  it("throws ConfigDecodeFailed for bad target type", async () => {
    const configPath = resolve(FIXTURES, "bad-target.mjs");
    await expect(loadConfig(configPath)).rejects.toThrow(ConfigDecodeFailed);
  });

  it("respects SVARTZ_CONFIG env var", async () => {
    const configPath = resolve(FIXTURES, "valid-minimal.mjs");
    vi.stubEnv("SVARTZ_CONFIG", configPath);
    const config = await loadConfig();
    expect(config.vaults[0]!.id).toBe("main");
  });

  it("throws ConfigNotFound when SVARTZ_CONFIG points to missing file", async () => {
    vi.stubEnv("SVARTZ_CONFIG", "/tmp/nonexistent-svartz-config.mjs");
    await expect(loadConfig()).rejects.toThrow(ConfigNotFound);
  });
});
