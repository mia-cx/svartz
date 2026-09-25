import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isHostRouteFile, staticHostRoutes } from "../src/manual-routes";

describe("static host routes", () => {
  it("reserves only authored paths beneath the vault mount", async () => {
    const root = await mkdtemp(join(tmpdir(), "svartz-routes-"));
    try {
      for (const path of ["src/routes/+page.svelte", "src/routes/blog/about/+page.svelte", "src/routes/blog/(pages)/contact/+server.ts", "src/routes/blog/[...slug]/+page.svelte"]) {
        const file = join(root, path);
        await mkdir(join(file, ".."), { recursive: true });
        await writeFile(file, "");
      }
      expect([...await staticHostRoutes(root, "/blog")].sort()).toEqual(["about", "contact"]);
      expect([...await staticHostRoutes(root, "")].sort()).toEqual(["", "blog/about", "blog/contact"]);
      expect(isHostRouteFile(root, join(root, "src/routes/blog/about/+page.svelte"))).toBe(true);
      expect(isHostRouteFile(root, join(root, "vault/about.md"))).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
