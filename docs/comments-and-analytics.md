# Comments and analytics

Both integrations are opt-in per vault. No third-party comments or analytics code loads when their settings are absent.

## Giscus comments

Set `theme.comments` on a vault using the minimal theme. The four repository and category values come from the [Giscus setup page](https://giscus.app/).

```ts
{
  id: "blog",
  path: "./vault/blog",
  target: { type: "host" },
  theme: {
    base: "@svartz/theme-minimal",
    comments: {
      repo: "owner/discussions",
      repoId: "R_...",
      category: "Notes",
      categoryId: "DIC_...",
      mapping: "pathname",
      reactionsEnabled: true,
      inputPosition: "bottom",
      lightTheme: "light",
      darkTheme: "dark",
    },
  },
}
```

Comments appear on published notes only. A note with `comments: false` in frontmatter hides its widget. Giscus also accepts `mapping` values `url`, `title`, `og:title`, `specific`, and `number`; the last two require `term`. `strict`, `lang`, and `enabled` are optional. The comment script and iframe are removed when the widget unmounts.

## Analytics

Set `analytics` on a vault or in `defaults`. A vault setting replaces the default. The selected provider's public settings are bundled for the browser. Keep private API keys and tokens out of this config.

```ts
defaults: {
  analytics: { provider: "plausible", scriptSrc: "https://plausible.io/js/pa-EXAMPLE.js" },
},
vaults: [
  { id: "blog", path: "./vault/blog", target: { type: "host" } },
]
```

| Provider | Required settings | Optional settings |
| --- | --- | --- |
| Plausible | none | `scriptSrc`, `host` |
| Google Analytics | `tagId` | none |
| Umami | `websiteId` | `host` |
| GoatCounter | `websiteId` | `host`, `scriptSrc` |
| PostHog | `apiKey` | `host` |
| Tinylytics | `siteId` | none |
| Cabin | none | `host` |
| Clarity | `projectId` | none |
| Matomo | `host`, `siteId` | none |
| Vercel Web Analytics | none | none |
| Rybbit | `siteId` | `host` |

Plausible's current dashboard supplies the script URL. Set it as `scriptSrc`; the fallback uses Quartz's older manual script. Vercel requires Web Analytics enabled on the hosting project and its `/_vercel/insights/` endpoint. A custom `host` is an absolute HTTP(S) URL except GoatCounter's bare domain. For Matomo, include the protocol in `host`.

Svartz sends manual pageviews only after a route mounts. The browser module shares one provider installation across repeated mounts with the same settings. Providers with their own SPA tracking keep that behavior. Rybbit uses its HTTP pageview API so remote session-replay settings cannot read note content. No note body or decrypted text is passed to a tracker by Svartz. The runtime marks the entire vault view with `data-clarity-mask`, so Clarity does not upload its DOM contents. Consumers who add other tracking code in the host app own that code's behavior.

Provider setup references: [Plausible](https://plausible.io/docs/script-extensions), [Google](https://developers.google.com/analytics/devguides/collection/ga4/views), [Umami](https://docs.umami.is/docs/tracker-functions), [GoatCounter](https://www.goatcounter.com/help/js), [PostHog](https://posthog.com/docs/libraries/js), [Tinylytics](https://tinylytics.app/docs/getting-started/embed), [Cabin](https://docs.withcabin.com/install), [Clarity](https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-masking), [Matomo](https://developer.matomo.org/guides/spa-tracking), [Vercel](https://vercel.com/docs/analytics/quickstart), [Rybbit](https://rybbit.com/docs/script).
