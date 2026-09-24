import { definePlugin } from "@svartz/core";
import { allocateRoutes } from "./internal/routes";

/** Assign final page slugs after publication, before links consume them. */
export const allocateRoutesPlugin = definePlugin(() => ({
  id: "core:allocate-routes",
  allocateRoutes: {
    run(ctx) {
      const reserved = (ctx.meta.get("reservedRoutes") as ReadonlySet<string> | undefined) ?? new Set<string>();
      allocateRoutes(ctx.files, reserved);
    },
    options: { fatal: true },
  },
}));

export const ALLOCATE_ROUTES_ID = "core:allocate-routes" as const;
