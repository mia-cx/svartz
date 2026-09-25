import { describe, expect, it, vi } from "vitest";
import { mountBrowserScripts } from "../src/plugin/browser-scripts";

describe("browser script lifecycle", () => {
  it("mounts per route and disposes listeners in reverse order exactly once", async () => {
    const calls: string[] = [];
    const scripts = ["first", "second"].map((id) => ({
      id,
      load: async () => ({ mount: (pathname: string) => {
        calls.push(`${id}:${pathname}`);
        return () => calls.push(`dispose:${id}`);
      } }),
    }));

    const dispose = await mountBrowserScripts(scripts, "/notes/");
    expect(calls).toEqual(["first:/notes/", "second:/notes/"]);
    dispose();
    dispose();
    expect(calls).toEqual(["first:/notes/", "second:/notes/", "dispose:second", "dispose:first"]);
  });

  it("cleans earlier mounts if a later script fails", async () => {
    const cleanup = vi.fn();
    await expect(mountBrowserScripts([
      { id: "first", load: async () => ({ mount: () => cleanup }) },
      { id: "broken", load: async () => ({}) },
    ], "/")).rejects.toThrow(/broken.*mount/);
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it("continues cleanup after a disposer fails", async () => {
    const calls: string[] = [];
    const scripts = ["first", "broken", "last"].map((id) => ({
      id,
      load: async () => ({ mount: () => () => {
        calls.push(id);
        if (id === "broken") throw new Error("cleanup failed");
      } }),
    }));

    const dispose = await mountBrowserScripts(scripts, "/");
    expect(() => dispose()).toThrow(AggregateError);
    expect(calls).toEqual(["last", "broken", "first"]);
    expect(() => dispose()).not.toThrow();
  });

  it("reports the mount error even when cleanup fails", async () => {
    const cleanup = vi.fn(() => { throw new Error("cleanup failed"); });
    await expect(mountBrowserScripts([
      { id: "first", load: async () => ({ mount: () => cleanup }) },
      { id: "broken", load: async () => ({ mount: () => { throw new Error("mount failed"); } }) },
    ], "/")).rejects.toMatchObject({ errors: [new Error("mount failed"), new Error("cleanup failed")] });
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it("passes resource settings without mixing mounts", async () => {
    const calls: unknown[][] = [];
    const scripts = [{
      id: "analytics",
      options: { provider: "google", tagId: "G-123" },
      load: async () => ({ mount: (...args: unknown[]) => { calls.push(args); } }),
    }];
    await mountBrowserScripts(scripts, "/blog/one/");
    await mountBrowserScripts(scripts, "/blog/two/");
    expect(calls).toEqual([
      ["/blog/one/", { provider: "google", tagId: "G-123" }],
      ["/blog/two/", { provider: "google", tagId: "G-123" }],
    ]);
  });
});
