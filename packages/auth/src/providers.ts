/** The sign-in providers `@svartz/auth` supports. Adding one extends `ProviderId`, adds its entry here and its icon in the browser module. */

export type ProviderId = "github";

/** Who is signed in. Nothing else about the account is kept, and provider tokens never outlive the callback. */
export interface Identity {
  /** `<provider>:<stable account id>`; never a username, which can change hands. */
  readonly id: string;
  readonly provider: ProviderId;
  /** Display name, falling back to the handle. */
  readonly name: string;
  readonly handle: string;
  readonly avatarUrl: string;
  readonly profileUrl: string;
}

/** One OAuth 2 authorization-code + PKCE provider. */
interface ProviderDefinition {
  /** The provider's name as readers know it. */
  readonly label: string;
  readonly authorizationEndpoint: string;
  readonly tokenEndpoint: string;
  readonly scopes: readonly string[];
  /** Read the signed-in account with the access token, which the caller then drops. */
  profile(accessToken: string): Promise<Identity>;
}

type GitHubUser = { id?: unknown; login?: unknown; name?: unknown; avatar_url?: unknown; html_url?: unknown };

const text = (value: unknown): string | undefined => typeof value === "string" && value ? value : undefined;

export const PROVIDERS: Readonly<Record<ProviderId, ProviderDefinition>> = {
  github: {
    label: "GitHub",
    authorizationEndpoint: "https://github.com/login/oauth/authorize",
    tokenEndpoint: "https://github.com/login/oauth/access_token",
    // The public profile needs no scope.
    scopes: [],
    async profile(accessToken) {
      const response = await fetch("https://api.github.com/user", {
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Bearer ${accessToken}`,
          // GitHub's API refuses requests without one.
          "user-agent": "svartz-auth",
        },
      });
      if (!response.ok) throw new Error(`GitHub answered ${response.status} when asked for the signed-in user`);
      const user = await response.json() as GitHubUser;
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
};

export const isProviderId = (id: string): id is ProviderId => Object.hasOwn(PROVIDERS, id);
