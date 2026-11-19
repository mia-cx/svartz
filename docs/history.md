# Page history

`@svartz/plugin-history` gives every published page a history: each change, who made it and what they said it changed, and the diff between any two revisions. Recent changes lists every change to the wiki, and each account's contributions list its own. Moderators [revert](#reverting-a-page) a page to an earlier revision from its history. It reads the GitHub mirror that [`@svartz/plugin-submissions`](../packages/plugin-submissions/README.md#github-sync) keeps, and asks GitHub, through that plugin, for what the mirror lacks.

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
| `/-/history/<page>` | The page's changes, newest first along the branch: when, who, and the summary. Each change links to what it changed; picking any two and **Compare selected** shows the changes between them. |
| `/-/history/<page>?to=<commit>&from=<commit>` | The changes to the page's source between two revisions, then the page as it read at the newer one, rendered with the build's own Markdown steps (the ones the editor's Split preview runs). Without `from`, the change to the page that `to` follows in the branch's ancestry. A moderator gets the [revert](#reverting-a-page) form here. |
| `/-/changes/` | Every change to a published page, newest first, by day, each with the pages it changed and links to their changes and history. |

| `/-/contributions/<handle>/` | An account's [contributions](#contributions): its reputation, its changes by day, newest first, and every page they changed. |

`<page>` is the page's path below the vault's mount, so `/wiki/guides/setup/` has its history at `/wiki/-/history/guides/setup/`. Every published Markdown page gets a **History** action beside Copy page and Edit. Nothing adds Recent changes to a theme's navigation; link to `<mount>/-/changes/` where the theme puts its links.

The pages render in the theme's shell on every request, like every [plugin page](server-plugins.md#plugin-pages), and anyone who can read the site can read them.

## Who made a change

A change shows the site account that made it only when the site's own record says so: the submissions plugin records every save, so a save it committed straight to the branch is that account's, and so is the merge commit of a pull request it opened for an account and GitHub merged. Everything git says about a commit (its author, its committer, a `Svartz-Account` trailer) is whatever its maker wrote, so none of it names an account. Every other commit, including the commits inside a merged pull request, shows its author as git names them, with their GitHub login when GitHub linked the commit to an account. An account shows under its current display name and handle.

A save the site committed has the note its editor wrote as its summary; any other commit's summary is its message's first line.

An account's name links to its [user page](auth.md#user-pages), or to its contributions while it has none.

## Contributions

`/-/contributions/<handle>/` lists the changes the site's records say an account made, by the same rule as above: the saves it committed, and the merge commits of the pull requests it opened, a pull request being the account's that made its first save. It shows them newest first, 50 at a time with **Older edits** behind them, then every page they changed, most recently changed first. Above them is the account's [reputation](auth.md#reputation): its score to everyone, and to the account itself how many points it needs for the next role a threshold gives. An old handle redirects to the current one, and a handle no account ever held answers 404, as does every handle on a site without `SVARTZ_DB`.

An account's [user page](auth.md#user-pages) shows the same below its note, in a Contributions section: the latest five changes, up to ten pages they changed, and **All contributions**, which links the page. The account's reputation is beside the page's actions already, so the section doesn't repeat it.

Wherever history names a site account, its [reputation](auth.md#reputation) shows beside the name. The section joins the page in the browser, after the element the theme marks `data-svartz-note`, so the page itself stays prerendered.

Every account has a contributions page, with a user page or without one. The [account page](auth.md#the-account-page) links the reader's own as **Your contributions**, and history links an account's name to it wherever the account has no user page.

Contributions show what Recent changes does: a change to a hidden or protected page alone stays out, a change that also touched one shows without its summary, and the pages list names only published pages. Like Recent changes, they come from the mirror alone, so they start at its backfill.

## Reverting a page

A moderator who holds `history:reverts:write` on a page can make it read as it did at an earlier revision, in one action. On the page's history, each change but the newest offers **Revert to this**, which opens the diff from that revision to the page now. The diff page offers the form for its earlier revision: it says when that revision is from and how many changes reverting undoes, takes an optional reason, and **Revert to this revision** commits it. When the diff ends before the page's latest change, as one reached from a [report](moderation.md#the-reports-panel) about an older commit does, the form links the diff to the page now, so the moderator sees everything reverting undoes.

A revert is one new commit whose content is the page's file at the restored revision, made through the submissions plugin's [commit path](../packages/plugin-submissions/README.md#how-a-commit-lands): authored as the moderator, with their GitHub account as co-author when linked, committed by the GitHub App, with the trailers a site save carries. Its message's first line names the page and the revision, `Revert content/guide.md to 3f2a1b0 (12 Nov 2026)`, and its summary, which history shows, repeats the revision with the moderator's reason after it. The site records it as the moderator's save, so history and contributions show it as theirs, and it earns them no reputation. A revert is a change like any other, and can be reverted in turn.

| Permission | Lets someone | Default |
| --- | --- | --- |
| `history:reverts:write` | Revert a page to an earlier revision. | Nobody but admins. |

The permission is [administrative](auth.md#grants): owning a user page or a group's pages never gives it, only the `admin` role or a grant does. A revert also needs it on every page the restored frontmatter claims, its slug, permalink and aliases, so restoring old frontmatter can't take a route from a page the moderator can't revert. Reverting needs the submissions plugin to commit through a GitHub App; with a token, nobody is offered it.

A revert is refused, and changes nothing, when:

- the page changed since the moderator opened the form: the form carries the page's latest change they saw, and the commit is made only over the file as it was then;
- the branch's rules refuse commits from the site, such as a rule requiring pull requests: the site never opens a pull request instead;
- the revision is older than the page's latest 100 changes, wasn't public (a draft, private or password-protected), is larger than the site reads, or is from before the page existed;
- the page already reads as it did at that revision.

### Reputation

Reverting takes back what the changes it undoes earned. Every change to the page after the restored revision that the site recorded as an account's save (a commit it made, or the merge of a pull request it opened) gets a `reversal` entry in the [ledger](auth.md#taking-points-back), for the account the site's record names, never one git metadata names, taking back exactly what that save earned. A save whose points are still owed, such as an edit whose lines aren't counted yet, earns nothing once they are. The site also keeps the commits each revert undid, as GitHub listed them for the page, so a save it undid earns nothing whenever the mirror learns it landed: a pull request merged a moment before the revert, whose merge reaches the site only afterwards, gets a 0-point `reversal` entry instead of its points. When the site can't write the reversals as the revert lands, the revert still succeeds, and the site writes them the next time it settles reputation. Changes the site has no record of, and saves that earned nothing, such as an earlier revert, get no entry, and no save is taken back twice, however many reverts cover it. A lower score never takes away a role the account already holds.

### The audit log

Each revert writes one `history:page:revert` entry to the [audit log](auth.md#the-audit-log), on `page:<vault>/<slug>`, with the revision restored, the head it replaced, the commit made and the reason. It is written once the commit exists and before the branch moves to it, so a revert never lands unrecorded; a branch whose rules refuse the commit leaves the entry without a change.

Each revert reads what it needs in a fixed number of D1 queries and writes its reversals in one batch, however many changes it undoes. It makes at most four reads of GitHub through the commit reader (the page's latest changes and the two revisions' files), then the commit itself.

## What stays out

History shows only what the site publishes:

- A page that is hidden, private, a draft or password-protected has no history page, and Recent changes never lists it.
- A commit that changed such a page shows no summary anywhere, since its message may name it. Neither does a commit whose files aren't all known: one the mirror hasn't read yet, as with older changes read from GitHub, or one that changed more than 300 files, which GitHub lists only in part.
- A revision whose frontmatter made it a draft, private or password-protected shows none of its content, even once the page is public: the diff says one of its revisions wasn't public.

Which pages are published comes from the last build, so a page added since shows once the site rebuilds.

## How far back

A page's history is GitHub's list of the commits that changed its file, in the order the branch's ancestry gives them, 100 changes at a time; **Older changes** goes back up to 1,000. Past that, **Older changes on GitHub** links to the file's history there. Commit times can tie or be backdated, so neither the list nor the revision a change is compared with follows them.

Who made each change, and its summary, come from the mirror. It holds the latest 100 commits that changed the vault when it backfilled, and every commit since; an older change shows its git author and no summary. Recent changes reads the mirror alone, newest commit time first. Opening a history page or Recent changes starts the mirror's poll when it is stale; its first run backfills.

History follows a file's path: a page that was moved or renamed shows its changes since the move.

## Limits

A diff shows each changed line of the source with three lines around it. Revisions over 1 MiB, sources over 40,000 lines together, or diffs of more than 1,000 changed lines aren't computed here: the page links to the comparison on GitHub instead.

Each page view makes at most seven requests to GitHub, what comparing two revisions the mirror doesn't hold takes: the default branch's name when the mirror doesn't know it yet, then for each revision a check that the content branch holds it, the commit, and the page's file at it. It asks only while the submissions plugin's shared pause allows: once GitHub says fewer than 100 of its hourly requests remain, history asks nothing more until the limit resets, keeping them for saves. The page then says GitHub isn't answering. File contents read from GitHub are kept in the worker's memory, since a commit never changes. A moderator's diff page also reads the page's latest changes within those seven, to offer the revert form; when they're spent, the form stays off.
