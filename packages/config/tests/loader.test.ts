import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  loadConfig,
  parseConfig,
  ConfigNotFound,
  ConfigImportFailed,
  ConfigDecodeFailed,
} from "../src/index";

const FIXTURES = resolve(__dirname, "fixtures/configs");
const temporaryDirectories: string[] = [];

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

  it("accepts site metadata on a vault", async () => {
    const result = await parseConfig({
      version: "1.0.0",
      vaults: [
        {
          id: "blog",
          path: "blog",
          target: { type: "static" },
          site: {
            title: "Patch Notes",
            description: "Writing by Mia",
            url: "https://example.com",
            author: "Mia",
            image: "/social.png",
          },
        },
      ],
    });

    expect(result.vaults[0]!.site).toEqual({
      title: "Patch Notes",
      description: "Writing by Mia",
      url: "https://example.com",
      author: "Mia",
      image: "/social.png",
    });
  });

  it("accepts a site URL without a title", async () => {
    const result = await parseConfig({
      version: "1.0.0",
      vaults: [{ id: "blog", path: "blog", target: { type: "static" }, site: { url: "https://example.com" } }],
    });
    expect(result.vaults[0]!.site).toEqual({ url: "https://example.com" });
  });

  it.each(["example.com", "ftp://example.com", "/blog", "not a url"])(
    "rejects non-HTTP site URL %s",
    async (url) => {
      await expect(
        parseConfig({
          version: "1.0.0",
          vaults: [
            {
              id: "blog",
              path: "blog",
              target: { type: "static" },
              site: { title: "Patch Notes", url },
            },
          ],
        }),
      ).rejects.toThrow(ConfigDecodeFailed);
    },
  );

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
  afterEach(async () => {
    vi.unstubAllEnvs();
    await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
  });

  it.each(["mjs", "js", "ts"])("reloads an edited .%s config", async (extension) => {
    const directory = await mkdtemp(join(tmpdir(), "svartz-config-reload-"));
    temporaryDirectories.push(directory);
    if (extension === "js") await writeFile(join(directory, "package.json"), '{"type":"module"}');
    const configPath = join(directory, `svartz.config.${extension}`);
    const source = (id: string) => `export default { version: "1.0.0", vaults: [{ id: "${id}", path: ".", target: { type: "static" } }] };`;

    await writeFile(configPath, source("first"));
    expect((await loadConfig(configPath)).vaults[0]!.id).toBe("first");
    await writeFile(configPath, source("second"));
    expect((await loadConfig(configPath)).vaults[0]!.id).toBe("second");
  });

  it("keeps CommonJS .js configuration loading", async () => {
    const directory = await mkdtemp(join(tmpdir(), "svartz-cjs-config-"));
    temporaryDirectories.push(directory);
    const configPath = join(directory, "svartz.config.js");
    await writeFile(configPath, 'module.exports = { version: "1.0.0", vaults: [{ id: "cjs", path: ".", target: { type: "static" } }] };');
    expect((await loadConfig(configPath)).vaults[0]!.id).toBe("cjs");
  });

  it("keeps top-level await in .mjs configuration", async () => {
    const directory = await mkdtemp(join(tmpdir(), "svartz-async-config-"));
    temporaryDirectories.push(directory);
    const configPath = join(directory, "svartz.config.mjs");
    await writeFile(configPath, 'export default await Promise.resolve({ version: "1.0.0", vaults: [{ id: "async", path: ".", target: { type: "static" } }] });');
    expect((await loadConfig(configPath)).vaults[0]!.id).toBe("async");
  });

  it("loads a valid .mjs config file", async () => {
    const configPath = resolve(FIXTURES, "valid-minimal.mjs");
    const config = await loadConfig(configPath);
    expect(config.configDir).toBe(FIXTURES);
    expect(config.vaults).toHaveLength(1);
    expect(config.vaults[0]!.id).toBe("main");
  });

  it("loads TypeScript config files on the supported Node baseline", async () => {
    const config = await loadConfig(resolve(FIXTURES, "valid-typescript.ts"));
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
