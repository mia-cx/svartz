# @svartz/plugin-submissions

Readers edit a page from your Svartz site, and the site opens a pull request on your GitHub repository. You review it like any other pull request: merge to accept, close to decline, push to the branch to change it.

## Set up

1. Give the vault a server target: `cloudflare-workers`, `cloudflare-pages` or `node`. A `static` vault with this plugin fails the build.
2. Create a [fine-grained personal access token](https://github.com/settings/personal-access-tokens/new) for the repository with **Contents** and **Pull requests** set to *Read and write*.
3. Set it on the server as `SVARTZ_GITHUB_TOKEN`: `wrangler secret put SVARTZ_GITHUB_TOKEN` on Cloudflare, or the process environment on Node. Under `svartz dev`, put it in `.env`.
4. Add the plugin:

```ts
import { defineConfig } from "@svartz/config";
import { submissions } from "@svartz/plugin-submissions";

export default defineConfig({
  version: "1.0.0",
  vaults: [{
    id: "wiki",
    path: "vault",
    target: { type: "cloudflare-workers" },
    plugins: [submissions({ repo: "wikiplace/wikiplace.live", labels: ["submission"] })],
  }],
});
```

The site must be built from a git checkout of that repository, and the commit it was built from must be on GitHub: the editor reads each page's source at that commit.

| Option | Default | |
| --- | --- | --- |
| `repo` | required | The repository, as `owner/name`. |
| `branch` | the repository's default branch | The branch pull requests target. |
| `vaultRoot` | read from git | The vault folder's path inside the repository, such as `"content"`. Set it when the build doesn't run in the repository's checkout. |
| `labels` | none | Labels every pull request gets. |
| `token` | `{ env: "SVARTZ_GITHUB_TOKEN" }` | The server environment variable that holds the token. |
| `guard.turnstile` | none | `{ siteKey, secret: { env: "NAME" } }`: the editor shows a [Turnstile](#turnstile) challenge and the server verifies it. |
| `guard.rateLimit` | `{ limit: 10, period: 3600 }` | Submissions allowed per `period` seconds, per signed-in reader or per IP. See [Rate limit](#rate-limit). |

## What readers see

Every published Markdown note gets an **Edit** action beside Copy page. It opens a panel with the page's Markdown source, frontmatter included, and a **What changed** field. **Open pull request** submits it, and the panel links the new pull request.

## What maintainers get

- A branch `svartz/submission/edit/<page>-<random>` from the commit the site was built from, with one commit replacing the note. When the page changed since, GitHub shows a conflict instead of the edit overwriting it.
- A pull request titled `Edit <path>` with the configured labels, the reader's note, and the page it came from.

Readers can edit only published `.md` notes; password-protected notes, other files and paths outside the vault are refused by the server. A page's source is capped at 512 KB and the note at 2,000 characters.

## Guard

Every edit passes the guard before the server calls GitHub.

### Turnstile

1. Add a widget under **Turnstile** in the Cloudflare dashboard, with your site's hostname.
2. Put its site key in `guard.turnstile.siteKey`.
3. Set its secret key on the server under the name `guard.turnstile.secret.env` gives, such as `TURNSTILE_SECRET`.

```ts
submissions({
  repo: "wikiplace/wikiplace.live",
  guard: { turnstile: { siteKey: "0x4AAAAAAA…", secret: { env: "TURNSTILE_SECRET" } } },
})
```

The editor then shows the challenge above its buttons and sends its token with the edit. The standalone shell's Content Security Policy allows Cloudflare's script; a host app with its own policy adds `https://challenges.cloudflare.com` to `script-src` and `frame-src`. The server checks the token with Cloudflare before it calls GitHub, giving up after 5 seconds. An edit without a token, with a token Cloudflare refuses, or sent while Cloudflare can't be reached is refused, and the reader can retry.

### Rate limit

Each signed-in reader (see [Reader sign-in](../../docs/auth.md)) gets `limit` submissions per `period` seconds; anonymous readers share that budget per IP. Past it, the server answers 429 with `retryAfter` in seconds and a `Retry-After` header, and the editor says when to try again, such as "Try again in 10 minutes."

By default the count lives in the server's memory. Each Node process and each Workers isolate keeps its own count, so a site with several instances allows up to `limit` per instance, and a restart clears it.

On Cloudflare Workers, bind a [rate limiter](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) as `SVARTZ_SUBMISSIONS_RATE_LIMIT` to count across isolates instead. Its own `limit` and `period` then apply; set `guard.rateLimit.period` to the same period, because the binding doesn't report when its window resets and `retryAfter` is that period:

```jsonc
// wrangler.jsonc
"ratelimits": [{ "name": "SVARTZ_SUBMISSIONS_RATE_LIMIT", "namespace_id": "1001", "simple": { "limit": 10, "period": 60 } }]
```

## Server API

The plugin answers under `<base><mount>/_svartz/submissions/`. Failures answer `{ "error": "<code>", "message": "<for the reader>" }`.

| Request | Answer |
| --- | --- |
| `GET source/?page=/guides/setup/` | `{ "markdown": "…" }`, the note at the build commit. |
| `POST edit/` with `{ "page", "markdown", "note"?, "turnstileToken"? }` | 201 `{ "url", "number" }` of the new pull request. 403 when Turnstile is missing or refused, 429 with `retryAfter` past the rate limit, 503 when Cloudflare can't be reached. |

`page` is the note's URL path below the deployment base, as it appears in the site's index.
