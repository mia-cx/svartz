---
"@svartz/auth": minor
"@svartz/plugin-annotations": minor
---

An account's reputation now shows beside its name wherever the site names it, the way rep shows on Stack Exchange: a compact number such as `1,234`, or `12.5K` past ten thousand, read in full by screen readers and in its tooltip.

- `@svartz/auth`: every public profile (`findProfile`, `findProfiles`, `findProfilesByHandle`, `findProfilesByIdentity`) carries `reputation`, from the same query. Render it with `reputationBadgeHtml(score)` from the new `@svartz/auth/badge` entry, or `reputationBadge(score)` from `@svartz/auth/browser`; its style is in `@svartz/auth/browser.css`.
- `@svartz/plugin-annotations`: the page's list gives each comment the `reputation` of the account its author's sign-in is linked to, and the comment card shows it beside the author's name.
