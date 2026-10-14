import { describe, expect, it } from "vitest";
import type { PluginContext } from "@svartz/core";
import { compileContent } from "../src/internal/compile-content";
import { renderMarkdownTree } from "../src/internal/render-markdown";
import { presentation } from "../src/presentation";
import { groupAtBreaks, slideAction } from "../src/browser-presentation";

const context = () => ({ config: { theme: { base: "minimal" } }, files: [], meta: new Map() }) as unknown as PluginContext;

describe("presentation plugin", () => {
  it("marks top-level breaks only, so a break inside a quote stays in its slide", async () => {
    const ctx = context();
    presentation().transformGfm!.run(ctx);
    const content = compileContent(await renderMarkdownTree(ctx, "One\n\n---\n\nTwo\n\n> Quote\n>\n> ---\n>\n> Still two"));
    expect(content.match(/data-svartz-slide-break/g)).toHaveLength(1);
    expect(content).toMatch(/<blockquote>[\s\S]*<hr>/);
  });

  it("ships the browser script with its key and the stylesheet", () => {
    const ctx = context();
    presentation({ key: "s" }).transformGfm!.run(ctx);
    expect(ctx.compiler?.browserResources.get("core:presentation")).toMatchObject({
      kind: "script",
      importId: "@svartz/plugins/browser-presentation",
      options: { key: "s" },
    });
    expect(ctx.compiler?.browserResources.get("core:presentation-css")?.importId).toMatch(/browser-presentation\.css$/);
  });
});

describe("groupAtBreaks", () => {
  it("splits at breaks and drops the breaks and empty slides", () => {
    const blank = (node: string) => node === " ";
    expect(groupAtBreaks(["a", "|", "b", "c", "|", " ", "|", "d"], (node) => node === "|", blank)).toEqual([
      ["a"],
      ["b", "c"],
      ["d"],
    ]);
  });
});

describe("slideAction", () => {
  it("starts on the key when idle, ignoring case and leaving modified keys to the browser", () => {
    expect(slideAction({ key: "P" }, "p", false)).toBe("start");
    expect(slideAction({ key: "p", ctrlKey: true }, "p", false)).toBeUndefined();
    expect(slideAction({ key: "ArrowRight" }, "p", false)).toBeUndefined();
  });

  it("navigates while presenting", () => {
    expect(["ArrowRight", " ", "PageDown", "Enter"].map((key) => slideAction({ key }, "p", true))).toEqual(["next", "next", "next", "next"]);
    expect(["ArrowLeft", "PageUp"].map((key) => slideAction({ key }, "p", true))).toEqual(["prev", "prev"]);
    expect(slideAction({ key: " ", shiftKey: true }, "p", true)).toBe("prev");
    expect(["Home", "End", "Escape"].map((key) => slideAction({ key }, "p", true))).toEqual(["first", "last", "exit"]);
  });
});
