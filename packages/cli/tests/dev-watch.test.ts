import { describe, expect, it } from "vitest";
import {
  getConfigWatchDescriptors,
  matchesWatchDescriptor,
  uniqBuildFilters,
} from "../src/dev-watch";

describe("CLI dev watch helpers", () => {
  it("watches explicit config files exactly", () => {
    const [descriptor] = getConfigWatchDescriptors("/workspace", "/workspace/svartz.config.ts");
    expect(descriptor).toEqual(
      expect.objectContaining({
        path: "/workspace/svartz.config.ts",
        exact: true,
      }),
    );
  });

  it("matches nested files within watched directories", () => {
    expect(
      matchesWatchDescriptor(
        "/workspace/packages/vite/src/index.ts",
        {
          path: "/workspace/packages/vite/src",
          label: "@svartz/vite source",
        },
      ),
    ).toBe(true);
  });

  it("does not match sibling paths outside the watched root", () => {
    expect(
      matchesWatchDescriptor(
        "/workspace/packages/vite/tests/index.test.ts",
        {
          path: "/workspace/packages/vite/src",
          label: "@svartz/vite source",
        },
      ),
    ).toBe(false);
  });

  it("deduplicates rebuild filters while preserving order", () => {
    expect(uniqBuildFilters(["@svartz/vite", "@svartz/core", "@svartz/vite"])).toEqual([
      "@svartz/vite",
      "@svartz/core",
    ]);
  });
});
