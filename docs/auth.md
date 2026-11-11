# Reader sign-in

`@svartz/auth` lets readers sign in with Google, Discord or GitHub, and lets [server plugins](server-plugins.md) read who is signed in. It runs on Workers and Node with no hosted service: [Arctic](https://arcticjs.dev) handles OAuth, and the session lives in a sealed cookie.

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
        github: { clientId: "Iv23liExample", clientSecret: { env: "PRIVATE_GITHUB_CLIENT_SECRET" } },
      },
      privacyNotice: "/privacy/",
    })],
  }],
});
```

The vault needs a server target (`cloudflare-workers`, `cloudflare-pages` or `node`), or a `host` target in an app that runs [`svartzHandle`](host-vaults.md#server-plugins).

| Option | Value |
| --- | --- |
| `providers` | The providers readers may use, in the order the sign-in dialog lists them. Each takes the OAuth app's `clientId` and names its secret with `clientSecret: { env: "NAME" }`. Choose from `google`, `discord` and `github`. |
| `privacyNotice` | Optional URL of the site's privacy notice. The sign-in dialog links to it. A site that stores readers' names and avatars owes them one. |
| `callbackVault` | Optional id of the host vault that runs every sign-in in the app. Defaults to the first host vault that enables auth. See [several vaults](#several-vaults). |

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

A vault may offer fewer providers than the callback vault, but not more. Config loading fails, naming the vault, when `callbackVault` names no vault, a vault without auth, or a vault missing one of this vault's providers. Each standalone vault is its own app, so it runs its own sign-in and can't set `callbackVault` to another vault.

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

## GitHub setup

1. Create an OAuth app on GitHub: **Settings → Developer settings → OAuth Apps → New OAuth App**.
2. Set **Authorization callback URL** to the callback URL, ending in `/callback/github/`.
3. Copy the **Client ID** into `providers.github.clientId`, generate a client secret, and store it under the env name you chose.

An OAuth App takes exactly one callback URL, so it can't serve both staging and production. Either register one OAuth App per environment, or create a **GitHub App** instead (**Developer settings → GitHub Apps**), which accepts several callback URLs and signs readers in the same way. A GitHub App needs no permissions for sign-in.

Sign-in asks GitHub for no scopes: it reads only the public profile.

## What is kept

A signed-in reader is an identity and nothing more:

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
| GitHub | `github:<user id>` | login | the avatar | the profile page |

`name` is always set: the display name, falling back to the handle, or to "Google user" when Google withholds the name. Check `handle`, `avatarUrl` and `profileUrl` before showing them.

The identity is encrypted with AES-GCM into the `__Host-svartz-session` cookie (`HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`) for 30 days, under a key HKDF derives from `PRIVATE_SVARTZ_SESSION_SECRET`. The provider's access token is used once, to read the profile, and then dropped; it is never stored or sent to the browser. A tampered, expired or wrong-key cookie reads as signed out. There is no server-side session store, so signing out clears the cookie in that browser only.

Local development over `http://localhost` works in Chrome and Firefox, which accept `Secure` cookies there.

## Routes

Under `<base><mount>/_svartz/auth/`, where `<base>` is the deployment base path, if any:

| Route | Does |
| --- | --- |
| `GET start/<provider>/?returnTo=<path>` | Redirects to the provider. The OAuth state and PKCE verifier wait in a 10-minute sealed cookie. `returnTo` must be a path on the same site; anything else answers 400. Without it, the reader returns to the vault's home. |
| `GET callback/<provider>/` | Completes sign-in and redirects to `returnTo`. A reader who declines at the provider returns there, and any session they already had stays as it was. |
| `GET me/` | The identity, or `null`. |
| `POST sign-out/` | Clears the session; answers 204. Refused from another origin. |

Providers the config doesn't list answer 404.

## The sign-in dialog

Every page of the vault can open a dialog listing its providers. Give any element `data-svartz-sign-in` and clicking it opens the dialog, which brings the reader back to the current page:

```html
<button type="button" data-svartz-sign-in>Sign in</button>
```

Browser code opens it with `openSignIn(returnTo?)` from `@svartz/auth/browser`. The dialog is a native modal: focus starts on the first provider, Escape or the close button dismisses it, and focus returns to what opened it. It follows the theme's `--sv-*` tokens.

## Reading the signed-in reader from a plugin

```ts
import type { ServerModuleFactory } from "@svartz/core";
import { readIdentity } from "@svartz/auth/server";

const guestbook: ServerModuleFactory = () => async (request, context) => {
  const reader = await readIdentity(request, context.env);
  if (!reader) return Response.json({ error: "unauthorized", message: "Sign in to sign the guestbook." }, { status: 401 });
  return Response.json({ hello: reader.name });
};

export default guestbook;
```

`readIdentity(request, env)` answers the `Identity`, or `null` when nobody is signed in or `PRIVATE_SVARTZ_SESSION_SECRET` is unset. The plugin must be on a vault served from the same origin, since the cookie is.
