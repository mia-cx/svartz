/** The sign-in providers `@svartz/auth` supports. Adding one extends `ProviderId`, adds its entry here and its mark in the browser module. */

export type ProviderId = "github" | "google" | "discord";

/** Who is signed in. Nothing else about the account is kept, and provider tokens never outlive the callback. */
export interface Identity {
  /** `<provider>:<stable account id>`; never a username, which can change hands. */
  readonly id: string;
  readonly provider: ProviderId;
  /** Display name, falling back to the handle. */
  readonly name: string;
  /** The account's username. Google accounts have none. */
  readonly handle?: string;
  /** Absent when the provider gives no picture. */
  readonly avatarUrl?: string;
  /** The account's public profile page. Google accounts have none. */
  readonly profileUrl?: string;
}

/** One OAuth 2 authorization-code + PKCE provider. */
interface ProviderDefinition {
  /** The provider's name as readers know it. */
  readonly label: string;
  readonly authorizationEndpoint: string;
  readonly tokenEndpoint: string;
  /** Only what reading the identity needs. */
  readonly scopes: readonly string[];
  /** Read the signed-in account with the access token, which the caller then drops. */
  profile(accessToken: string): Promise<Identity>;
}

const text = (value: unknown): string | undefined => typeof value === "string" && value ? value : undefined;

/** How long the callback waits for the provider's profile, body included, before failing the sign-in. */
const PROFILE_TIMEOUT_MS = 10_000;

/** GET the signed-in account's profile as JSON. */
async function readProfile(label: string, url: string, accessToken: string, headers: Record<string, string> = {}): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    headers: { accept: "application/json", ...headers, authorization: `Bearer ${accessToken}` },
    // Also bounds reading the body below; a hung API would otherwise hold the callback open.
    signal: AbortSignal.timeout(PROFILE_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`${label} answered ${response.status} when asked for the signed-in user`);
  return await response.json() as Record<string, unknown>;
}

/** Discord's own picture for an account without an avatar: https://docs.discord.com/developers/reference#image-formatting */
function discordDefaultAvatar(id: string, discriminator: string | undefined): string {
  const legacy = discriminator && discriminator !== "0";
  const index = legacy ? Number(discriminator) % 5 : Number((BigInt(id) >> 22n) % 6n);
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

export const PROVIDERS: Readonly<Record<ProviderId, ProviderDefinition>> = {
  github: {
    label: "GitHub",
    authorizationEndpoint: "https://github.com/login/oauth/authorize",
    tokenEndpoint: "https://github.com/login/oauth/access_token",
    // The public profile needs no scope.
    scopes: [],
    async profile(accessToken) {
      const user = await readProfile("GitHub", "https://api.github.com/user", accessToken, {
        accept: "application/vnd.github+json",
        // GitHub's API refuses requests without one.
        "user-agent": "svartz-auth",
      });
      const handle = text(user.login);
      if (typeof user.id !== "number" || !handle) throw new Error("GitHub's user response has no id or login");
      return {
        id: `github:${user.id}`,
        provider: "github",
        name: text(user.name) ?? handle,
        handle,
        avatarUrl: text(user.avatar_url) ?? `https://github.com/${handle}.png`,
        profileUrl: text(user.html_url) ?? `https://github.com/${handle}`,
      };
    },
  },
  google: {
    label: "Google",
    authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenEndpoint: "https://oauth2.googleapis.com/token",
    // Name and picture, without the email address.
    scopes: ["openid", "profile"],
    async profile(accessToken) {
      const user = await readProfile("Google", "https://openidconnect.googleapis.com/v1/userinfo", accessToken);
      const sub = text(user.sub);
      if (!sub) throw new Error("Google's userinfo response has no sub");
      // Google may withhold the name and picture.
      const avatarUrl = text(user.picture);
      return {
        id: `google:${sub}`,
        provider: "google",
        name: text(user.name) ?? text(user.given_name) ?? "Google user",
        ...avatarUrl ? { avatarUrl } : {},
      };
    },
  },
  discord: {
    label: "Discord",
    authorizationEndpoint: "https://discord.com/oauth2/authorize",
    tokenEndpoint: "https://discord.com/api/oauth2/token",
    // `/users/@me` without the email address.
    scopes: ["identify"],
    async profile(accessToken) {
      const user = await readProfile("Discord", "https://discord.com/api/v10/users/@me", accessToken);
      const id = text(user.id);
      const handle = text(user.username);
      if (!id || !/^\d+$/.test(id) || !handle) throw new Error("Discord's user response has no id or username");
      const avatar = text(user.avatar);
      return {
        id: `discord:${id}`,
        provider: "discord",
        name: text(user.global_name) ?? handle,
        handle,
        avatarUrl: avatar ? `https://cdn.discordapp.com/avatars/${id}/${avatar}.png` : discordDefaultAvatar(id, text(user.discriminator)),
        profileUrl: `https://discord.com/users/${id}`,
      };
    },
  },
};

export const isProviderId = (id: string): id is ProviderId => Object.hasOwn(PROVIDERS, id);
