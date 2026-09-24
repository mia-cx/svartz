/** Browser session state for independently unlocked password groups. */
import { deriveProtectionKey, openProtectedPayload, type ProtectedEnvelope } from "./protection";

export interface ProtectedGroupPayload {
  readonly version: 1;
  readonly notes: readonly { readonly slug: string; readonly exportName: string }[];
  readonly entries: readonly Record<string, unknown>[];
  readonly js: string;
  readonly css: string;
  readonly assets: readonly { readonly path: string; readonly mimeType: string; readonly data: string }[];
  readonly bridgeImports: readonly string[];
}

function parsePayload(bytes: Uint8Array): ProtectedGroupPayload {
  const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (!value || typeof value !== "object") throw new Error("Invalid protected group payload");
  const payload = value as Partial<ProtectedGroupPayload>;
  if (
    payload.version !== 1 ||
    typeof payload.js !== "string" ||
    typeof payload.css !== "string" ||
    !Array.isArray(payload.notes) ||
    !Array.isArray(payload.entries) ||
    !Array.isArray(payload.assets) ||
    !Array.isArray(payload.bridgeImports)
  ) throw new Error("Invalid protected group payload");
  return payload as ProtectedGroupPayload;
}

/** Keep decrypted group data and non-exportable keys only for this page session. */
export class ProtectedSession {
  private readonly groups = new Map<string, { key: CryptoKey; payload: ProtectedGroupPayload }>();

  async unlock(envelope: ProtectedEnvelope, password: string, expectedId: string): Promise<ProtectedGroupPayload> {
    const key = await deriveProtectionKey(password, envelope.salt);
    const payload = parsePayload(await openProtectedPayload(key, envelope, expectedId));
    this.groups.set(expectedId, { key, payload });
    return payload;
  }

  get(expectedId: string): ProtectedGroupPayload | undefined {
    return this.groups.get(expectedId)?.payload;
  }

  lock(expectedId: string): void {
    this.groups.delete(expectedId);
  }

  lockAll(): void {
    this.groups.clear();
  }
}

/** Substitute only generated bridge specifiers before importing decrypted JS. */
export function resolveProtectedBridgeImports(
  payload: ProtectedGroupPayload,
  urls: Readonly<Record<string, string>>,
): string {
  let source = payload.js;
  for (const id of payload.bridgeImports) {
    const url = urls[id];
    if (!url) throw new Error(`Missing host runtime bridge for ${id}`);
    const marker = `svartz:bridge/${encodeURIComponent(id)}`;
    const doubleQuoted = `"${marker}"`;
    const singleQuoted = `'${marker}'`;
    if (!source.includes(doubleQuoted) && !source.includes(singleQuoted)) {
      throw new Error(`Protected module lost runtime bridge ${id}`);
    }
    source = source.replaceAll(doubleQuoted, JSON.stringify(url)).replaceAll(singleQuoted, JSON.stringify(url));
  }
  return source;
}
