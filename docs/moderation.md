# Moderation

`@svartz/plugin-moderation` lets readers report what's wrong on a site: a page, a comment, an account, a submission or a commit, each with a reason. Moderators work through the reports on the site's [dashboard](auth.md#the-dashboard), resolve or dismiss each, and act on what was reported through the plugin that owns it: hide a comment, close a submission. Every moderator action lands in auth's [audit log](auth.md#the-audit-log).

The package is private until its npm release; it ships in this repository's workspace.

```ts
import { auth } from "@svartz/auth";
import { annotations } from "@svartz/plugin-annotations";
import { moderation } from "@svartz/plugin-moderation";

plugins: [
  auth({ providers: { … } }),
  annotations({ database: { env: "SVARTZ_DB" } }),
  moderation({ database: { env: "SVARTZ_DB" } }),
]
```

Reports need accounts, so the vault needs `auth` with the [accounts database](auth.md#the-accounts-database) bound as `SVARTZ_DB`, and a Cloudflare target. The build fails, naming the vault, without `auth` or on a `node` target; without `SVARTZ_DB` every report answers 503.

| Option | Value |
| --- | --- |
| `database` | The D1 binding reports are kept in, such as `{ env: "SVARTZ_DB" }`. The plugin creates its tables there on first use, all starting with `moderation_`, so it can share the accounts database. Sharing it lets each resolve or dismiss commit in one transaction with its audit entry; in another database, the report closes first and reopens if the entry can't be written. |
| `limits.reportsPerHour` | Reports each reader may send per clock hour. Default 10. Every attempt counts, refused ones included. |

## Reporting

Every note ends its page actions with **Report**, beside **Copy page** and **Edit**. On a [user page](auth.md#user-pages), `users/<handle>` or in the folder auth's `userPages` names, the dialog asks whether the page or the account is reported. On a vault with [annotations](annotations.md), other people's comments end with **Report** too. The dialog asks what's wrong, up to 1,000 characters, and thanks the reader once the report is in the queue. A signed-out reader gets the sign-in dialog instead and comes back to the page.

Any element marked `data-svartz-report="<kind>:<id>"` opens the same dialog for that target, named by its `data-svartz-report-label`:

```html
<button type="button" data-svartz-report="submission:42" data-svartz-report-label="Submission #42">Report</button>
```

| Kind | Named by | Reportable when |
| --- | --- | --- |
| `page` | Its slug, such as `garden/roses` | The last build published it, unprotected. |
| `annotation` | Its id | The vault has annotations and the comment is there, not hidden. |
| `account` | Its handle; an old handle is stored as the current one | An account holds or held it. |
| `submission` | Its pull request number | The vault has submissions. |
| `commit` | Its full 40-character SHA | The vault has submissions, whose repository it's in. |

A reader's report of a target stays one report while it's open: sending it again changes nothing.

## The Reports panel

`/-/dashboard/moderation/reports/` lists the open reports, oldest first, each with what it's about as the site knows it now (the page's title, the comment and who wrote it, the account's name, a link to the pull request or commit on GitHub) and the reader's reason. **Closed** lists resolved and dismissed reports with who closed them and when. Moderators never see who sent a report.

- **Resolve** closes a report that was right, once something was done about it. **Dismiss** closes one that needs nothing. A report closes once, even when two moderators click at the same moment: the second is told someone was first, and the audit log holds only the first.
- **Hide comment** hides the reported comment through annotations, for a moderator who holds `annotations:comments:delete` on its page. It stays in the report, marked hidden.
- **Close submission** closes the reported pull request without merging it, through submissions, for a moderator who holds `submissions:reviews:write`.

Hiding and closing leave the report open, to resolve once done. Each shows only to a moderator who holds the owning plugin's permission, and its route checks that again. A report whose target's plugin has left the vault, or whose comment was deleted since, still shows, without those actions.

## Permissions

| Permission | Lets someone | Default |
| --- | --- | --- |
| `moderation:reports:write` | Report. | Every signed-in reader. |
| `moderation:reports:read` | Open the Reports panel, and resolve or dismiss reports. | Nobody but admins. |
| `moderation:accounts:write` | Suspend and unsuspend accounts. | Nobody but admins. |
| `moderation:audit:read` | Read the audit log. | Nobody but admins. |

Grant them on the dashboard's [People & permissions](auth.md#people--permissions). The plugin checks each on the vault; a grant on the site covers every vault.

## Routes

Under `<base><mount>/_svartz/moderation/`. Failures answer `{ error, message }`, where `message` is written for the reader.

| Route | Does |
| --- | --- |
| `POST reports/` | Files `{ target: { kind, id }, reason }` for the signed-in reader and answers `201 { report: { id } }`. |
| `POST reports/<id>/resolve/` | A form post: resolves open report `<id>`, records it, and redirects to the panel. |
| `POST reports/<id>/dismiss/` | The same, dismissing it. |

| Status | `error` | When |
| --- | --- | --- |
| 400 | `invalid_target`, `invalid_reason`, `invalid_json` | A target that isn't one of the kinds above or is malformed, a kind whose plugin the vault lacks, a reason that's empty or over 1,000 characters, or a body that isn't JSON. |
| 401 | `signed_out` | Nobody is signed in. |
| 403 | `cross_origin` | The `Origin` header is missing or names another site. |
| 403 | `forbidden` | A report from an account denied `moderation:reports:write`, or a resolve or dismiss without `moderation:reports:read`. |
| 404 | `not_found` | A page, comment or account that isn't there, or a report this vault doesn't have. |
| 413 | `too_large` | A body over 16 KiB. |
| 429 | `rate_limited` | The reader has spent their reports for the hour. Also includes `retryAfter` in seconds. |
| 503 | `misconfigured` | No `SVARTZ_DB`, or no database under `database`. |

Each resolve and dismiss is recorded as `moderation:report:resolve` or `moderation:report:dismiss` on `report:<id>`, with what the report was about. Annotations records hides as `annotations:comment:hide` and submissions records closes as `submissions:submission:close`.
