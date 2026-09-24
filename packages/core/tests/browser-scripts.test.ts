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
});
