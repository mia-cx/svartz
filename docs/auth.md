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

```toml
# wrangler.toml
[[d1_databases]]
binding = "SVARTZ_DB"
database_name = "notes"
database_id = "<the id `wrangler d1 create notes` printed>"
```

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

## Bootstrap admins

`admins` lists identity ids whose accounts always hold the `admin` role, so a fresh site has someone who can grant everything else. The role comes from config, not from the database, so nothing stored there takes it away; to remove an admin, take them off the list and deploy. An account holds the role when any provider account linked to it is listed. Each id's provider must be one the vault offers, or the build fails.

Host vaults share accounts, so every host vault that enables auth must list the same admins, or the build fails.

Auth starts before the site answers any request, so server plugins and a host app's own routes behind `svartzHandle` always read this deployment's list. Code that calls `readAccount` without `svartzHandle` in its hooks sees no admins.

## User pages

Each account has a user page: the note at `users/<handle>` in the vault that runs sign-in, such as `users/ada.md`. Its account holds every permission on it, whatever the [grants](#grants) say, so with [submissions](../packages/plugin-submissions/README.md#modes) its owner's edits commit straight to the repository and everyone else's go to review. The override covers the page itself, not pages below it such as `users/ada/drafts`; to give an account a folder of its own, grant it on `folder:<vault>/users/ada/`.

User pages live in one vault per app. A standalone vault holds its own. In a host app with several vaults, the [callback vault](#several-vaults) holds them all: it runs every sign-in and every handle change, so it alone decides which handles are taken. A `users/<handle>` page in any other host vault is an ordinary page, with no override, and doesn't reserve its handle.

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
| `POST sign-out/` | Ends the session; answers 204. Refused from another origin. |
| `POST account/profile/?returnTo=<path>` | Sets the signed-in account's display name (`name`) and handle (`handle`), then redirects to `returnTo`, or to the account page without it. Only the callback vault answers it. |
| `POST account/unlink/` | Unlinks the provider account named by `identity` and ends its sessions, then redirects to the account page. |
| `POST account/sign-out-everywhere/` | Ends every session of the signed-in account, this one included, then redirects to the account page. |
| `POST account/link/<provider>/?returnTo=<path>` | Starts linking another provider to the signed-in account. Only the callback vault answers it. |
| `GET users/<handle>/` | The public profile, `{ handle, name, avatarUrl }`, or a 308 from an old handle to the current one's URL. |
| `GET viewer/` | `{ handle, dashboard }` for a signed-in account, where `dashboard` says whether [the dashboard](#the-dashboard) has a panel for them; `null` otherwise. |
| `POST people/grant/` | Sets the grant of `permission` for an account (`actor-type=account`, `actor=<handle>`) or a role (`actor-type=role`, `actor=<name>`) to `value` (`allow`, `deny` or `unset`), on the object `scope` (`site` or `vault:<id>`) and `path` (empty, a folder ending in `/`, or a page) name, or `object` names whole. Redirects to People & permissions. |
| `POST people/role/` | Creates the role `name`, then redirects to People & permissions. |
| `POST people/member/` | Gives the account `handle` the role `role`, then redirects to People & permissions. |
| `POST people/member/remove/` | Takes the role `role` from the account `handle`, then redirects to People & permissions. |

Providers the config doesn't list answer 404. Without `SVARTZ_DB`, `handle/` and the `account/` routes answer 503. The `account/` routes answer 403 to a request whose `Origin` is missing or another site's, and send a signed-out reader to the account page. The `people/` routes answer 403 to a request whose `Origin` is missing or another site's, and to anyone without `auth:grants:write` on the vault.

## The account page

`<base><mount>/-/account/` is a [plugin page](server-plugins.md#plugin-pages) in the theme's shell where readers manage their account. Signed-in readers reach it from the **Account** link in the site actions, and you can link it from anywhere on the site. It needs `SVARTZ_DB` and the session secret; without them it answers 404. A signed-out reader sees a sign-in link per provider, each returning to the page. A signed-in reader can:

- **Open their [user page](#user-pages)** with **Your page**, beside their name, on any vault's account page. While they have none, the account page of the vault that holds user pages leaves an empty `data-svartz-region="user-page-actions"` element there, its `data-svartz-user-page` naming the page's vault path, such as `users/ada`; a plugin's browser script that can start the page puts its button in it. A hidden user page gets no link.
- **Change their display name and handle.** A new handle follows the [handle rules](#first-sign-in). The old one keeps pointing at the account for good: `users/<old>/` redirects to `users/<new>/`, and no other account can take it, though its owner can switch back to it.
- **Link another provider.** The provider's sign-in comes back to the account that started it, bound to that browser's session: if the reader signs out or switches accounts meanwhile, nothing is linked. A provider account that already belongs to another account is refused, and stays with that account.
- **Unlink a provider** while another remains. The one this browser signed in with stays linked; sign in another way to unlink it. Unlinking ends every session that provider signed in. Two browsers unlinking an account's last two providers at once leave one linked.
- **See their sessions**: the provider each signed in with, when, and which is this browser.
- **Sign out everywhere.** Every session of the account ends, this browser's included, so each reads as signed out on its next request.

Forms on the page post to the routes above and work without JavaScript.

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

`readAccount(request, env)` answers the `Account`, or `null` when nobody is signed in, their session was deleted or expired, or the site binds no `SVARTZ_DB`. `env` is the handler's `context.env`. The plugin must be on a vault served from the same origin, since the cookie is.

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

`readSignIn(request, env)` answers `{ account }`, or `{ account: null, reason }` saying why there is none: `"signed-out"`, or `"no-database"` when the site binds no `SVARTZ_DB`. A plugin that needs accounts can answer the second with a 503 naming the binding.

`linkedIdentities(account, env)` answers every provider account linked to the account, the first linked first, such as its GitHub account when it signed in with Discord. It answers `[]` without `SVARTZ_DB`.

`readIdentity(request, env)` answers the provider account the reader signed in with, or `null`. It works with or without `SVARTZ_DB`, so plugins written before accounts keep working; new plugins should read the account.

`findProfile(handle, env)` answers the public profile, `{ handle, name, avatarUrl }`, of the account that holds `handle` now or held it before, or `undefined`. When its `handle` differs from the one asked for, the asked one is old: redirect to the current one.

`userPageLocation()` answers where [user pages](#user-pages) live, such as `{ vault: "notes", folder: "users" }`, so a plugin can find or start an account's page at `<folder>/<handle>` in that vault.

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
| `role` | Every account that holds the [role](#roles), by its name. |
| `static` | `guest` or `signed-in`. |

Grants can also name a `group`, which ranks between accounts and roles. Nothing puts an account in a group yet, so those grants match nobody.

| Object | Covers |
| --- | --- |
| `site` | Every vault. |
| `vault:<id>` | A vault. |
| `folder:<vault>/<path>/` | A folder of a vault and everything in it, such as `folder:notes/garden/`. |
| `page:<vault>/<slug>` | One page, such as `page:notes/garden/roses`. |

A check on a page consults the page, each folder enclosing it, its vault and the site, in that order, and the first of them with a set grant that applies to the reader decides. Within that object, the most specific actor decides: the account, then its roles, then `signed-in`, then `guest`. Between grants of the same rank, `deny` beats `allow`. With nothing set, the answer is no. So a grant on a page beats any grant on the site, and to keep a page closed to guests but open to signed-in readers, set both actors on it.

Two things allow whatever the grants say: the `admin` role, which [bootstrap admins](#bootstrap-admins) hold, and an account's own [user page](#user-pages), `users/<handle>` in the vault that runs sign-in.

Grants live in `SVARTZ_DB`, in `auth_grants`. Set them on the dashboard, which records each change in [the audit log](#the-audit-log).

### Roles

A role is a named actor: give it grants, and every account that holds it gets them. Create roles and choose who holds them on the dashboard. A role's name is 1 to 39 lowercase letters, numbers and hyphens, starting and ending with a letter or number. `Account.roles` lists the roles an account holds, `admin` first.

`admin` is not a stored role. Only [`admins`](#bootstrap-admins) in config grants it: no role can be named `admin`, no account can be added to it, and no grant can name it. Grants on an admin's account are refused too, since an admin may do everything whatever the grants say.

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

`can(account, permission, object, env)` answers whether `account`, or a guest for `null`, holds `permission` on `object`: the site (`{}`), a vault (`{ vault }`), or a page of one (`{ vault, page }`, with the page's slug). It loads every grant that could apply in one query and decides in memory.

It fails closed. Without `SVARTZ_DB` there are no grants and no accounts, so it answers `false`, defaults included; a plugin that must work without accounts decides that case itself, as [annotations](annotations.md#moderating) does. A database error throws. A permission no plugin on the site declares throws too, naming it, and so does every check in code that runs outside `svartzHandle`, since auth registers the catalogue as it starts.

## The dashboard

`<base><mount>/-/dashboard/` is a [plugin page](server-plugins.md#plugin-pages) that lists, by plugin, every [dashboard panel](server-plugins.md#dashboard-panels) the viewer may open: the one place to find every plugin's tools and settings a person can reach. A panel shows only to a viewer who holds its permission on the vault, or on the whole site, and the same check runs before every render. A plugin with no panel the viewer may open stays off the list, and a viewer with no panel at all, signed out included, gets the 404. Without `SVARTZ_DB` nobody holds a permission, so there is no dashboard.

Signed-in readers find an **Account** link to [their account page](#the-account-page) in the site actions, beside **New page** and other plugins' site-wide actions, and a **Dashboard** link when they hold a panel.

### People & permissions

Auth's own panel, at `/-/dashboard/auth/people/`, manages who may do what:

- **Grants**: set an account's or a role's grant of any permission to allow, deny or unset, on the whole site, a vault, a folder or a page. The picker offers every vault that shares these accounts, and suggests this vault's published folders and pages; a folder ends in `/`, such as `garden/`.
- **Roles**: create [roles](#roles), and add accounts to them or remove them.
- **Check access**: ask whether an account may do something somewhere, and see the grant or rule that decided: a grant and where it sits, a permission's default, the admin role, or an account's own user page.
- **People**: find accounts by the start of their handle or any part of their display name, with the roles each holds.
- **Permissions**: every permission the site's plugins declare, with its name, description and defaults.

It needs two permissions, which auth declares with no defaults, so only admins hold them until someone grants them:

| Permission | Allows |
| --- | --- |
| `auth:grants:read` | Opening the panel: every account, role and grant, and the access check. |
| `auth:grants:write` | Changing grants and roles. |

Granting either is as powerful as making someone an admin: `auth:grants:read` shows every account and grant on the site, and whoever holds `auth:grants:write` can grant themselves, or anyone, any permission. Give them only to people you would make admins.

The panel's forms post to the routes below and work without JavaScript. Each route checks `auth:grants:write` again, whatever the panel showed.

## The audit log

Every grant and role change is recorded in `auth_audit` in `SVARTZ_DB`: who made it, what it was, and when. The log is append-only: the database refuses to change or delete an entry. A change and its entry are written in one transaction, so neither lands without the other.

Server plugins record their own changes, such as a suspension or a resolved report, with `audit(env, entry, changes?)` from `@svartz/auth/server`:

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
