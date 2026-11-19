# Page history

`@svartz/plugin-history` gives every published page a history: each change, who made it and what they said it changed, and the diff between any two revisions. Recent changes lists every change to the wiki. It reads the GitHub mirror that [`@svartz/plugin-submissions`](../packages/plugin-submissions/README.md#github-sync) keeps, and asks GitHub, through that plugin, for what the mirror lacks.

The package isn't on npm yet; it ships with the workspace until it is.

```ts
import { defineConfig } from "@svartz/config";
import { auth } from "@svartz/auth";
import { history } from "@svartz/plugin-history";
import { submissions } from "@svartz/plugin-submissions";

export default defineConfig({
  version: "1.0.0",
  vaults: [{
    id: "wiki",
    path: "vault",
    target: { type: "cloudflare-workers" },
    plugins: [
      auth({ providers: { github: { clientId: "Iv23liExample", clientSecret: { env: "PRIVATE_GITHUB_CLIENT_SECRET" } } } }),
      submissions({
        repo: "wikiplace/wikiplace.live",
        app: { id: 1234567, privateKey: { env: "SVARTZ_GITHUB_APP_KEY" } },
        sync: { database: { env: "SVARTZ_DB" }, webhookSecret: { env: "SVARTZ_GITHUB_WEBHOOK_SECRET" }, live: { workflow: "deploy.yml" } },
      }),
      history(),
    ],
  }],
});
```

History needs the submissions plugin on the same vault with [`sync`](../packages/plugin-submissions/README.md#github-sync) set; without it the build fails, naming the vault. That makes it a Cloudflare vault. It takes no options of its own and holds no GitHub credentials: every request to GitHub goes through the submissions plugin's App or token.

## The pages

| Page | Shows |
| --- | --- |
| `/-/history/<page>` | The page's changes, newest first: when, who, and the summary. Each change links to what it changed; picking any two and **Compare selected** shows the changes between them. |
| `/-/history/<page>?to=<commit>&from=<commit>` | The changes to the page's source between two revisions, then the page as it read at the newer one, rendered with the build's own Markdown steps (the ones the editor's Split preview runs). Without `from`, the revision before `to`. |
| `/-/changes/` | Every change to a published page, newest first, by day, each with the pages it changed and links to their changes and history. |

`<page>` is the page's path below the vault's mount, so `/wiki/guides/setup/` has its history at `/wiki/-/history/guides/setup/`. Every published Markdown page gets a **History** action beside Copy page and Edit. Nothing adds Recent changes to a theme's navigation; link to `<mount>/-/changes/` where the theme puts its links.

The pages render in the theme's shell on every request, like every [plugin page](server-plugins.md#plugin-pages), and anyone who can read the site can read them.

## Who made a change

A change shows the site account that made it only when the site can vouch for that: its own record of the save names the account, or the commit was committed by the submissions plugin's GitHub App and carries a `Svartz-Account` trailer. Anyone can write that trailer, or an account's address, into a commit, so on any other commit the author shows as git names them, with their GitHub login when GitHub linked the commit to an account. An account shows under its current display name and handle.

A save from the site carries the note its editor wrote, which is its summary; any other commit's summary is its message's first line.

## What stays out

History shows only what the site publishes:

- A page that is hidden, private, a draft or password-protected has no history page, and Recent changes never lists it.
- A commit that changed such a page shows no summary anywhere, since its message may name it. Neither does a commit whose files the mirror doesn't know yet, as with older changes read from GitHub.
- A revision whose frontmatter made it a draft, private or password-protected shows none of its content, even once the page is public: the diff says one of its revisions wasn't public.

Which pages are published comes from the last build, so a page added since shows once the site rebuilds.

## How far back

The mirror holds the latest 100 commits that changed the vault when it backfilled, and every commit since. A page's history starts with what the mirror holds; **Older changes** reads further back from GitHub, 100 changes at a time, up to 1,000. Past that, **Older changes on GitHub** links to the file's history there. Until the mirror's first poll has backfilled and read every commit's files, a page's history comes from GitHub, and opening a history page or Recent changes starts that poll.

History follows a file's path: a page that was moved or renamed shows its changes since the move.

## Limits

A diff shows each changed line of the source with three lines around it. Revisions over 1 MiB, sources over 40,000 lines together, or diffs of more than 1,000 changed lines aren't computed here: the page links to the comparison on GitHub instead.

Each page view makes at most six requests to GitHub, and only while the submissions plugin's shared pause allows: once GitHub says fewer than 100 of its hourly requests remain, history asks nothing more until the limit resets, keeping them for saves. The page then says GitHub isn't answering. File contents read from GitHub are kept in the worker's memory, since a commit never changes.
