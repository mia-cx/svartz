import { describe, expect, it } from "vitest";
import {
  executeHandleChange,
  executeStage,
  PluginAggregateError,
  runLifecycleHooks,
  runStages,
} from "../src/index";
import type { PluginContext, SvartzPlugin } from "../src/index";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const makeCtx = (): PluginContext => ({
  config: {
    version: "1.0.0",
    id: "docs",
    path: "/vault",
    outDir: "/vault/.svartz/vaults/docs/dist",
    include: [],
    exclude: [],
    linkResolution: "closest",
    theme: { base: "@svartz/theme-minimal" },
    frontmatter: {
      titleField: "title",
      descriptionField: "description",
      tagsField: "tags",
      aliasesField: "aliases",
      createdAtField: "created_at",
      updatedAtField: "updated_at",
      publishedField: "published",
    },
    target: { type: "static" },
    plugins: [],
  },
  files: [],
  artifacts: new Map(),
  meta: new Map(),
});

describe("executeStage", () => {
  it("runs pre, default, and post hooks in order and batches default transforms", async () => {
    const events: string[] = [];
    const plugins: SvartzPlugin[] = [
      {
        id: "pre",
        transformGfm: {
          async run() {
            events.push("pre:start");
            await wait(1);
            events.push("pre:end");
          },
          options: { enforce: "pre" },
        },
      },
      {
        id: "default-a",
        async transformGfm() {
          events.push("a:start");
          await wait(20);
          events.push("a:end");
        },
      },
      {
        id: "default-b",
        async transformGfm() {
          events.push("b:start");
          await wait(5);
          events.push("b:end");
        },
      },
      {
        id: "post",
        transformGfm: {
          async run() {
            events.push("post:start");
            events.push("post:end");
          },
          options: { enforce: "post" },
        },
      },
    ];

    const result = await executeStage(plugins, "transformGfm", makeCtx());
    expect(result.errors).toEqual([]);
    expect(events.slice(0, 2)).toEqual(["pre:start", "pre:end"]);

    const firstParallelEnd = Math.min(events.indexOf("a:end"), events.indexOf("b:end"));
    expect(events.indexOf("a:start")).toBeLessThan(firstParallelEnd);
    expect(events.indexOf("b:start")).toBeLessThan(firstParallelEnd);
    expect(events.slice(-2)).toEqual(["post:start", "post:end"]);
  });
});

describe("runStages", () => {
  it("collects non-fatal errors and stops on fatal errors", async () => {
    const events: string[] = [];
    const plugins: SvartzPlugin[] = [
      {
        id: "warn",
        buildStart: {
          run() {
            events.push("warn");
            throw new Error("warn failure");
          },
          options: { fatal: false },
        },
      },
      {
        id: "ok",
        buildStart() {
          events.push("ok");
        },
      },
      {
        id: "fatal",
        configResolved: {
          run() {
            events.push("fatal");
            throw new Error("fatal failure");
          },
          options: { fatal: true },
        },
      },
      {
        id: "after",
        buildEnd() {
          events.push("after");
        },
      },
    ];

    await expect(
      runStages(plugins, makeCtx(), ["buildStart", "configResolved", "buildEnd"]),
    ).rejects.toBeInstanceOf(PluginAggregateError);

    try {
      await runStages(plugins, makeCtx(), ["buildStart", "configResolved", "buildEnd"]);
    } catch (error) {
      const aggregate = error as PluginAggregateError;
      expect(aggregate.errors).toHaveLength(2);
      expect(aggregate.errors[0]!.pluginId).toBe("warn");
      expect(aggregate.errors[0]!.fatal).toBe(false);
      expect(aggregate.errors[1]!.pluginId).toBe("fatal");
      expect(aggregate.errors[1]!.fatal).toBe(true);
    }

    expect(events).toEqual(["warn", "ok", "fatal", "warn", "ok", "fatal"]);
  });

  it("rethrows collected non-fatal errors after all requested stages finish", async () => {
    const plugins: SvartzPlugin[] = [
      {
        id: "warn-build-start",
        buildStart: {
          run() {
            throw new Error("warn start");
          },
          options: { fatal: false },
        },
      },
      {
        id: "warn-build-end",
        buildEnd: {
          run() {
            throw new Error("warn end");
          },
          options: { fatal: false },
        },
      },
    ];

    await expect(
      runLifecycleHooks(plugins, makeCtx(), ["buildStart", "buildEnd"]),
    ).rejects.toBeInstanceOf(PluginAggregateError);
  });
});

describe("executeHandleChange", () => {
  it("sorts handleChange hooks by enforce tiers", async () => {
    const events: string[] = [];
    const plugins: SvartzPlugin[] = [
      {
        id: "post",
        handleChange: {
          run() {
            events.push("post");
          },
          options: { enforce: "post" },
        },
      },
      {
        id: "default",
        handleChange() {
          events.push("default");
        },
      },
      {
        id: "pre",
        handleChange: {
          run() {
            events.push("pre");
          },
          options: { enforce: "pre" },
        },
      },
    ];

    const result = await executeHandleChange(
      plugins,
      { type: "change", file: "note.md" },
      makeCtx(),
    );

    expect(result.errors).toEqual([]);
    expect(events).toEqual(["pre", "default", "post"]);
  });
});
