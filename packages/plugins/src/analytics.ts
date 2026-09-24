import { definePlugin, getCompilerContributions } from "@svartz/core";

export const ANALYTICS_ID = "core:analytics";
const HOST_WIDE_PROVIDERS = new Set(["clarity", "google", "vercel", "tinylytics"]);

/** Contribute one browser tracker only when a vault selects an analytics provider. */
export const analytics = () => definePlugin(() => ({
  id: ANALYTICS_ID,
  emitArtifacts: {
    options: { fatal: true },
    run(ctx) {
      if (!ctx.config.analytics) return;
      if (ctx.config.target.type === "host" && HOST_WIDE_PROVIDERS.has(ctx.config.analytics.provider)) {
        throw new Error(`${ctx.config.analytics.provider} cannot be scoped to a host vault; configure it for the whole host app instead`);
      }
      getCompilerContributions(ctx).browserResources.set(ANALYTICS_ID, {
        id: ANALYTICS_ID,
        kind: "script",
        importId: "@svartz/plugins/browser-analytics",
        options: ctx.config.analytics,
      });
    },
  },
}))();
