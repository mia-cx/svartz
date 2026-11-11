# Reader sign-in

`@svartz/auth` lets readers sign in with GitHub, and lets [server plugins](server-plugins.md) read who is signed in. It runs on Workers and Node with no hosted service: [Arctic](https://arcticjs.dev) handles OAuth, and the session lives in a sealed cookie.

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
        github: { clientId: "Iv23liExample", clientSecret: { env: "PRIVATE_GITHUB_CLIENT_SECRET" } },
      },
      privacyNotice: "/privacy/",
    })],
  }],
});
```

The vault needs a server target (`cloudflare-workers`, `cloudflare-pages` or `node`).

| Option | Value |
| --- | --- |
| `providers` | The providers readers may use, in the order the sign-in dialog lists them. Each takes the OAuth app's `clientId` and names its secret with `clientSecret: { env: "NAME" }`. Only `github` is supported so far. |
| `privacyNotice` | Optional URL of the site's privacy notice. The sign-in dialog links to it. A site that stores readers' names and avatars owes them one. |

## Secrets

Set two secrets on the server, never in config:

- `SVARTZ_SESSION_SECRET`: a random value of at least 32 characters, such as the output of `openssl rand -base64 32`. Every Svartz plugin reads sessions with it. Changing it signs everyone out.
- The provider's client secret, under the name `clientSecret.env` gives.

On Workers, `wrangler secret put SVARTZ_SESSION_SECRET`. On Node, set them in the process environment, along with `ORIGIN` (such as `ORIGIN=https://notes.example`) so the callback URL GitHub sees uses your real origin. Under `svartz dev`, put them in `.env`.

Without `SVARTZ_SESSION_SECRET`, every auth route answers 503 naming it.

## GitHub setup

1. Create an OAuth app on GitHub: **Settings → Developer settings → OAuth Apps → New OAuth App**.
2. Set **Authorization callback URL** to `https://<your host><base><mount>/_svartz/auth/callback/github/`, such as `https://notes.example/_svartz/auth/callback/github/`.
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

The identity is encrypted with AES-GCM into the `__Host-svartz-session` cookie (`HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`) for 30 days, under a key HKDF derives from `SVARTZ_SESSION_SECRET`. GitHub's access token is used once, to read the profile, and then dropped; it is never stored or sent to the browser. A tampered, expired or wrong-key cookie reads as signed out. There is no server-side session store, so signing out clears the cookie in that browser only.

Local development over `http://localhost` works in Chrome and Firefox, which accept `Secure` cookies there.

## Routes

Under `<mount>/_svartz/auth/`:

| Route | Does |
| --- | --- |
| `GET start/github/?returnTo=<path>` | Redirects to GitHub. The OAuth state and PKCE verifier wait in a 10-minute sealed cookie. `returnTo` must be a path on the same site; anything else answers 400. Without it, the reader returns to the vault's home. |
| `GET callback/github/` | Completes sign-in and redirects to `returnTo`. A reader who declines at GitHub returns there signed out. |
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

`readIdentity(request, env)` answers the `Identity`, or `null` when nobody is signed in or `SVARTZ_SESSION_SECRET` is unset. The plugin must be on a vault served from the same origin, since the cookie is.
