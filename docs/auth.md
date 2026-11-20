# Reader sign-in

`@svartz/auth` lets readers sign in with Google, Discord, X or GitHub, and lets [server plugins](server-plugins.md) read who is signed in. It needs no hosted service: [Arctic](https://arcticjs.dev) handles OAuth, and each reader's account and sessions live in the site's own D1 database.

```ts
import { defineConfig } from "@svartz/config";
import { auth } from "@svartz/auth";

export default defineConfig({
  version: "1.0.0",
  vaults: [{
    id: "notes",
    path: "vault",
    target: { type: "cloudflare-workers" },
    plugins: [auth({
      providers: {
        google: { clientId: "1234-example.apps.googleusercontent.com", clientSecret: { env: "PRIVATE_GOOGLE_CLIENT_SECRET" } },
        discord: { clientId: "1234567890123456789", clientSecret: { env: "PRIVATE_DISCORD_CLIENT_SECRET" } },
        x: { clientId: "M1M5R3BMVy13QmpScXkzTUt5OE46MTpjaQ", clientSecret: { env: "PRIVATE_X_CLIENT_SECRET" } },
        github: { clientId: "Iv23liExample", clientSecret: { env: "PRIVATE_GITHUB_CLIENT_SECRET" } },
      },
      privacyNotice: "/privacy/",
      admins: ["github:583231"],
    })],
  }],
});
```

The vault needs a server target (`cloudflare-workers`, `cloudflare-pages` or `node`), or a `host` target in an app that runs [`svartzHandle`](host-vaults.md#server-plugins).

| Option | Value |
| --- | --- |
| `providers` | The providers readers may use, in the order the sign-in dialog lists them. Each takes the OAuth app's `clientId` and names its secret with `clientSecret: { env: "NAME" }`. Choose from `google`, `discord`, `x` and `github`. |
| `privacyNotice` | Optional URL of the site's privacy notice. The sign-in dialog links to it. A site that stores readers' names and avatars owes them one. |
| `callbackVault` | Optional id of the host vault that runs every sign-in in the app. Defaults to the first host vault that enables auth. See [several vaults](#several-vaults). |
| `admins` | Optional identity ids, such as `"github:583231"`, whose accounts always hold the `admin` role. See [bootstrap admins](#bootstrap-admins). |
| `userPages` | Optional folder of the vault that holds [user pages](#user-pages), such as `"people"`. Defaults to `"users"`. |

## The accounts database

Bind a D1 database as `SVARTZ_DB`. Auth creates its tables there on the first request that needs them, and upgrades them the same way in later releases; there are no migrations to run. Its tables all start with `auth_`, so other plugins, such as [annotations](annotations.md), can keep theirs in the same database.

On a `cloudflare-workers` vault, bind it in the target, which is the Worker's [Wrangler config](server-plugins.md#deploying-to-cloudflare):

```ts
target: {
  type: "cloudflare-workers",
  d1_databases: [{ binding: "SVARTZ_DB", database_name: "notes", database_id: "<the id `wrangler d1 create notes` printed>" }],
},
```

A host app or a `cloudflare-pages` vault binds it in its own Wrangler config, such as `[[d1_databases]]` in `wrangler.toml`.

The binding has a fixed name, like the session secret, because every server plugin reads accounts from it. Under `svartz dev`, Wrangler's local D1 stands in.

Without `SVARTZ_DB`, as on a `node` target, readers still sign in, but nobody has an account: the session cookie holds the provider account itself, there is no handle chooser, and [`readAccount`](#reading-the-signed-in-reader-from-a-plugin) answers `null`.

## Secrets

Set two secrets on the server, never in config:

- `PRIVATE_SVARTZ_SESSION_SECRET`: a random value of at least 32 characters, such as the output of `openssl rand -base64 32`. Every Svartz plugin reads sessions with it. Changing it signs everyone out. The `PRIVATE_` prefix keeps it visible to hosts that set SvelteKit's `env.privatePrefix` to `PRIVATE_`.
- Each provider's client secret, under the name its `clientSecret.env` gives.

On Workers, `wrangler secret put PRIVATE_SVARTZ_SESSION_SECRET`. On Node, set them in the process environment, along with `ORIGIN` (such as `ORIGIN=https://notes.example`) so the callback URL the provider sees uses your real origin. Under `svartz dev`, put them in `.env`.

Without `PRIVATE_SVARTZ_SESSION_SECRET`, every auth route answers 503 naming it.

Each provider calls back to `https://<your host><base><mount>/_svartz/auth/callback/<provider>/`, such as `https://notes.example/_svartz/auth/callback/google/`. Register that URL with the provider, once per environment you deploy. In a host app with several vaults, `<mount>` is the callback vault's.

## Several vaults

Host vaults share one app and one origin, so one sign-in covers all of them. Every vault's sign-in runs through one callback vault, so each provider needs a single callback URL, which matters for a GitHub OAuth App's single one. The callback vault is the first host vault that enables auth, or the one `callbackVault` names:

```ts
const signIn = {
  providers: { github: { clientId: "Iv23liExample", clientSecret: { env: "PRIVATE_GITHUB_CLIENT_SECRET" } } },
  callbackVault: "journal",
};

export default defineConfig({
  version: "1.0.0",
  vaults: [
    { id: "journal", path: "./content/journal", mountPath: "/journal", target: { type: "host" }, plugins: [auth(signIn)] },
    { id: "work", path: "./content/work", mountPath: "/work", target: { type: "host" }, plugins: [auth(signIn)] },
  ],
});
```

Here a reader who signs in on a `/work/` page goes through `/journal/_svartz/auth/`, the provider calls back to `/journal/_svartz/auth/callback/github/`, and the reader lands back on the `/work/` page. The session cookie is set for the whole origin, so every vault reads them as signed in. The other vaults' `start/` routes forward to the callback vault's, and their `callback/` routes answer 404.

A vault may offer fewer providers than the callback vault, but not more. Config loading fails, naming the vault, when `callbackVault` names no vault, a vault without auth, a vault missing one of this vault's providers, or a vault that sends its own sign-in elsewhere. The simplest setup sets the same `callbackVault` on every host vault, or leaves it unset everywhere. Each standalone vault is its own app, so it runs its own sign-in and can't set `callbackVault` to another vault.

## Google setup

1. In the [Google Cloud console](https://console.cloud.google.com/auth/overview), open **Google Auth Platform** for your project and fill in **Branding** (app name, support email) and **Audience** (External).
2. Under **Clients**, create a client of type **Web application**. Add the callback URL, ending in `/callback/google/`, under **Authorized redirect URIs**; a client takes several, so staging and production can share one.
3. Copy the **Client ID** into `providers.google.clientId`, and store the **Client secret** under the env name you chose.
4. Under **Audience**, publish the app. While it is in testing, only the test users you list can sign in.

Sign-in asks Google for `openid profile`: the account's name and picture, not its email address. Google accounts have no username or public profile page, so a Google identity has no `handle` or `profileUrl`.

## Discord setup

1. In the [Discord Developer Portal](https://discord.com/developers/applications), create an application.
2. Under **OAuth2 → Redirects**, add the callback URL, ending in `/callback/discord/`. An application takes several.
3. Copy the **Client ID** into `providers.discord.clientId`, reset the **Client Secret**, and store it under the env name you chose.

Sign-in asks Discord for `identify`: the account's username, display name and avatar, not its email address.

## X setup

1. In the [X Developer Console](https://console.x.com), create an app.
2. In the app's user authentication settings, turn on OAuth 2.0 and choose **Web App**, which makes it a confidential client with a client secret.
3. Add the callback URL, ending in `/callback/x/`, as a callback URL; in a host app with several vaults, that is the [callback vault's](#several-vaults). It must match exactly, trailing slash included. An app takes up to 10. X refuses `localhost`, so for local development use `http://127.0.0.1:<port>`.
4. Copy the **OAuth 2.0 Client ID** into `providers.x.clientId`, and store the **Client Secret** under the env name you chose. X shows the secret once.
5. Buy API credits. The X API is [pay-per-usage](https://docs.x.com/x-api/getting-started/pricing): each sign-in reads the account once, billed as one **User: Read**. Without credits, sign-in fails with "X didn't confirm the sign-in".

Sign-in asks X for `users.read tweet.read`. Reading the signed-in account requires both, and neither reveals the email address. Sign-in never reads or posts on the reader's behalf.

## GitHub setup

1. Create an OAuth app on GitHub: **Settings → Developer settings → OAuth Apps → New OAuth App**.
2. Set **Authorization callback URL** to the callback URL, ending in `/callback/github/`.
3. Copy the **Client ID** into `providers.github.clientId`, generate a client secret, and store it under the env name you chose.

An OAuth App takes exactly one callback URL, so it can't serve both staging and production. Either register one OAuth App per environment, or create a **GitHub App** instead (**Developer settings → GitHub Apps**), which accepts several callback URLs and signs readers in the same way. A GitHub App needs no permissions for sign-in.

Sign-in asks GitHub for no scopes: it reads only the public profile.

## First sign-in

The first time someone signs in, they choose a handle: the name they go by across the site, and later the address of their user page. The chooser is prefilled with the provider's username, or with the closest free variant (`octocat-2`) when someone has it. Google accounts have no username, so theirs starts from the display name. Signing in creates the account, links the provider account to it, and returns the reader to the page they started from. Every later sign-in with that provider account reaches the same account without asking.

A handle is 1 to 39 lowercase letters, numbers, hyphens and underscores, starting and ending with a letter or number and never with two hyphens in a row, and no two accounts share one. It is never `index` and never ends in `_index`, so it names its [user page](#user-pages)'s address exactly: page addresses collapse a run of hyphens, turn a trailing `_index` into `index`, and give `index` to the folder's own page. A provider username the rules refuse starts the chooser at its `-2` variant, such as `index-2`. The chooser lowercases what the reader types and drops a leading `@`. A reader has 15 minutes to choose; after that they sign in again.

## What is kept

Each **account** has an id, its handle, a display name and avatar taken from the provider at first sign-in, and when it was created. Each **identity** is a provider account linked to one account, with the profile it last signed in with:

```ts
{
  id: "github:583231",   // provider and stable account id, never the username
  provider: "github",
  name: "The Octocat",   // falls back to the handle
  handle: "octocat",
  avatarUrl: "https://avatars.githubusercontent.com/u/583231",
  profileUrl: "https://github.com/octocat",
}
```

| Provider | `id` | `handle` | `avatarUrl` | `profileUrl` |
| --- | --- | --- | --- | --- |
| Google | `google:<sub>` | none | the account's picture, when Google gives one | none |
| Discord | `discord:<user id>` | username | the avatar, or Discord's default one | `https://discord.com/users/<user id>` |
| X | `x:<user id>` | username | the profile picture, when X gives one | `https://x.com/<username>` |
| GitHub | `github:<user id>` | login | the avatar | the profile page |

`name` is always set: the display name, falling back to the handle, or to "Google user" when Google withholds the name. Check `handle`, `avatarUrl` and `profileUrl` before showing them.

The provider's access token is used once, to read the profile, and then dropped; it is never stored or sent to the browser.

## Sessions

Each sign-in starts a **session** in D1 that lasts 30 days. The `__Host-svartz-session` cookie (`HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`) holds only its id, encrypted with AES-GCM under a key HKDF derives from `PRIVATE_SVARTZ_SESSION_SECRET`. Every read looks the session up, so deleting it signs that browser out on its next request, along with any copy of the cookie. Signing out deletes it. A tampered, expired or wrong-key cookie reads as signed out.

Readers see their sessions and sign out everywhere on [the account page](#the-account-page). To sign an account out everywhere yourself, delete its sessions with Wrangler, and record its linked provider accounts as signed out so no cookie from before accounts starts a new one:

```sh
wrangler d1 execute notes --remote --command "DELETE FROM auth_sessions WHERE account_id = (SELECT id FROM auth_accounts WHERE handle = 'octocat');
  INSERT OR REPLACE INTO auth_signed_out_identities (identity_id, signed_out_at) SELECT i.id, datetime('now') FROM auth_identities i JOIN auth_accounts a ON a.id = i.account_id WHERE a.handle = 'octocat'"
```

Cookies from before accounts held the identity itself. Each becomes an account and a session the first time a plugin reads it, with the closest free handle to the provider's username, so the upgrade signs nobody out and asks nobody anything. In a host app, a cookie whose provider account has no account yet reads as signed out until the [vault that holds user pages](#user-pages) has answered a request, since only its build says which handles its user pages take. Every later read of that cookie reaches the same session; once that session is deleted or signed out, the old cookie never starts another. One never read before its account signs out everywhere never becomes a session either, even after its provider account is linked to another account.

Local development over `http://localhost` works in Chrome and Firefox, which accept `Secure` cookies there.

## Suspensions

A moderator can suspend an account for a while or for good, with a reason, through [moderation](moderation.md#suspensions). While a suspension is in force, every session of the account reads as signed out: `readAccount` answers `null`, so the account is a guest on every plugin and keeps only what guests may do. Its sessions are kept, so once the suspension ends it is signed in again without doing anything. A suspension ends when its time passes, checked on each read; nothing sweeps or schedules. A new suspension replaces the one in force, and lifting one early is its own action.

The check is part of reading the session: the same D1 batch, so a signed-in request costs no extra call. The [account page](#the-account-page) tells a suspended reader why and until when, never who suspended them, and lets them sign out. An account any of whose provider accounts `admins` names is never suspended, and stays signed in even when config named it after its suspension.

Suspensions are kept in `auth_suspensions`, one row per account. Server plugins change and read them through `@svartz/auth/server`; the caller decides who may:

| Call | Does |
| --- | --- |
| `suspend(env, actor, { handle, reason, until? })` | Suspends the account that holds or held `handle` until the `Date` `until`, or for good without it. Answers `"suspended"`, or, writing nothing, `"not-found"`, `"admin"` for an account config names an admin, or `"self"` for `actor`'s own. Records `auth:account:suspend` on `account:<handle>`, with `{ reason, until }`, in the same transaction. |
| `liftSuspension(env, actor, handle)` | Ends the suspension in force early: `"lifted"`, recording `auth:account:lift`; `"not-suspended"`, recording nothing, when none is in force; or `"not-found"`. |
| `findSuspension(handle, env)` | The account, `{ id, handle, name, admin, suspension? }`, for a moderator about to act on it. |
| `listSuspensions(env)` | Every suspension in force, the most recent first, each `{ handle, name, suspension }`. |

A `suspension` is `{ reason, until?, since }`, the times in ISO 8601; `until` is absent for good. `actor` is the signed-in moderator, from `readAccount`. `suspend` and `liftSuspension` throw without `SVARTZ_DB`.

## Bootstrap admins

`admins` lists identity ids whose accounts always hold the `admin` role, so a fresh site has someone who can grant everything else. The role comes from config, not from the database, so nothing stored there takes it away; to remove an admin, take them off the list and deploy. An account holds the role when any provider account linked to it is listed. Each id's provider must be one the vault offers, or the build fails.

Host vaults share accounts, so every host vault that enables auth must list the same admins, or the build fails.

Auth starts before the site answers any request, so server plugins and a host app's own routes behind `svartzHandle` always read this deployment's list. Code that calls `readAccount` without `svartzHandle` in its hooks sees no admins.

## User pages

Each account has a user page: the note at `users/<handle>` in the vault that runs sign-in, such as `users/ada.md`. Its account holds every permission on it, whatever the [grants](#grants) say, so with [submissions](../packages/plugin-submissions/README.md#modes) its owner's edits commit straight to the repository and everyone else's go to review. The override covers the page itself, not pages below it such as `users/ada/drafts`; to give an account a folder of its own, grant it on `folder:<vault>/users/ada/`.

User pages live in one vault per app. A standalone vault holds its own. In a host app with several vaults, the [callback vault](#several-vaults) holds them all: it runs every sign-in and every handle change, so it alone decides which handles are taken. A `users/<handle>` page in any other host vault is an ordinary page, with no override, and doesn't reserve its handle. A host app whose vaults name different callback vaults has no user pages at all, since no single vault would allocate every handle.

`userPages` names another folder, written as page addresses spell it: lowercase letters, numbers, single hyphens and underscores, with `/` between folders, such as `"people"` or `"wiki/people"`. Host vaults share accounts, so every host vault that enables auth must set the same folder, or the build fails.

The [account page](#the-account-page) links the reader's user page, from every vault's account page. While they have none, a plugin that writes pages can offer to start it on the account page of the vault that holds user pages; [submissions](../packages/plugin-submissions/README.md#new-page) offers **Create your page**.

A user page stays where it was written when its owner changes handle: `users/ada` stays at its address, and stays Ada's, since an old handle never passes to another account. To move it to the new handle, its owner sets `slug: lovelace` in its frontmatter and lists `users/ada` under `aliases`, so links to the old address redirect; both addresses are theirs, so the edit commits. The page moves once the site rebuilds.

A handle whose user page already exists is taken, unless the account choosing it held it before: otherwise taking the handle would take a page someone else wrote. The handle chooser suggests the next free one. Which pages exist is read from the last build of the vault that holds user pages, so a page added since doesn't count until the site rebuilds.

## Routes

Under `<base><mount>/_svartz/auth/`, where `<base>` is the deployment base path, if any:

| Route | Does |
| --- | --- |
| `GET start/<provider>/?returnTo=<path>` | Redirects to the provider. The OAuth state and PKCE verifier wait in a 10-minute sealed cookie. `returnTo` must be a path on the same site; anything else answers 400. Without it, the reader returns to the vault's home. |
| `GET callback/<provider>/` | Completes sign-in and redirects to `returnTo`, or to `handle/` on a first sign-in. A reader who declines at the provider returns there, and any session they already had stays as it was. |
| `GET handle/` | The handle chooser for a first sign-in. Without one waiting, it says the sign-in expired. |
| `POST handle/` | Creates the account with the form's `handle` and redirects to `returnTo` signed in. A taken or malformed handle shows the chooser again, answering 422. Refused from another origin. |
| `GET me/` | The identity the reader signed in with, or `null`. |
| `POST sign-out/?returnTo=<path>` | Ends the session; answers 204, or with `returnTo`, as a form posts it, redirects there. Refused from another origin, and with a `returnTo` that isn't a path on the same site. |
| `POST account/profile/?returnTo=<path>` | Sets the signed-in account's display name (`name`) and handle (`handle`), then redirects to `returnTo`, or to the account page without it. Only the callback vault answers it. |
| `POST account/unlink/` | Unlinks the provider account named by `identity` and ends its sessions, then redirects to the account page. |
| `POST account/sign-out-everywhere/` | Ends every session of the signed-in account, this one included, then redirects to the account page. |
| `POST account/link/<provider>/?returnTo=<path>` | Starts linking another provider to the signed-in account. Only the callback vault answers it. |
| `GET users/<handle>/` | The public profile and [reputation](#reputation) score, `{ handle, name, avatarUrl, reputation }`, or a 308 from an old handle to the current one's URL. |
| `GET reputation/?page=<path>` | For the user page at `path`, below the deployment base: `{ handle, score }` of its owner, with `next`, `{ role, score }`, when the owner asks. `null` for any other page. |
| `GET viewer/` | `{ handle, dashboard }` for a signed-in account, where `dashboard` says whether [the dashboard](#the-dashboard) has a panel for them; `{ suspended: true }` for a [suspended](#suspensions) one; `null` otherwise. |
| `POST people/grant/` | Sets the grant of `permission` for an account (`actor-type=account`, `actor=<handle>`) or a role (`actor-type=role`, `actor=<name>`) to `value` (`allow`, `deny` or `unset`), on the object `scope` (`site` or `vault:<id>`) and `path` (empty, a folder ending in `/`, or a page) name, or `object` names whole. Redirects to People & permissions. |
| `POST people/role/` | Creates the role `name`, then redirects to People & permissions. |
| `POST people/member/` | Gives the account `handle` the role `role`, then redirects to People & permissions. |
| `POST people/member/remove/` | Takes the role `role` from the account `handle`, then redirects to People & permissions. A role [reputation](#thresholds) gave only an admin can take. |
| `POST reputation/points/` | Sets every [weight](#weights) and the daily limit: `edit`, `page`, `agreement`, `kudos`, `declined` and `daily-limit`, each a number within its bounds. Redirects to Reputation. |
| `POST reputation/threshold/` | Sets the `score` at which accounts get the stored role `role`, then redirects to Reputation. |
| `POST reputation/threshold/remove/` | Removes the threshold of `role`, then redirects to Reputation. Nobody loses the role. |
| `POST reputation/kudos/` | Gives the account `handle` [kudos](#kudos) with a `reason`, then redirects to Kudos. |
| `POST groups/` | Creates the [group](#groups) `name`, titled `display-name`, owned by the signed-in account, then redirects to its page. |
| `POST groups/<name>/invite/` | Invites the account `handle`. Owners only. |
| `POST groups/<name>/uninvite/` | Withdraws the invitation of the account `handle`. Owners withdraw anyone's; an invited account declines its own. |
| `POST groups/<name>/accept/` | Accepts the signed-in account's own invitation. |
| `POST groups/<name>/remove/` | Takes the account `handle` out of the group. Owners remove anyone; a member removes themselves to leave. The last owner can't leave. |
| `POST groups/<name>/promote/` | Makes the member `handle` an owner. Owners only. |
| `POST groups/link/` | Links the group `group` to the vault, folder or page `scope` and `path` name, then redirects to the Groups panel. |
| `POST groups/unlink/` | Unlinks the group `group` from `object`, then redirects to the Groups panel. |

Providers the config doesn't list answer 404. Without `SVARTZ_DB`, `handle/` and the `account/` routes answer 503. The `account/` routes answer 403 to a request whose `Origin` is missing or another site's, and send a signed-out reader to the account page. The `people/` routes answer 403 to a request whose `Origin` is missing or another site's, and to anyone without `auth:grants:write` on the vault. The `groups/` routes answer 403 to a request whose `Origin` is missing or another site's, send a signed-out reader to the account page, and act only as the signed-in account: a group's member routes answer 404 to anyone outside the group and 403 to a member who isn't an owner, and `groups/link/` and `groups/unlink/` answer 403 to anyone without `auth:group-links:write` on the vault. The `reputation/` routes answer 403 to a request whose `Origin` is missing or another site's, and to anyone without `auth:grants:write` on the vault, except that `reputation/kudos/` needs `auth:kudos:write` instead.

## The account page

`<base><mount>/-/account/` is a [plugin page](server-plugins.md#plugin-pages) in the theme's shell where readers manage their account. Signed-in readers reach it from the **Account** link in the site actions, and you can link it from anywhere on the site. It needs `SVARTZ_DB` and the session secret; without them it answers 404. A signed-out reader sees a sign-in link per provider, each returning to the page. A signed-in reader can:

- **Open their [user page](#user-pages)** with **Your page**, beside their name, on any vault's account page. While they have none, the account page of the vault that holds user pages leaves an empty `data-svartz-region="user-page-actions"` element there, its `data-svartz-user-page` naming the page's vault path, such as `users/ada`; a plugin's browser script that can start the page puts its button in it. A hidden user page gets no link.
- **Change their display name and handle.** A new handle follows the [handle rules](#first-sign-in). The old one keeps pointing at the account for good: `users/<old>/` redirects to `users/<new>/`, and no other account can take it, though its owner can switch back to it.
- **Create a [group](#groups)**, see the groups they belong to, and accept or decline invitations to others.
- **Link another provider.** The provider's sign-in comes back to the account that started it, bound to that browser's session: if the reader signs out or switches accounts meanwhile, nothing is linked. A provider account that already belongs to another account is refused, and stays with that account.
- **Unlink a provider** while another remains. The one this browser signed in with stays linked; sign in another way to unlink it. Unlinking ends every session that provider signed in. Two browsers unlinking an account's last two providers at once leave one linked.
- **See their [reputation](#reputation)**: their score, and the score at which they get the next role a threshold gives. Below it, an empty `data-svartz-region="account-activity"` element, its `data-svartz-handle` naming the account's handle, holds links plugins' browser scripts add to the account's activity, such as [history](history.md#contributions)'s **Your contributions**.
- **See their sessions**: the provider each signed in with, when, and which is this browser.
- **Sign out everywhere.** Every session of the account ends, this browser's included, so each reads as signed out on its next request.

Forms on the page post to the routes above and work without JavaScript.

A [suspended](#suspensions) reader sees only that their account is suspended, until when (in UTC) or for good, and the moderator's reason, with **Sign out**. The **Account** link in the site actions stays, so they can find it.

## The sign-in dialog

Every page of the vault can open a dialog listing its providers. Give any element `data-svartz-sign-in` and clicking it opens the dialog, which brings the reader back to the current page:

```html
<button type="button" data-svartz-sign-in>Sign in</button>
```

Browser code opens it with `openSignIn(returnTo?)` from `@svartz/auth/browser`. The dialog is a native modal: focus starts on the first provider, Escape or the close button dismisses it, and focus returns to what opened it. It follows the theme's `--sv-*` tokens.

## Reading the signed-in reader from a plugin

```ts
import type { ServerModuleFactory } from "@svartz/core";
import { readAccount } from "@svartz/auth/server";

const guestbook: ServerModuleFactory = () => async (request, context) => {
  const reader = await readAccount(request, context.env);
  if (!reader) return Response.json({ error: "unauthorized", message: "Sign in to sign the guestbook." }, { status: 401 });
  return Response.json({ hello: `@${reader.handle}` });
};

export default guestbook;
```

`readAccount(request, env)` answers the `Account`, or `null` when nobody is signed in, their session was deleted or expired, their account is [suspended](#suspensions), or the site binds no `SVARTZ_DB`. `env` is the handler's `context.env`. The plugin must be on a vault served from the same origin, since the cookie is.

```ts
{
  id: "0b9f6c1e-…",       // stable and opaque
  handle: "octocat",
  name: "The Octocat",
  avatarUrl: "https://avatars.githubusercontent.com/u/583231",
  createdAt: "2026-11-19T10:00:00.000Z",
  roles: ["admin", "editors"], // `admin` first for bootstrap admins, then its stored roles
  identity: { id: "github:583231", provider: "github", … }, // the provider account this session used
}
```

`readSignIn(request, env)` answers `{ account }`, or `{ account: null, reason }` saying why there is none: `"signed-out"`, `"no-database"` when the site binds no `SVARTZ_DB`, or `"suspended"`, with `suspension: { reason, until?, since }`, while the account is [suspended](#suspensions). A plugin that needs accounts can answer `"no-database"` with a 503 naming the binding. A suspended reader is a guest: treat them as signed out, and leave telling them why to the account page.

`linkedIdentities(account, env)` answers every provider account linked to the account, the first linked first, such as its GitHub account when it signed in with Discord. It answers `[]` without `SVARTZ_DB`.

`readIdentity(request, env)` answers the provider account the reader signed in with, or `null`, as for a suspended account. It works with or without `SVARTZ_DB`, so plugins written before accounts keep working; new plugins should read the account.

`findProfile(handle, env)` answers the public profile, `{ handle, name, avatarUrl, reputation }`, of the account that holds `handle` now or held it before, or `undefined`. When its `handle` differs from the one asked for, the asked one is old: redirect to the current one.

`findProfileByIdentity(identity, env)` answers the public profile of the account the provider account `identity`, such as `github:583231`, is linked to, for a plugin that stored who wrote something by their sign-in, or `undefined`.

`findProfiles(ids, env)` answers the public profiles of the accounts with those ids, as a `Map` by id, for a plugin that stored an account's id. Ids no account has are left out, and the map is empty without `SVARTZ_DB`. Show the handle and name; never show the id.

`findProfilesByHandle(handles, env)` and `findProfilesByIdentity(identities, env)` answer what `findProfile` and `findProfileByIdentity` answer for each of a list, in one query, as a `Map` by what was asked. Use them for a page that lists many things, so its D1 calls don't grow with the list.

`userPageLocation()` answers where [user pages](#user-pages) live, such as `{ vault: "notes", folder: "users" }`, so a plugin can find or start an account's page at `<folder>/<handle>` in that vault.

`userPageOf(handle)` answers the URL, below the deployment base, of the user page at `<folder>/<handle>`, such as `/notes/users/ada/`, or `undefined` when there is none, it's hidden, or the vault that holds user pages hasn't started yet.

`findStanding(handle, env)` answers the account that holds `handle` now or held it before, for a page about it: its public profile under its current handle, its `id`, its `userPage` under any handle it has held, and its `standing`, `{ score, next }`, where `next` is the lowest threshold above its score whose role it doesn't hold. It answers `undefined` when no account ever held `handle`, or without `SVARTZ_DB`. Show `next` only to the account itself, as its user page and account page do, and never show the `id`.

## Permissions

Plugins declare what people may do on the site, and check it with `can()`. Admins decide who holds each permission with **grants**, which they set on [the dashboard](#the-dashboard).

### Declaring permissions

A plugin lists the permissions it checks under `permissions`, each in its own namespace, `<plugin id>:<feature>:<action>`, where the action is `read`, `write` or `delete`:

```ts
import { definePlugin } from "@svartz/core";

export const guestbook = definePlugin(() => ({
  id: "guestbook",
  server: { module: "@acme/svartz-guestbook/server" },
  permissions: [
    { slug: "guestbook:entries:write", name: "Sign the guestbook", description: "Add an entry.", defaults: { "signed-in": "allow" } },
    { slug: "guestbook:entries:delete", name: "Delete any entry", description: "Remove anyone's entry." },
  ],
}));
```

Auth collects every enabled plugin's declarations at build time, a theme preset's plugins included, and fails the build naming the plugin when a slug is malformed or outside the plugin's namespace, a name or description is missing, or a default isn't `"allow"` or `"deny"`. Host vaults share accounts, so they share one catalogue: a permission two host vaults declare must be declared alike.

`defaults` grants the permission on the whole site to the built-in actors, until a stored grant to the same actor on the site replaces it:

- `guest` is everyone, signed in or not.
- `signed-in` is everyone with an account.

### Grants

A grant gives one **actor** one permission on one **object**, set to `allow`, `deny` or `unset`.

| Actor | Who |
| --- | --- |
| `account` | One account, by its id. |
| `group` | Every member of the [group](#groups), owners included, by its name. |
| `role` | Every account that holds the [role](#roles), by its name. |
| `static` | `guest` or `signed-in`. |

| Object | Covers |
| --- | --- |
| `site` | Every vault. |
| `vault:<id>` | A vault. |
| `folder:<vault>/<path>/` | A folder of a vault and everything in it, such as `folder:notes/garden/`. |
| `page:<vault>/<slug>` | One page, such as `page:notes/garden/roses`. |

A check on a page consults the page, each folder enclosing it, its vault and the site, in that order, and the first of them with a set grant that applies to the reader decides. Within that object, the most specific actor decides: the account, then its groups, then its roles, then `signed-in`, then `guest`. Between grants of the same rank, `deny` beats `allow`. With nothing set, the answer is no. So a grant on a page beats any grant on the site, and to keep a page closed to guests but open to signed-in readers, set both actors on it.

Three things allow whatever the grants say: the `admin` role, which [bootstrap admins](#bootstrap-admins) hold, an account's own [user page](#user-pages), `users/<handle>` in the vault that runs sign-in, and, for a group's owners, every object a moderator [linked the group](#linking-a-group) to and everything inside it.

Owning a page is about its content. A permission declared with `administrative: true` administers the site instead: seeing or changing who may do what, or moderating people. Neither kind of ownership gives one; only the `admin` role or a grant does. Auth's own permissions are all administrative.

Grants live in `SVARTZ_DB`, in `auth_grants`. Set them on the dashboard, which records each change in [the audit log](#the-audit-log).

### Roles

A role is a named actor: give it grants, and every account that holds it gets them. Create roles and choose who holds them on the dashboard. A role's name is 1 to 39 lowercase letters, numbers and hyphens, starting and ending with a letter or number. `Account.roles` lists the roles an account holds, `admin` first.

`admin` is not a stored role. Only [`admins`](#bootstrap-admins) in config grants it: no role can be named `admin`, no account can be added to it, and no grant can name it. Grants on an admin's account are refused too, since an admin may do everything whatever the grants say.

### Groups

A group, such as a wiki's alliance, is an actor that people run themselves. Its members get the group's grants, and a moderator can link it to the pages it looks after, which gives its owners every permission there.

Any signed-in reader creates a group in the Groups section of [their account page](#the-account-page), and owns it. A group has a name and a display name. The name follows the [handle rules](#first-sign-in), is unique, never changes, and can't be `admin`, `guest` or `signed-in`; grants and links name the group by it. The display name is up to 100 characters.

Each group has a page at `<base><mount>/-/groups/<name>/`, which only its members can open; everyone else gets the 404, so nobody outside a group learns who is in it. Members see who belongs to the group, who owns it and where it is linked, and can leave. Owners also:

- **Invite** an account by its handle. The invited account sees the invitation on its account page and joins only by accepting it; until then it isn't a member and holds none of the group's grants. Owners can withdraw an invitation, and the invited account can decline it. Invitations stay open until one of those happens.
- **Make a member an owner**, so the group has co-owners.
- **Remove** members and other owners.

A group always keeps at least one owner: the last owner can't leave or be removed until they make someone else an owner. Groups can't be deleted yet.

Membership is read on every check, so a removed member loses the group's grants on their next request.

#### Linking a group

A moderator links a group to a vault, a folder or a page in the dashboard's [Groups panel](#groups-panel). The group's owners then hold every permission on that object and everything inside it, whatever the grants say, as an account does on its own user page. Its other members get only the grants given to the group. A group can't be linked to the whole site.

Linking is as sensitive as granting: it decides who controls those pages. It needs `auth:group-links:write`, which auth declares with no default, so only admins hold it until someone grants it. Every link and unlink is recorded in [the audit log](#the-audit-log).

To give a group's members more trust on its pages, as a wiki gives an alliance on `alliances/<name>/`, grant the group the permission there in [People & permissions](#people--permissions), such as `submissions:commits:write` on the folder, and link the group to it.

### Checking a permission

```ts
import type { ServerModuleFactory } from "@svartz/core";
import { can, readAccount } from "@svartz/auth/server";

const guestbook: ServerModuleFactory = () => async (request, context) => {
  const reader = await readAccount(request, context.env);
  const page = new URL(request.url).searchParams.get("page") ?? "";
  if (!await can(reader, "guestbook:entries:write", { vault: context.vault.id, page }, context.env)) {
    return Response.json({ error: "forbidden", message: "You can't sign this guestbook." }, { status: 403 });
  }
  return Response.json({ signed: true });
};
```

`can(account, permission, object, env)` answers whether `account`, or a guest for `null`, holds `permission` on `object`: the site (`{}`), a vault (`{ vault }`), or a page of one (`{ vault, page }`, with the page's slug). It loads every grant that could apply in one query and decides in memory. `canEach(account, permission, objects, env)` answers it for each of a list of objects, in order, with the same one query, for a page that checks many, such as a queue of comments on different pages.

It fails closed. Without `SVARTZ_DB` there are no grants and no accounts, so it answers `false`, defaults included; a plugin that must work without accounts decides that case itself, as [annotations](annotations.md#moderating) does. A database error throws. A permission no plugin on the site declares throws too, naming it, and so does every check in code that runs outside `svartzHandle`, since auth registers the catalogue as it starts.

## The dashboard

`<base><mount>/-/dashboard/` is a [plugin page](server-plugins.md#plugin-pages) that lists, by plugin, every [dashboard panel](server-plugins.md#dashboard-panels) the viewer may open: the one place to find every plugin's tools and settings a person can reach. A panel shows only to a viewer who holds its permission on the vault, or on the whole site, and the same check runs before every render. A plugin with no panel the viewer may open stays off the list, and a viewer with no panel at all, signed out included, gets the 404. Without `SVARTZ_DB` nobody holds a permission, so there is no dashboard.

Signed-in readers find an **Account** link to [their account page](#the-account-page) in the site actions, beside **New page** and other plugins' site-wide actions, and a **Dashboard** link when they hold a panel.

### People & permissions

Auth's own panel, at `/-/dashboard/auth/people/`, manages who may do what:

- **Grants**: set an account's, a role's or a group's grant of any permission to allow, deny or unset, on the whole site, a vault, a folder or a page. The picker offers every vault that shares these accounts, and suggests this vault's published folders and pages; a folder ends in `/`, such as `garden/`.
- **Roles**: create [roles](#roles), and add accounts to them or remove them.
- **Check access**: ask whether an account may do something somewhere, and see the grant or rule that decided: a grant and where it sits, a permission's default, the admin role, an account's own user page, or a linked group it owns.
- **People**: find accounts by the start of their handle or any part of their display name, with the roles each holds.
- **Permissions**: every permission the site's plugins declare, with its name, description and defaults.

It needs two permissions, which auth declares with no defaults, so only admins hold them until someone grants them:

| Permission | Allows |
| --- | --- |
| `auth:grants:read` | Opening the panel: every account, role and grant, and the access check. |
| `auth:grants:write` | Changing grants and roles. |

Granting either is as powerful as making someone an admin: `auth:grants:read` shows every account and grant on the site, and whoever holds `auth:grants:write` can grant themselves, or anyone, any permission. Give them only to people you would make admins.

The panel's forms post to the routes below and work without JavaScript. Each route checks `auth:grants:write` again, whatever the panel showed, and checks it where the change lands: a grant needs it on the object the grant is for, and creating a role or changing who holds one needs it on the whole site, since a role's grants reach everywhere. So someone granted it on one vault changes grants there and nowhere else.

### Groups panel

Auth's second panel, at `/-/dashboard/auth/groups/`, is where moderators [link groups](#linking-a-group). It lists every group with its owners and the objects it is linked to, each with an Unlink button, above a form that links a group by name to a vault, or a folder or page of one. It opens for holders of `auth:group-links:write`, and its routes check it again.

Auth's other panels, **Reputation** and **Kudos**, are described under [reputation](#reputation).

## Reputation

Each account has a reputation score, which grows as its work lands and others value it. With [thresholds](#thresholds), it promotes people automatically: an account whose score reaches one gets its role.

The score is the sum of the account's entries in a ledger, `auth_reputation` in `SVARTZ_DB`. The database refuses to change or delete an entry, so nothing rewrites a score's history: taking points back is a further entry. Each entry is for one event, such as one merged pull request, and an event is recorded once however often it is reported, so a repeated webhook delivery or a poll that reads it again changes nothing.

A score is public. It shows beside the account's name wherever a first-party plugin names it: in page history, Recent changes and contributions, in My submissions, the Submissions and Recent edits panels, on comment cards and in the Reports panel. There it is a compact number, such as `Ada Lovelace 1,234` or `12.5K` past ten thousand, which screen readers read as "Reputation 1,234" and whose tooltip gives it in full. An account's [user page](#user-pages) shows it once more beside the page's actions, such as "Reputation: 12 points", and the account itself also sees its next threshold there and on [the account page](#the-account-page): "Reputation: 12 points · 20 points for editors". Anyone can read an account's score from `GET users/<handle>/`.

A plugin shows the score the same way. Every profile `findProfile`, `findProfiles`, `findProfilesByHandle` and `findProfilesByIdentity` answer carries `reputation`, from the same query, so a list of names costs no more. Render it after the name and a space:

```ts
import { reputationBadgeHtml } from "@svartz/auth/badge";

const html = `${escape(profile.name)} ${reputationBadgeHtml(profile.reputation)}`;
```

In the browser, `reputationBadge(score)` from `@svartz/auth/browser` answers the same as an element. Both take their style from `@svartz/auth/browser.css`.

### Weights

What each event scores, with the bounds an admin may set it within:

| Event | Default | Bounds | Posted by |
| --- | --- | --- | --- |
| A merged edit | 1 × (1 + log2 of the lines it changed) | 0 to 100 times | [submissions](../packages/plugin-submissions/README.md#reputation) |
| A merged new page | 5 | 0 to 100 | submissions |
| A **+1** on a comment, for its author | 0.5 | 0 to 100 | [annotations](annotations.md#agreeing) |
| Kudos from a moderator | 5 | 0 to 100 | [kudos](#kudos) |
| A pull request closed without merging | 0 | -100 to 0 | submissions |

An account earns at most 100 points a day, in UTC, from edits, new pages and **+1**s; points past the limit are recorded as 0. Kudos and taken-back points don't count toward it. An edit that changed no lines scores as one line.

Admins change the weights and the daily limit on the dashboard's **Reputation** panel. A new weight applies to events from then on; entries already recorded keep their points.

### Thresholds

A threshold gives a [stored role](#roles) to every account whose score, to two decimals as the account sees it, reaches it, with an `auth:role:promote` entry in [the audit log](#the-audit-log) naming the account, its score and the threshold. Set one per role on the **Reputation** panel; saving it gives the role to every account already past it. `admin` can't have one.

Nothing ever takes a role away automatically: a lower score, a taken-back **+1** or a removed threshold leaves every role where it is. A role reputation gave shows **By reputation** under Roles on People & permissions, and only an admin can remove it. Once removed, it stays removed: reputation gives each account each role at most once.

The **Reputation** panel opens with `auth:grants:read` and changes with `auth:grants:write`, since a threshold gives roles as a grant does.

### Kudos

Moderators who hold `auth:kudos:write` give kudos on the dashboard's **Kudos** panel: an account's handle and a reason, kept in the audit log. Each moderator gives each account at most one kudos a day, and at most 10 a day in all, and never one to themselves. Auth declares the permission with no default, so only admins hold it until someone is granted it.

### Posting from a plugin

```ts
import { postReputation } from "@svartz/auth/server";

await postReputation(context.env, { kind: "page", to: { account: account.id }, ref: `guestbook:entry:${entry.id}` });
```

`postReputation(env, event)` records `event`, weighed with the site's weights, then gives the account any role a threshold now grants. `to` names who earns: an account by `{ account: <id> }`, or the account a provider account is linked to by `{ identity: "github:583231" }`; an event for nobody's account changes nothing. `ref` names the event, unique within its kind and starting with your plugin's id. An event posted again with the same `ref` scores nothing more, but gives any role the first post failed to give, so retry a post that threw.

| `kind` | Fields | |
| --- | --- | --- |
| `edit` | `lines` | An edit landed, changing `lines` lines (added plus removed). |
| `page` | | A new page landed. |
| `declined` | | A pull request closed without merging. |
| `agreement` | `from`, `agreed`, `version` | Account `from` agrees (`true`) or doesn't agree with what `to` wrote. `ref` names the pair; the agreement scores once while it stands, and when it is taken back, the same points are taken back. Nobody scores from their own. `version` orders the pair's changes: raise it in the same write as every change, and read it with `agreed` in one read. Auth keeps the newest version it was posted and settles the ledger to that, so a post read before a later change, however late it arrives, changes nothing. |

Post only what your server knows happened, for the account your own records name: never an account a request or a commit claims. `postReputation` throws when the site binds no `SVARTZ_DB`, or the write fails.

### Taking points back

```ts
import { reverseReputation } from "@svartz/auth/server";

await reverseReputation(context.env, [{ account: account.id, ref: `guestbook:entry:${entry.id}` }]);
```

When content an `edit` or `page` event scored for is undone, as when a moderator [reverts a page](history.md#reverting-a-page), `reverseReputation(env, reversals)` takes back what each event earned `account`: one `reversal` entry per event, under the event's `ref`, all in one transaction. An event is taken back once, however often it is reversed. An event that hasn't been posted yet, such as an edit whose lines aren't counted yet, gets its entry at 0 points and scores nothing when it is posted; an event that earned `account` nothing gets no entry. A lower score never takes away a role the account already holds. It throws as `postReputation` does.

## The audit log

Every grant, role and group change, every change to reputation's weights and thresholds, every role a threshold gives, every kudos and every [suspension](#suspensions) and lift is recorded in `auth_audit` in `SVARTZ_DB`: who made it, what it was, and when. The log is append-only: the database refuses to change or delete an entry. A change and its entry are written in one transaction, so neither lands without the other.

Server plugins record their own changes, such as a resolved report, with `audit(env, entry, changes?)` from `@svartz/auth/server`:

```ts
import { audit, readAccount } from "@svartz/auth/server";

const moderator = await readAccount(request, context.env);
const db = context.env.SVARTZ_DB as D1Database;
await audit(context.env, {
  actor: moderator,                      // the signed-in account that made the change
  action: "moderation:report:resolve",   // <plugin id>:<thing>:<verb>
  target: report.id,                     // what it changed
  detail: { outcome: "removed" },        // anything else worth keeping, as JSON
}, [db.prepare("UPDATE reports SET resolved_at = ? WHERE id = ?").bind(now, report.id)]);
```

Pass the change itself as `changes`, statements prepared on the `SVARTZ_DB` binding: they run in the same transaction as the entry. A change kept anywhere else can't share it, so record the entry first and make the change once `audit` resolves. `audit` throws when the site binds no `SVARTZ_DB`, or when the write fails. Take `actor` from `readAccount` on the server, never from what the request says.

`readAuditLog(env, { actor?, target?, before?, limit? })` reads the log, newest first, in one query: `{ entries, next? }`, each entry `{ id, at, actor, action, target, detail }`, where `actor` is the handle the actor had then. `actor` keeps the entries of the account that holds or held that handle, `target` those on exactly that target, and `before` takes the previous page's `next`; `limit` defaults to 50. Every string is as its writer stored it, so escape it to show it. The [moderation](moderation.md#the-audit-log-panel) plugin's Audit log panel shows it.
