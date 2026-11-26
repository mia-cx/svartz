---
title: "Analytics"
description: "Enable one browser analytics provider through vault settings."
---

Analytics ships with the core pipeline. Do not install a separate package or put `analytics()` in `plugins`. Set `analytics` on a vault or in `defaults` in `svartz.config.ts`:

```ts
import { defineConfig } from "@svartz/config";

export default defineConfig({
  version: "1.0.0",
  vaults: [
    {
      id: "notes",
      path: "vault",
      target: { type: "static" },
      analytics: { provider: "plausible", scriptSrc: "https://plausible.io/js/pa-example.js" },
    },
  ],
});
```

The default is off. No note frontmatter is involved. A vault setting replaces the entire default setting. Set up the site in your analytics service first and use its public IDs and script URL. Never put a secret in these settings.

| `provider` | Required strings | Optional strings |
| --- | --- | --- |
| `plausible` | None | `host`, `scriptSrc` |
| `google` | `tagId` | None |
| `umami` | `websiteId` | `host` |
| `goatcounter` | `websiteId` | `host`, `scriptSrc` |
| `posthog` | `apiKey` | `host` |
| `tinylytics` | `siteId` | None |
| `cabin` | None | `host` |
| `clarity` | `projectId` | None |
| `matomo` | `host`, `siteId` | None |
| `vercel` | None | None |
| `rybbit` | `siteId` | `host` |

Use the provider's hosted endpoint when available, or set `host`. URLs must be absolute HTTP(S); GoatCounter's `websiteId` and `host` take bare domains instead. Vercel needs Web Analytics enabled on the hosting project.

The build rejects Google, Clarity, Tinylytics, and Vercel on [[guides/host-vaults|host vaults]] because those trackers can follow navigation outside the mount. Set one up at the app level if you want to track the whole host. For Google, turn off Enhanced Measurement's browser-history page changes to avoid duplicate pageviews.

API reference: [[reference/api/config/AnalyticsConfig|AnalyticsConfig]].
