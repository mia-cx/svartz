---
title: "Submissions"
description: "Let readers propose edits or publish directly to a GitHub repository."
---

Run `npm install -D @svartz/plugin-submissions` and add `submissions()` to a [[plugins/server-plugins|server target]] in `svartz.config.ts`:

```ts
import { defineConfig } from "@svartz/config";
import { submissions } from "@svartz/plugin-submissions";

export default defineConfig({
  version: "1.0.0",
  vaults: [
    {
      id: "wiki",
      path: "vault",
      target: { type: "node" },
      plugins: [submissions({ repo: "owner/wiki", mode: "pull-request" })],
    },
  ],
});
```

Build from a Git commit GitHub can read.

For pull requests, supply a fine-grained token with read/write Contents and Pull requests access, or install a GitHub App with those permissions. Use an App for direct commits. Keep the token, App key, and webhook secret on the server.

| Option | Type and default |
| --- | --- |
| `repo` | Required `"owner/name"` string. |
| `branch`, `vaultRoot` | Strings. Default to the repository's default branch and the vault path inferred from Git. |
| `labels` | List of strings; none by default. |
| `token` | `{ env: string }`. Defaults to `SVARTZ_GITHUB_TOKEN` when no App is set. |
| `app` | `{ id: string \| number; privateKey: { env: string }; installation?: number }`. No App by default; the installation is looked up if omitted. Set this or `token`, not both. |
| `mode` | `"permission"` (default), `"pull-request"`, or `"commit"`. |
| `signIn.required` | Boolean, default `false`. Requires [[plugins/auth|auth]] when enabled. |
| `guard.turnstile` | Optional `{ siteKey: string; secret: { env: string } }`. Skipped when sign-in is required. |
| `guard.rateLimit` | `{ limit: number; period: number }`, default 10 attempts per 3600 seconds per account or IP. |
| `sync.database`, `sync.webhookSecret` | Optional sync settings. Both take `{ env: string }` for the D1 binding and the webhook secret name. |
| `sync.live` | Required with sync. Use `{ workflow: string }` or `{ environment: string }`. |

With accounts, permission mode commits when an editor has `submissions:commits:write` for the page and an App is configured. Other saves need `submissions:pull-requests:write` and go to review. Commit mode refuses saves from editors who lack commit permission; pull-request mode sends every allowed save to review. Without accounts, saves always go to review. Direct commits need an App, auth, and a branch that accepts unsigned commits from the App. A conflicting edit or some branch rules can send a direct save to review instead.

The editor writes ordinary note source, including frontmatter; no plugin-specific frontmatter is needed. It edits published, unprotected `.md` notes and creates `.md` pages in eligible sections. It refuses colliding routes and files. Markdown is limited to 512 KiB, titles to 120 characters, and submission notes to 2,000 characters. Changes appear on the site when it rebuilds.

## Set up sync

Sync mirrors activity in D1 and lets editors follow a save until it goes live. Use Workers or Pages with D1; see the [[guides/community-wiki|community wiki]] for a complete Workers config. Set `sync.live` to a workflow filename, such as `deploy.yml`, or a deployment environment, such as `production`. Successful runs on the content branch or successful deployments to that environment mark changes as live.

1. Give the App read/write access to **Contents** and **Pull requests**, and read-only access to **Actions**, **Deployments**, and **Metadata**. Install it on the repo and accept permission updates.
2. Enable the App webhook at `https://<site><base><mount>/_svartz/submissions/github/webhook/`. Keep the trailing slash. Subscribe to **Push**, **Pull request**, **Pull request review**, **Pull request review comment**, **Issue comment**, **Workflow run**, and **Deployment status**.
3. Copy the webhook secret into the server secret named by `sync.webhookSecret`. Bind the D1 database named by `sync.database`; it can share `SVARTZ_DB` with auth.

With a token instead of an App, use the same repository permissions and add a repository webhook with the same URL, events, and secret. Set the webhook content type to `application/json`. Two vaults can sync different folders in one repository, but cannot sync the same folder.
