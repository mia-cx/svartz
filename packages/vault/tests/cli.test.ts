import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { runIndexCommand } from "../src/cli.js";

const BASIC_FIXTURE_PATH = resolve(__dirname, "fixtures/basic-vault");
const CONFIG_FIXTURE_PATH = resolve(__dirname, "fixtures/config-mode/svartz.config.mjs");

describe("runIndexCommand", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("indexes using config mode when a vault id is provided", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "svartz-vault-cli-"));
    const outputPath = join(tempDir, "config-mode-index.json");
    vi.stubEnv("SVARTZ_CONFIG", CONFIG_FIXTURE_PATH);

    try {
      await runIndexCommand("docs", {
        output: outputPath,
        include: ["inbox/**/*.md"],
        exclude: [],
        linkResolution: "absolute",
      });

      const raw = await readFile(outputPath, "utf-8");
      const index = JSON.parse(raw) as { notes: Array<{ path: string }> };

      expect(index.notes.length).toBeGreaterThan(0);
      expect(index.notes.every((note) => note.path.startsWith("projects/"))).toBe(
        true,
      );
      expect(
        index.notes.some((note) => note.path.startsWith("projects/svartz/")),
      ).toBe(false);
      expect(index.notes.some((note) => note.path.startsWith("inbox/"))).toBe(
        false,
      );
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("falls back to path mode when config is unavailable", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "svartz-vault-cli-"));
    const outputPath = join(tempDir, "path-mode-index.json");
    vi.stubEnv("SVARTZ_CONFIG", join(tempDir, "missing-config.mjs"));

    try {
      await runIndexCommand(BASIC_FIXTURE_PATH, {
        output: outputPath,
      });

      const raw = await readFile(outputPath, "utf-8");
      const index = JSON.parse(raw) as { notes: Array<{ path: string }> };
      expect(index.notes.length).toBeGreaterThan(0);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
