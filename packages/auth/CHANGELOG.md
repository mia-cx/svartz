# @svartz/auth

## 2.6.0

### Patch Changes

- 1ddaf7e: A note named exactly after its folder is that folder's note, as with Obsidian's folder notes: `Guides/Guides.md` publishes at `/guides/`, names and introduces the `Guides` listing, and can't set `slug`, as `Guides/index.md` and `Guides/_index.md` do. Wikilinks to `[[Guides]]` still find it, and the `closest` and `shallowest` link strategies rank notes by where their files sit, not by their URLs.

  When a folder holds more than one folder note, `index` comes first, then `_index`, then the note named after the folder. The first present names the folder's listing and sets its `order`. It takes the folder's URL unless another note, such as a root `guides.md`, already holds it. The others take numbered URLs (`/guides-2/`), as in any collision.

  A note named after its folder that sets `slug` now fails the build, as other folder notes do: `Guides/Guides.md` with `slug: overview` used to publish at `/guides/overview/`. Before upgrading, remove its `slug`. If the old URL must keep working, add it as an alias: `aliases: [guides/overview]`.

  An account can no longer take the user page folder's own name as its handle (`users` by default), since `users/users.md` is that folder's note rather than a user page. The handle chooser offers `users-2` instead.

- dbf8b88: Svartz's plugin packages carry the npm keyword `svartz-plugin`, and its themes `svartz-theme`, so an npm search for either keyword finds them. Tag your own Svartz plugin or theme the same way to be found beside them.
- Updated dependencies [8f0291d]
- Updated dependencies [ba0f490]
  - @svartz/core@2.6.0

## 2.5.0

### Minor Changes

- 03747e2: Readers manage their account at `<mount>/-/account/`, in the site's own shell. They change their display name and handle, link another sign-in provider and unlink one while another remains, see their sessions, and sign out everywhere. An old handle keeps pointing at its account for good and can't be taken by anyone else: `GET <mount>/_svartz/auth/users/<old>/` redirects to the current handle, and `findProfile(handle, env)` from `@svartz/auth/server` answers the same for plugins. A provider account another account already has can't be linked, and a link only lands on the browser session that started it.

  The page needs a server target and `SVARTZ_DB`. A host app needs the plugin page route that `npx svartz init` adds; without it, a host build with auth fails and says how to add it.

- 7f28eb7: Plugins can show a page about an account. `findStanding(handle, env)` from `@svartz/auth/server` answers the account that holds or held `handle`, under its current handle, with its id, its user page under any handle it has held, and its reputation: its score and the next threshold it hasn't reached. `userPageOf(handle)` answers the URL of the user page at a handle. Show the next threshold only to the account itself.

  The Reputation section of `/-/account/` leaves an empty `data-svartz-region="account-activity"` element, its `data-svartz-handle` naming the account, where plugins' browser scripts add links to the account's activity. It takes no space while empty.

- 8677494: `auditIfChanged(db, entry)` from `@svartz/auth/server` is the statement that appends `entry` to the audit log only when the statement before it in the same batch changed a row. A plugin whose change keeps its rows in `SVARTZ_DB` batches the two, so a change its own guard leaves undone, such as hiding a comment already hidden, records nothing.
- 22acec7: Signing in now creates a real account. Bind a D1 database as `SVARTZ_DB` and auth keeps each reader's account, linked provider accounts and sessions there, creating its tables on first use. A reader's first sign-in asks them to choose a handle, prefilled from their provider username. The session cookie holds only a session id, so deleting the session in D1 signs that browser out on its next request.

  Server plugins read the signed-in person with `readAccount(request, env)` from `@svartz/auth/server`, and the reason there is none with `readSignIn`. `readIdentity` keeps working unchanged. `auth({ admins: ["github:583231"] })` names bootstrap admins, whose accounts always hold the `admin` role whatever the database says.

  Readers signed in before this release stay signed in: their cookie becomes an account and a session the first time a plugin reads it. Without `SVARTZ_DB`, as on Node, sign-in works as before, with no accounts.

- 34fe812: Accounts can form groups, such as a wiki's alliances. Any signed-in reader creates a group from the Groups section of `/-/account/` and owns it. Each group has a page at `<mount>/-/groups/<name>/`, shown only to its members, where owners invite accounts by handle, make members co-owners and remove members, and members leave. An invited account joins only by accepting on its account page. A group always keeps at least one owner.

  Grants can name a group in People & permissions, and every member holds them; a group's grants rank below an account's own and above its roles'. A moderator who holds the new `auth:group-links:write` permission links a group to a vault, folder or page from the dashboard's Groups panel, which gives the group's owners every content permission there and below. Linking has no default, so only admins hold it until granted, and every link, unlink and membership change is recorded in the audit log.

  A plugin can declare a permission with `administrative: true` when it administers the site rather than a page's content. Owning a user page or a group's linked pages never gives such a permission; only the `admin` role or a grant does. Auth's own permissions are administrative, and each grant, role and link change is checked on the object it lands on.

- c2b0f0d: Plugins can take reputation back when the content it was earned for is undone. `reverseReputation(env, reversals)` from `@svartz/auth/server` takes back what each `edit` or `page` event, named by its account and the `ref` it was posted with, earned that account: one `reversal` entry per event in the ledger, all in one transaction. An event is taken back once however often it is reversed, an event reversed before it was posted scores nothing when it is, and an event that earned the account nothing gets no entry. A lower score never takes away a role the account already holds.
- 11aedab: Accounts can be suspended. While a suspension is in force, every session of the account reads as signed out: `readAccount` answers `null` and `readSignIn` answers `{ account: null, reason: "suspended", suspension: { reason, until?, since } }`, so the account is a guest on every plugin, with no plugin changing. The check joins the session's own D1 batch, so a signed-in request costs no extra call. Sessions are kept, and the account is signed in again once the suspension's `until` passes; one without `until` lasts until it's lifted. An account config's `admins` names is never suspended and never locked out.

  Server plugins suspend and lift with `suspend(env, actor, { handle, reason, until? })` and `liftSuspension(env, actor, handle)` from `@svartz/auth/server`, each committed with its audit entry, `auth:account:suspend` or `auth:account:lift`; `suspend` refuses an admin and the actor's own account. `findSuspension(handle, env)` and `listSuspensions(env)` read them. The caller checks who may; `@svartz/plugin-moderation` checks `moderation:accounts:write`.

  A suspended reader's `/-/account/` says why and until when, without naming the moderator, and offers **Sign out**. `POST sign-out/` takes a same-site `?returnTo=<path>` and redirects there, so a plain form can sign out. `GET viewer/` answers `{ suspended: true }` for a suspended reader, and the site actions keep the **Account** link for them.

  `readAuditLog(env, { actor?, target?, before?, limit? })` reads the audit log, newest first, a page at a time in one query, filtered by who made each entry (any handle they've held) and by its exact target. `findProfileByIdentity(identity, env)` answers the account a provider account such as `github:583231` is linked to.

  For pages that list many things at once, `findProfilesByIdentity(identities, env)` and `findProfilesByHandle(handles, env)` answer many accounts in one D1 query, by what was asked, and `canEach(account, permission, targets, env)` checks a permission on many targets, such as the pages of a queue of comments, in the D1 calls one `can()` makes.

- 142f796: Sites with accounts get a dashboard at `<mount>/-/dashboard/`. It lists, by plugin, every panel the viewer holds the permission for, and answers 404 to anyone who holds none. Auth adds the first panel, People & permissions: grant, deny or unset any permission for an account or a role on the whole site, a vault, a folder or a page; create roles and choose who holds them; check whether an account may do something somewhere and see what decided it; find accounts; and read every permission the site's plugins declare. It needs `auth:grants:read` to open and `auth:grants:write` to change anything, which only admins hold until granted. Either is as powerful as being an admin.

  Stored roles are new: grants can name a role, accounts hold roles, and `Account.roles` lists them after `admin`. The `admin` role still comes only from `admins` in config.

  Every grant and role change is recorded in an append-only audit log in `SVARTZ_DB`, in the same transaction as the change. Server plugins record their own changes with `audit(env, entry, changes?)` from `@svartz/auth/server`. Signed-in readers find Account and, when they hold a panel, Dashboard links in the site actions.

- b82cf41: `findProfiles(ids, env)` from `@svartz/auth/server` answers the public profiles of the accounts with those ids, by id, for plugins that stored an account's id and need to show who it is. Ids no account has are left out.
- f6cf60e: Server plugins can list the provider accounts linked to an account. `linkedIdentities(account, env)` from `@svartz/auth/server` answers each one, the first linked first, with the profile it last signed in with, so a plugin can find a reader's GitHub account even when they signed in with Discord. It answers `[]` when the site binds no `SVARTZ_DB`.
- a863185: Plugins can declare permissions and check them with one call. A plugin lists what it checks under `permissions`, as `namespace:feature:action` slugs with a name, a description and optional defaults for the built-in actors `guest` (everyone) and `signed-in` (everyone with an account). Auth collects the declarations at build time, a theme preset's plugins included, and fails the build on a malformed one. Build hooks can read every plugin the build runs as `ctx.plugins`.

  `can(account, permission, object, env)` from `@svartz/auth/server` answers whether an account, or a guest, holds a permission on the site, a vault or a page. Grants live in `SVARTZ_DB` and give an actor `allow`, `deny` or `unset` on an object: the most specific object with a grant that applies decides, then the most specific actor, and a deny beats an allow between equals. Admins are allowed everything, and every account everything on its own `users/<handle>` page. Without `SVARTZ_DB`, `can()` answers `false`.

  Annotations now declares `annotations:comments:write`, which every signed-in reader holds by default, and `annotations:comments:delete`, which lets a reader delete anyone's annotations on a page. On a site with accounts, each identity in the `moderators` option becomes a grant of `annotations:comments:delete` on the vault once its owner has an account, and the grant decides from then on. `moderators` is deprecated; grant the permission instead. Sites without `SVARTZ_DB` keep using the list.

- 3aac18d: An account's reputation now shows beside its name wherever the site names it, the way rep shows on Stack Exchange: a compact number such as `1,234`, or `12.5K` past ten thousand, read in full by screen readers and in its tooltip.
  - `@svartz/auth`: every public profile (`findProfile`, `findProfiles`, `findProfilesByHandle`, `findProfilesByIdentity`) carries `reputation`, from the same query. Render it with `reputationBadgeHtml(score)` from the new `@svartz/auth/badge` entry, or `reputationBadge(score)` from `@svartz/auth/browser`; its style is in `@svartz/auth/browser.css`.
  - `@svartz/plugin-annotations`: the page's list gives each comment the `reputation` of the account its author's sign-in is linked to, and the comment card shows it beside the author's name.

- 8c57dcf: Accounts earn reputation, and reputation can promote them. Each account's score is the sum of its entries in an append-only ledger in `SVARTZ_DB`; each event, such as a merged edit or a **+1** on a comment, is recorded once however often it is reported. Server plugins post events with `postReputation(env, event)` from `@svartz/auth/server`.

  By default a merged edit scores 1 + log2 of the lines it changed, a merged new page 5, a **+1** received on a comment 0.5, a moderator's kudos 5, and a declined pull request 0, and an account earns at most 100 points a day from edits, pages and **+1**s. Admins change these on the dashboard's new Reputation panel, and set thresholds there: an account whose score reaches a threshold gets its role, with an entry in the audit log. Nothing takes a role away automatically. A role reputation gave can only be removed by an admin, and once removed, reputation never gives it back.

  Moderators who hold the new `auth:kudos:write` permission give kudos, with a reason, on the Kudos panel: at most one a day to each account, never to themselves. Readers see their score and next threshold on `/-/account/`. An account's user page shows its score to everyone, and its next threshold to its owner, and `GET <mount>/_svartz/auth/users/<handle>/` answers an account's score as `reputation`.

- 2c11831: Every account has a user page: the note at `users/<handle>` in the vault that runs sign-in, on which its account holds every permission whatever the grants say. In a host app with several vaults, that is the callback vault; the same path in another vault is an ordinary page. The new `userPages` option names another folder, such as `auth({ providers, userPages: "people" })`; host vaults must set the same one. The override covers the page itself, not pages below it.

  A user page stays its owner's after a handle change: it keeps its address, and the override follows every handle the account has held, which no other account can take. A handle whose user page already exists is taken unless the account held it before, so nobody gains a page someone else wrote by choosing its handle.

  The account page links the reader's user page as **Your page**. While they have none, the account page of the vault that holds user pages leaves an empty `data-svartz-region="user-page-actions"` element beside their name for a plugin that writes pages to fill; `@svartz/plugin-submissions` puts **Create your page** there. Plugins read where user pages live with `userPageLocation()` from `@svartz/auth/server`. In a host app, the account page's profile form posts to the callback vault, which checks the new handle against its user pages, and returns to the account page it came from.

### Patch Changes

- 7119bad: The dashboard checks every panel's permission in one D1 call. It made one call per panel, so each panel a plugin added cost every dashboard view another query of the 50 a free Worker gets per request.
- e42d690: A permission check reads its grants and the account's groups in one D1 call. It made two, which pushed a dashboard view with several panels toward the 50 queries a free Worker gets per request.
- Updated dependencies [34fe812]
- Updated dependencies [142f796]
- Updated dependencies [e44be06]
- Updated dependencies [5178445]
- Updated dependencies [03747e2]
- Updated dependencies [a863185]
  - @svartz/core@2.5.0

## 2.4.0

### Minor Changes

- a4c869f: One sign-in covers every host vault in an app. Every vault's sign-in runs through `callbackVault` (default: the first host vault that enables auth), so each provider needs one callback URL, and the session reads as signed in on every vault. A `callbackVault` that names no vault, a vault without auth, or a vault missing one of the providers fails config loading, naming the vault. Plugins can now read sibling vaults through a `forVault({ vault, vaults })` hook that runs at config resolution. See "Several vaults" in `docs/auth.md`.
- 626d6f1: New package: readers sign in with GitHub through `auth({ providers: { github: { clientId, clientSecret: { env } } } })`, and server plugins read who is signed in with `readIdentity(request, env)` from `@svartz/auth/server`. The session is an AES-GCM sealed cookie keyed by `PRIVATE_SVARTZ_SESSION_SECRET`; only the reader's identity is kept. Any element with `data-svartz-sign-in` opens the sign-in dialog, which can link the site's privacy notice. See `docs/auth.md`.
- 832fc32: Readers can sign in with Google (`providers.google`) or Discord (`providers.discord`), and the sign-in dialog shows each brand's mark. Their ids are `google:<sub>` and `discord:<user id>`. `Identity.handle`, `avatarUrl` and `profileUrl` are now optional: Google accounts have no username or public profile page. See `docs/auth.md` for each provider's console setup.
- ae978d6: Readers can sign in with X. `providers.x` asks only for `users.read tweet.read`, the scopes X requires to read the signed-in account, and never for the email address. The identity is `x:<user id>`, with name, handle, profile picture and profile link. The sign-in dialog shows X's logo. See "X setup" in `docs/auth.md`.

### Patch Changes

- 23bd2dd: The sign-in dialog works in a host app that sets SvelteKit's `paths.base`. Its provider links used to leave the base out and answer 404; the dialog now adds the deployment base it is mounted with, so standalone and host vaults both reach their sign-in routes.
- fe00cef: Closing the sign-in dialog reopens the popover its opener sat in, which opening the dialog had hidden, so focus goes back to a control the reader can see instead of falling to the page.
- Updated dependencies [020d144]
- Updated dependencies [a4c869f]
- Updated dependencies [7a1d5f9]
- Updated dependencies [d7303ae]
- Updated dependencies [d01cd5e]
- Updated dependencies [e46840b]
- Updated dependencies [6172acb]
- Updated dependencies [f55f8fa]
- Updated dependencies [14bc204]
- Updated dependencies [639e96d]
  - @svartz/core@2.4.0
