import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { PluginContext, ResolvedConfig } from "@svartz/core";
import { hardLineBreaks } from "../src/hard-line-breaks";
import { renderMarkdown } from "../src/internal/render-markdown";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function context(path: string, content: string): PluginContext {
  return {
    config: { path } as ResolvedConfig,
    files: [{ path: "note.md", slug: "note", extension: ".md", content }],
    artifacts: new Map(),
    meta: new Map(),
  };
}

describe("optional content formats", () => {
  it("renders hard line breaks only when configured", async () => {
    const disabled = context("/vault", "first\nsecond");
    const enabled = context("/vault", "first\nsecond");
    hardLineBreaks().transformGfm!.run(enabled);
    expect(await renderMarkdown(disabled, disabled.files[0]!.content)).not.toContain("<br>");
    expect(await renderMarkdown(enabled, enabled.files[0]!.content)).toContain("<br>");
  });
});
