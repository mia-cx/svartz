# Moderation

`@svartz/plugin-moderation` lets readers report what's wrong on a site: a page, a comment, an account, a submission or a commit, each with a reason. Moderators work through the reports on the site's [dashboard](auth.md#the-dashboard), resolve or dismiss each, and act on what was reported through the plugin that owns it: hide a comment, close a submission. They suspend accounts for a while or for good. Every moderator action lands in auth's [audit log](auth.md#the-audit-log), which the Audit log panel shows.

The package is private until its npm release; it ships in this repository's workspace.

```ts
import { auth } from "@svartz/auth";
import { annotations } from "@svartz/plugin-annotations";
import { moderation } from "@svartz/plugin-moderation";

plugins: [
  auth({ providers: { … } }),
  annotations({ database: { env: "SVARTZ_DB" } }),
  moderation(),
]
```

Reports need accounts, so the vault needs `auth` with the [accounts database](auth.md#the-accounts-database) bound as `SVARTZ_DB`, and a Cloudflare target. The build fails, naming the vault, without `auth` or on a `node` target; without `SVARTZ_DB` every report answers 503.

Reports are kept in the accounts database, beside the accounts they name and the audit log. The plugin creates its tables there on first use, all starting with `moderation_`. Each resolve or dismiss commits in one transaction with its audit entry: no report closes without one.

| Option | Value |
| --- | --- |
| `limits.reportsPerHour` | Reports each reader may send per clock hour. Default 10. Every attempt counts, refused ones included. |

## Reporting

Every note on a theme page ends its page actions with **Report**, beside **Copy page** and **Edit**. A host app page that shows notes with `SvartzNoteContent` has no page actions of its own, so there only comments offer **Report**, each answered for the vault of the note it's on. On a [user page](auth.md#user-pages), `users/<handle>` or in the folder auth's `userPages` names, the dialog asks whether the page or the account is reported. On a vault with [annotations](annotations.md), other people's comments end with **Report** too. The dialog asks what's wrong, up to 1,000 characters, and thanks the reader once the report is in the queue. A signed-out reader gets the sign-in dialog instead and comes back to the page.

Any element marked `data-svartz-report="<kind>:<id>"` opens the same dialog for that target, named by its `data-svartz-report-label`:

```html
<button type="button" data-svartz-report="submission:42" data-svartz-report-label="Submission #42">Report</button>
```

| Kind | Named by | Reportable when |
| --- | --- | --- |
| `page` | Its slug, such as `garden/roses` | The last build published it, unprotected. |
| `annotation` | Its id | The vault has annotations and the comment is there, not hidden, on a page the last build published unprotected. |
| `account` | Its handle; an old handle is stored as the current one | An account holds or held it. |
| `submission` | Its pull request number | The vault has submissions. |
| `commit` | Its full 40-character SHA | The vault has submissions. |

Moderation doesn't call GitHub, so a submission or commit report is checked by form only, a number or a full SHA: nothing asks whether the repository holds it. Closing a submission checks that it's the vault's own. A reader's report of a target stays one report while it's open: sending it again changes nothing.

## The Reports panel

`/-/dashboard/moderation/reports/` lists the open reports, oldest first, each with what it's about as the site knows it now (the page's title, the comment and who wrote it, the account's name, a link to the pull request or commit on GitHub) and the reader's reason. **Closed** lists resolved and dismissed reports with who closed them and when. Moderators never see who sent a report.

- **Resolve** closes a report that was right, once something was done about it. **Dismiss** closes one that needs nothing. A report closes once, even when two moderators click at the same moment: the second is told someone was first, and the audit log holds only the first.
- **Hide comment** hides the reported comment through annotations, for a moderator who holds `annotations:comments:delete` on its page. It stays in the report, marked hidden. A hide commits in one transaction with its audit entry, so it needs annotations to keep its comments in the accounts database, `annotations({ database: { env: "SVARTZ_DB" } })`, as the example above does; with another binding the panel doesn't offer it.
- **Close submission** closes the reported pull request without merging it, through submissions, for a moderator who holds `submissions:reviews:write`. It shows only for a pull request the vault's own submissions saved, which takes submissions' [sync](../packages/plugin-submissions/README.md#github-sync): vaults that share a repository never close each other's.
- **Suspend @handle** opens the [suspension form](#suspensions) for the account behind the report, which offers to go back to the report, for a moderator who holds `moderation:accounts:write`. It shows on a report about an account; about a comment, for its author's account; and about a submission or a commit, for the account that saved it through the site. Submissions' [sync](../packages/plugin-submissions/README.md#github-sync) records which account opened each pull request and made each direct commit, and only that record names one: a commit's author, committer and `Svartz-Account` trailer are whatever its maker wrote. A commit or pull request the site didn't save, or saved for a guest, offers no Suspend.

Hiding, closing and suspending leave the report open, to resolve once done. Each shows only to a moderator who holds the owning plugin's permission, and its route checks that again. A report whose target's plugin has left the vault, or whose comment was deleted since, still shows, without those actions. A comment whose page the build no longer publishes, or now protects, shows without its text.

The panel reads what its reports are about in the same few D1 queries however many it lists, so a full page of reports stays inside a free Worker's 50 queries a request. When one plugin's data can't be read, its reports say so and the rest still show.

## Suspensions

A suspended account is a guest until its suspension ends: on every plugin it keeps what guests may do and loses everything else, from its next request on. It stays signed in, and its account page says why and until when, without naming the moderator. Once the suspension's time passes it has its rights back, with nothing to do. [Auth](auth.md#suspensions) keeps and enforces suspensions; this plugin offers the forms.

`/-/dashboard/moderation/suspensions/` lists the suspensions in force, each with its end and reason, and finds an account by handle. Each account's page there, `?handle=<handle>`, holds the form:

- **For how long**: 1 day, 1 week, 1 month (30 days) or for good.
- **Reason**, up to 1,000 characters. The suspended person reads it.

Suspending an account that's suspended replaces its suspension. While one is in force, the page shows it with **Lift suspension**, which ends it early. An account config names an admin can't be suspended, and neither can the moderator's own; the page says so instead of offering the form.

Moderators reach the form from the Reports panel and from user pages: on a [user page](auth.md#user-pages), a reader who holds `moderation:accounts:write` gets **Suspend** beside **Report**. Either way the form offers to go back where they came from.

Each suspension and lift commits with its audit entry, `auth:account:suspend` (with the reason and end) or `auth:account:lift`, on `account:<handle>`.

## The Audit log panel

`/-/dashboard/moderation/audit/` shows auth's audit log: every entry from every plugin, newest first, 50 at a time, with who made it (their handle then), what they did, on what, when, and its detail. **Who** keeps the entries of one account, under any handle it has held, and **On what** those on one target, exactly as listed. Both are GET parameters, `?actor=<handle>&target=<target>`, so a filtered view can be linked; each entry's handle and target link to the log filtered by them. The log is the whole site's, so a grant on one vault shows every vault's entries. The panel only reads: the log is append-only.

## Permissions

| Permission | Lets someone | Default |
| --- | --- | --- |
| `moderation:reports:write` | Report. | Every signed-in reader. |
| `moderation:reports:read` | Open the Reports panel, and resolve or dismiss reports. | Nobody but admins. |
| `moderation:accounts:write` | Open the Suspensions panel, and suspend and unsuspend accounts. | Nobody but admins. |
| `moderation:audit:read` | Open the Audit log panel. | Nobody but admins. |

Grant them on the dashboard's [People & permissions](auth.md#people--permissions). The plugin checks each on the vault; a grant on the site covers every vault. All but reporting are [administrative](auth.md#grants): owning a user page or a group linked to the vault gives none of them, so only the `admin` role or a grant does.

## Routes

Under `<base><mount>/_svartz/moderation/`. Failures answer `{ error, message }`, where `message` is written for the reader.

| Route | Does |
| --- | --- |
| `POST reports/` | Files `{ target: { kind, id }, reason }` for the signed-in reader and answers `201 { report: { id } }`. |
| `POST reports/<id>/resolve/` | A form post: resolves open report `<id>`, records it, and redirects to the panel. |
| `POST reports/<id>/dismiss/` | The same, dismissing it. |
| `POST accounts/suspend/` | A form post: suspends the account `handle` for `duration` (`day`, `week`, `month` or `for-good`) with `reason`, and redirects to `returnTo` with the outcome as `status`: `suspended`, or, changing nothing, `admin`, `self`, `not-found`, `duration-invalid` or `reason-invalid`. |
| `POST accounts/lift/` | A form post: lifts the suspension of the account `handle` and redirects to `returnTo` with `status` `lifted`, or `not-suspended` or `not-found`. |

A `returnTo` that isn't a path on this site, after normalizing too, sends the moderator to the account's suspension form instead.
| `GET viewer/` | `{ suspends }`: whether the reader may suspend accounts here, for the Suspend action on user pages. |

| Status | `error` | When |
| --- | --- | --- |
| 400 | `invalid_target`, `invalid_reason`, `invalid_json` | A target that isn't one of the kinds above or is malformed, a kind whose plugin the vault lacks, a reason that's empty or over 1,000 characters, or a body that isn't JSON. |
| 401 | `signed_out` | Nobody is signed in, or their account is suspended. |
| 403 | `cross_origin` | The `Origin` header is missing or names another site. |
| 403 | `forbidden` | A report from an account denied `moderation:reports:write`, a resolve or dismiss without `moderation:reports:read`, or a suspend or lift without `moderation:accounts:write`. |
| 404 | `not_found` | A page, comment or account that isn't there, or a report this vault doesn't have. |
| 413 | `too_large` | A body over 16 KiB. |
| 429 | `rate_limited` | The reader has spent their reports for the hour. Also includes `retryAfter` in seconds. |
| 503 | `misconfigured` | No `SVARTZ_DB`. |

Each resolve and dismiss is recorded as `moderation:report:resolve` or `moderation:report:dismiss` on `report:<id>`, with what the report was about. Annotations records hides as `annotations:comment:hide` and submissions records closes as `submissions:submission:close`.
