---
title: "Build a community wiki"
description: "Publish a Git-backed wiki with reader accounts, submissions, and moderation."
---

Start with [[start/first-site|a working vault]] committed to GitHub. This guide uses Workers for the site, D1 for accounts and activity, and GitHub pull requests for edits. It leaves direct web commits off.

## 1. Set up accounts and repository access

Create a D1 database and copy its ID. Create a GitHub OAuth App with the callback `https://wiki.example.com/_svartz/auth/callback/github/`. Register a separate GitHub App and install it on the content repository. Follow [[plugins/submissions#Set up sync|the sync setup]] for its permissions and webhook events. Choose a deployment workflow in your repository that runs on updates to the content branch and succeeds only after deploying the built site.

## 2. Add the theme and plugins

```sh
npm install -D @svartz/theme-wiki @svartz/auth @svartz/plugin-submissions @svartz/plugin-history @svartz/plugin-annotations @svartz/plugin-moderation wrangler
```

Replace the placeholders for your site, repo, apps, and database in `svartz.config.ts`:

```ts
import { defineConfig } from "@svartz/config";
import { auth } from "@svartz/auth";
import { submissions } from "@svartz/plugin-submissions";
import { history } from "@svartz/plugin-history";
import { annotations } from "@svartz/plugin-annotations";
import { moderation } from "@svartz/plugin-moderation";

export default defineConfig({
  version: "1.0.0",
  vaults: [
    {
      id: "wiki",
      path: "vault",
      site: { title: "Field Guide", url: "https://wiki.example.com" },
      theme: "@svartz/theme-wiki",
      target: {
        type: "cloudflare-workers",
        routes: [{ pattern: "wiki.example.com", custom_domain: true }],
        d1_databases: [{ binding: "SVARTZ_DB", database_name: "wiki", database_id: "<id>" }],
      },
      plugins: [
        auth({
          providers: { github: { clientId: "<client-id>", clientSecret: { env: "PRIVATE_GITHUB_CLIENT_SECRET" } } },
          admins: ["github:<numeric-user-id>"],
        }),
        submissions({
          repo: "owner/wiki",
          mode: "pull-request",
          signIn: { required: true },
          app: { id: "<app-id>", privateKey: { env: "SVARTZ_GITHUB_APP_KEY" } },
          sync: {
            database: { env: "SVARTZ_DB" },
            webhookSecret: { env: "SVARTZ_GITHUB_WEBHOOK_SECRET" },
            live: { workflow: "deploy.yml" },
          },
        }),
        history(),
        annotations({ database: { env: "SVARTZ_DB" } }),
        moderation(),
      ],
    },
  ],
});
```

## 3. Build and deploy

```sh
npx svartz build --vault wiki
npx wrangler deploy --config .svartz/vaults/wiki/wrangler.json
```

Using that same Wrangler config, put `PRIVATE_GITHUB_CLIENT_SECRET`, `SVARTZ_GITHUB_APP_KEY` (the App's PEM key), `SVARTZ_GITHUB_WEBHOOK_SECRET`, and `PRIVATE_SVARTZ_SESSION_SECRET` (at least 32 random characters) in Worker secrets. Set the App webhook to `https://wiki.example.com/_svartz/submissions/github/webhook/`. Never commit the secret values. Keep the build and deploy commands in your workflow so merging a content pull request publishes the change.

## 4. Follow one change through the site

1. Sign in and open `/-/account/`. With the admin identity, check `/-/dashboard/` for its panels.
2. Open a published `.md` note and use **Edit**. A save should open a pull request. Review and merge it on GitHub.
3. After deploy, reopen the note. Check **History** for the revision and `/-/changes/` for Recent changes. Select text to start an annotation, then report a test comment to check the moderation queue.

To allow trusted editors to commit from the site, use `mode: "permission"` and grant only those editors `submissions:commits:write`. Keep pull-request review for everyone else.
