/**
 * Sealed cookie values: JSON encrypted with AES-GCM under a key HKDF derives from the session secret.
 * Each purpose gets its own key, so a value sealed for one cookie never opens as another.
 */

/**
 * The environment variable every Svartz plugin reads the session secret from. `PRIVATE_` keeps it in
 * `$env/dynamic/private` on hosts whose `env.privatePrefix` is `PRIVATE_`, and on hosts with no prefix.
 */
export const SESSION_SECRET_ENV = "PRIVATE_SVARTZ_SESSION_SECRET";
/** Shorter secrets are refused: HKDF stretches entropy, it doesn't create it. */
export const SESSION_SECRET_MIN_LENGTH = 32;

export type SealPurpose = "session" | "oauth";

const IV_BYTES = 12;
const HKDF_SALT = "svartz-auth";
const encoder = new TextEncoder();
const keys = new Map<string, Promise<CryptoKey>>();

/** The session secret from `env`, or `undefined` when it is missing or too short to use. */
export function sessionSecret(env: Readonly<Record<string, unknown>>): string | undefined {
  const secret = env[SESSION_SECRET_ENV];
  return typeof secret === "string" && secret.length >= SESSION_SECRET_MIN_LENGTH ? secret : undefined;
}

function keyFor(secret: string, purpose: SealPurpose): Promise<CryptoKey> {
  const id = `${purpose}\0${secret}`;
  let key = keys.get(id);
  if (!key) {
    key = crypto.subtle
      .importKey("raw", encoder.encode(secret), "HKDF", false, ["deriveKey"])
      .then((material) => crypto.subtle.deriveKey(
        { name: "HKDF", hash: "SHA-256", salt: encoder.encode(HKDF_SALT), info: encoder.encode(`svartz-auth ${purpose} v1`) },
        material,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"],
      ));
    keys.set(id, key);
  }
  return key;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text.replaceAll("-", "+").replaceAll("_", "/"));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/** Seal `value` so only {@link unseal} with the same secret and purpose opens it, until `maxAgeSeconds` pass. */
export async function seal(value: unknown, secret: string, purpose: SealPurpose, maxAgeSeconds: number): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const plaintext = encoder.encode(JSON.stringify({ exp: Date.now() + maxAgeSeconds * 1000, value }));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await keyFor(secret, purpose), plaintext));
  const sealed = new Uint8Array(IV_BYTES + ciphertext.length);
  sealed.set(iv);
  sealed.set(ciphertext, IV_BYTES);
  return toBase64Url(sealed);
}

/** Open a sealed value. Tampered, expired, wrong-key and malformed input all read as `undefined`. */
export async function unseal(sealed: string | undefined, secret: string, purpose: SealPurpose): Promise<unknown> {
  if (!sealed) return undefined;
  try {
    const bytes = fromBase64Url(sealed);
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: bytes.subarray(0, IV_BYTES) },
      await keyFor(secret, purpose),
      bytes.subarray(IV_BYTES),
    );
    const { exp, value } = JSON.parse(new TextDecoder().decode(plaintext)) as { exp?: unknown; value?: unknown };
    return typeof exp === "number" && exp > Date.now() ? value : undefined;
  } catch {
    // Every way a cookie can fail to open means the same thing to a reader: signed out.
    return undefined;
  }
}
