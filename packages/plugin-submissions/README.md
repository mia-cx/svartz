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

## What readers see

Every published Markdown note gets an **Edit** action beside Copy page. It opens a panel with the page's Markdown source, frontmatter included, and a **What changed** field. **Open pull request** submits it, and the panel links the new pull request.

## What maintainers get

- A branch `svartz/submission/edit/<page>-<random>` from the commit the site was built from, with one commit replacing the note. When the page changed since, GitHub shows a conflict instead of the edit overwriting it.
- A pull request titled `Edit <path>` with the configured labels, the reader's note, and the page it came from.

Submissions are anonymous, and nothing limits how many a visitor sends. Readers can edit only published `.md` notes; password-protected notes, other files and paths outside the vault are refused by the server. A page's source is capped at 512 KB and the note at 2,000 characters.

## Server API

The plugin answers under `<base><mount>/_svartz/submissions/`. Failures answer `{ "error": "<code>", "message": "<for the reader>" }`.

| Request | Answer |
| --- | --- |
| `GET source/?page=/guides/setup/` | `{ "markdown": "…" }`, the note at the build commit. |
| `POST edit/` with `{ "page", "markdown", "note"? }` | 201 `{ "url", "number" }` of the new pull request. |

`page` is the note's URL path below the deployment base, as it appears in the site's index.
