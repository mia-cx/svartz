/** Portable authenticated payload format for static protected vault content. */

const VERSION = 1 as const;
const ITERATIONS = 600_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const encoder = new TextEncoder();

export class ProtectionFormatError extends Error {
  readonly _tag = "ProtectionFormatError" as const;
  constructor(message: string) {
    super(message);
    this.name = "ProtectionFormatError";
  }
}

export class ProtectionAuthenticationError extends Error {
  readonly _tag = "ProtectionAuthenticationError" as const;
  constructor() {
    super("Incorrect password or damaged protected note");
    this.name = "ProtectionAuthenticationError";
  }
}

export interface ProtectedEnvelope {
  readonly version: typeof VERSION;
  readonly id: string;
  readonly iterations: typeof ITERATIONS;
  readonly salt: string;
  readonly iv: string;
  readonly ciphertext: string;
}

function toBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 0x8000)));
  }
  return btoa(chunks.join(""));
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  let binary: string;
  try {
    binary = atob(value);
  } catch {
    throw new ProtectionFormatError("Invalid protected payload encoding");
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/** Generate a fresh salt once per password group and build. */
export function createProtectionSalt(): string {
  return toBase64(crypto.getRandomValues(new Uint8Array(SALT_BYTES)));
}

/** Derive a non-exportable session key from a password and the group's public salt. */
export async function deriveProtectionKey(password: string, salt: string): Promise<CryptoKey> {
  const saltBytes = fromBase64(salt);
  if (saltBytes.length !== SALT_BYTES) throw new ProtectionFormatError("Invalid protected payload salt");
  const material = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: saltBytes, iterations: ITERATIONS },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** Seal one group-owned payload. The ID is authenticated, so route swaps fail. */
export async function sealProtectedPayload(
  key: CryptoKey,
  salt: string,
  id: string,
  plaintext: Uint8Array,
): Promise<ProtectedEnvelope> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: encoder.encode(`svartz:${VERSION}:${id}`) },
    key,
    new Uint8Array(plaintext),
  );
  return {
    version: VERSION,
    id,
    iterations: ITERATIONS,
    salt,
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext)),
  };
}

/** Authenticate before returning bytes. Wrong passwords and altered bytes reject. */
export async function openProtectedPayload(
  key: CryptoKey,
  envelope: ProtectedEnvelope,
  expectedId: string,
): Promise<Uint8Array> {
  if (!envelope || envelope.version !== VERSION || envelope.iterations !== ITERATIONS ||
    envelope.id !== expectedId || typeof envelope.iv !== "string" || typeof envelope.ciphertext !== "string") {
    throw new ProtectionFormatError("Unsupported or mismatched protected payload");
  }
  const iv = fromBase64(envelope.iv);
  if (iv.length !== IV_BYTES) throw new ProtectionFormatError("Invalid protected payload IV");
  const ciphertext = fromBase64(envelope.ciphertext);
  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv, additionalData: encoder.encode(`svartz:${VERSION}:${expectedId}`) },
      key,
      ciphertext,
    );
  } catch {
    throw new ProtectionAuthenticationError();
  }
  return new Uint8Array(plaintext);
}
