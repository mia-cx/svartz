import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getCompilerContributions, type Index, type PluginContext, type ResolvedConfig } from "@svartz/core";
import { emitArtifacts } from "../src/emit-artifacts";
import { transformGfm } from "../src/transform-gfm";
import { transformLatex } from "../src/transform-latex";
import { transformSyntax } from "../src/transform-syntax";
import { analytics } from "../src/analytics";

const content = [
  "# Features",
  "",
  "~~old~~ and $x^2$",
  "",
  "```ts",
  "const answer = 42;",
  "```",
].join("\n");

function context(outDir: string, noteContent = content, overrides: Partial<ResolvedConfig> = {}): PluginContext {
  const config = { outDir, ...overrides } as ResolvedConfig;
  const index = {
    version: "1.0.0",
    entries: [],
    graph: {},
    backlinks: {},
    search: [],
    tags: [],
    folders: [],
    routes: { notes: [], tags: [], folders: [], all: [] },
    assets: [],
  } as unknown as Index;
  return {
    config,
    files: [{ path: "note.md", slug: "note", extension: ".md", content: noteContent }],
    artifacts: new Map(),
    index,
    meta: new Map(),
  };
}

describe("compiler contributions", () => {
  it("renders math and highlighted code only when their hooks run", async () => {
    const root = await mkdtemp(join(tmpdir(), "svartz-compiler-"));
    try {
      const enabled = context(join(root, "enabled/dist"));
      transformGfm().transformGfm!.run(enabled);
      transformSyntax({ theme: "github-light" }).transformSyntax!.run(enabled);
      transformLatex().transformLatex!.run(enabled);
      await emitArtifacts().emitArtifacts!.run(enabled);

      const enabledPage = String(enabled.artifacts.get("pages/note.svelte")?.contents);
      expect(enabledPage).toContain("<del>old</del>");
      expect(enabledPage).toContain("katex");
      expect(enabledPage).toContain("data-rehype-pretty-code-figure");
      expect(enabledPage).toContain('github-light');
      expect(getCompilerContributions(enabled).browserResources.has("core:katex-css")).toBe(true);

      const disabled = context(join(root, "disabled/dist"));
      transformGfm().transformGfm!.run(disabled);
      await emitArtifacts().emitArtifacts!.run(disabled);

      const disabledPage = String(disabled.artifacts.get("pages/note.svelte")?.contents);
      expect(disabledPage).toContain("<del>old</del>");
      expect(disabledPage).not.toContain("data-rehype-pretty-code-figure");
      expect(disabledPage).not.toContain("class=\"katex\"");
      expect(getCompilerContributions(disabled).browserResources.size).toBe(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("does not ship math resources when the last math note disappears", () => {
    const first = context("/out", "$x$");
    transformLatex().transformLatex!.run(first);
    expect(getCompilerContributions(first).browserResources.has("core:katex-css")).toBe(true);

    const next = context("/out", "Plain text");
    next.meta = first.meta;
    transformLatex().transformLatex!.run(next);
    expect(getCompilerContributions(next).browserResources.size).toBe(0);
  });

  it("ships analytics only for a configured vault and passes public settings", () => {
    const disabled = context("/out");
    analytics().emitArtifacts!.run(disabled);
    expect(getCompilerContributions(disabled).browserResources.size).toBe(0);

    const enabled = context("/out", content, { analytics: { provider: "google", tagId: "G-123" } });
    analytics().emitArtifacts!.run(enabled);
    expect(getCompilerContributions(enabled).browserResources.get("core:analytics")).toEqual({
      id: "core:analytics",
      kind: "script",
      importId: "@svartz/plugins/browser-analytics",
      options: { provider: "google", tagId: "G-123" },
    });
  });

  it("rejects Clarity in a host vault because recording outlives its route", () => {
    const host = context("/out", content, {
      target: { type: "host" },
      analytics: { provider: "clarity", projectId: "public-id" },
    });
    expect(() => analytics().emitArtifacts!.run(host)).toThrow(/Clarity.*host vault/i);
    expect(getCompilerContributions(host).browserResources.size).toBe(0);

    const standalone = context("/out", content, {
      target: { type: "static" },
      analytics: { provider: "clarity", projectId: "public-id" },
    });
    analytics().emitArtifacts!.run(standalone);
    expect(getCompilerContributions(standalone).browserResources.has("core:analytics")).toBe(true);
  });
});
