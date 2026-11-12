/**
 * GitHub App credentials: signs a JWT with the App's private key through WebCrypto, exchanges it for an installation
 * token scoped to the repository, and reuses that token until shortly before it expires. Uses `fetch` and
 * `crypto.subtle` only, so it runs on Workers and Node alike.
 */
import { misconfigured } from "./errors";
import { requestGitHub, unavailable } from "./github";

/** A GitHub App's credentials, as the server options carry them. */
export interface AppCredentials {
  /** The App's ID, or its Client ID: the JWT's issuer. */
  readonly id: number | string;
  /** The server environment variable holding the App's private key, as GitHub's `.pem` download. */
  readonly privateKey: { readonly env: string };
  /** The App's installation ID on the repository. Looked up from the repository when unset. */
  readonly installation?: number;
}

/** Installation tokens live an hour; a new one is minted this long before the cached one expires. */
export const REFRESH_MARGIN_MS = 5 * 60_000;
/** Backdated against clock drift, as GitHub advises. */
const JWT_BACKDATE_S = 60;
/** GitHub refuses App JWTs that expire more than 10 minutes out. */
const JWT_LIFETIME_S = 9 * 60;
const SIGNING = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" } as const;
const PEM = /-----BEGIN (RSA )?PRIVATE KEY-----([^-]*)-----END \1?PRIVATE KEY-----/;
/** PKCS#8's version and rsaEncryption algorithm identifier, which a PKCS#1 key is wrapped in. */
const PKCS8_RSA_PREFIX = Uint8Array.of(
  0x02, 0x01, 0x00,
  0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00,
);

/** A DER element: `tag`, its definite length, then `content`. */
function der(tag: number, ...content: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const bytes = content.flatMap((part) => [...part]);
  const length: number[] = [];
  for (let n = bytes.length; n > 0; n >>= 8) length.unshift(n & 0xff);
  const header = bytes.length < 0x80 ? [bytes.length] : [0x80 | length.length, ...length];
  return Uint8Array.from([tag, ...header, ...bytes]);
}

/**
 * The PKCS#8 bytes of a PEM private key. GitHub hands out PKCS#1 (`BEGIN RSA PRIVATE KEY`), which WebCrypto can't
 * import, so it is wrapped. Tolerates `\n` escapes, as a key pasted into a one-line `.env` value has.
 */
function pkcs8(pem: string): Uint8Array<ArrayBuffer> {
  const [, pkcs1, body = ""] = pem.replaceAll("\\n", "\n").match(PEM) ?? [];
  const key = Uint8Array.from(atob(body.replace(/\s/g, "")), (char) => char.charCodeAt(0));
  return pkcs1 ? der(0x30, PKCS8_RSA_PREFIX, der(0x04, key)) : key;
}

const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const encodeJson = (value: unknown) => base64url(new TextEncoder().encode(JSON.stringify(value)));

/** A JWT that authenticates as the App for the next few minutes. Never puts key material in an error. */
async function signJwt(app: AppCredentials, env: Readonly<Record<string, unknown>>): Promise<string> {
  const name = app.privateKey.env;
  const pem = env[name];
  if (typeof pem !== "string" || !pem.trim()) throw misconfigured(`its server has no ${name} set`);
  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey("pkcs8", pkcs8(pem), SIGNING, false, ["sign"]);
  } catch {
    throw misconfigured(`its server's ${name} isn't a GitHub App private key`);
  }
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${encodeJson({ alg: "RS256", typ: "JWT" })}.${encodeJson({
    iat: now - JWT_BACKDATE_S,
    exp: now + JWT_LIFETIME_S,
    iss: app.id,
  })}`;
  const signature = await crypto.subtle.sign(SIGNING, key, new TextEncoder().encode(unsigned));
  return `${unsigned}.${base64url(new Uint8Array(signature))}`;
}

/**
 * Installation tokens for `repo`, minted with the App's credentials from the server environment. A token is reused
 * until {@link REFRESH_MARGIN_MS} before it expires. Concurrent requests on a cold cache each mint one: sharing an
 * in-flight promise across requests can hang on Workers, and a spare token is harmless.
 *
 * Failures throw `misconfigured` (no key, a key that isn't one, credentials GitHub rejects, the App not installed on
 * `repo`) or `github_unavailable` (no answer in time, or GitHub failing).
 */
export function appTokens(repo: string, app: AppCredentials) {
  let cached: { token: string; refreshAt: number } | undefined;

  async function call<T>(jwt: string, method: string, path: string, body?: unknown): Promise<T> {
    const response = await requestGitHub(jwt, method, path, body);
    if (response.ok) return await response.json() as T;
    if (response.status >= 500 || response.status === 429) throw unavailable();
    if (response.status === 401) throw misconfigured("GitHub rejected its App ID or private key");
    throw misconfigured(`its GitHub App isn't installed on ${repo}`);
  }

  return async (env: Readonly<Record<string, unknown>>): Promise<string> => {
    if (cached && Date.now() < cached.refreshAt) return cached.token;
    const jwt = await signJwt(app, env);
    const installation = app.installation ?? (await call<{ id: number }>(jwt, "GET", `/repos/${repo}/installation`)).id;
    const { token, expires_at } = await call<{ token: string; expires_at: string }>(
      jwt,
      "POST",
      `/app/installations/${installation}/access_tokens`,
      // Scoped to the one repository, whatever else the installation reaches.
      { repositories: [repo.split("/")[1]] },
    );
    cached = { token, refreshAt: Date.parse(expires_at) - REFRESH_MARGIN_MS };
    return token;
  };
}
