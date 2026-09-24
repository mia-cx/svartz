/** Browser session state for independently unlocked password groups. */
import { deriveProtectionKey, openProtectedPayload, type ProtectedEnvelope } from "./protection";
import type { Index, IndexEntry, SearchDocument } from "./types";

export interface ProtectedGroupPayload {
  readonly version: 1;
  readonly notes: readonly { readonly slug: string; readonly exportName: string }[];
  readonly entries: readonly IndexEntry[];
  readonly search: readonly SearchDocument[];
  readonly graph: Readonly<Record<string, readonly string[]>>;
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
    !Array.isArray(payload.search) ||
    !payload.graph || typeof payload.graph !== "object" ||
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

function restoreDates(entry: IndexEntry): IndexEntry {
  const date = (value: Date | string | undefined): Date | undefined =>
    typeof value === "string" ? new Date(value) : value;
  return {
    ...entry,
    createdAt: date(entry.createdAt),
    modifiedAt: date(entry.modifiedAt),
    publishedAt: date(entry.publishedAt),
  };
}

/** Merge only unlocked, listed group discovery into a browser-local vault index. */
export function mergeProtectedIndex(index: Index, groups: readonly ProtectedGroupPayload[]): Index {
  if (groups.length === 0) return index;
  const entries = new Map(index.entries.map((entry) => [entry.slug, entry]));
  const search = new Map(index.search.map((document) => [document.slug, document]));
  const graph = new Map(Object.entries(index.graph).map(([slug, targets]) => [slug, new Set(targets)]));
  for (const group of groups) {
    const listed = new Set(group.search.map((document) => document.slug));
    for (const entry of group.entries) if (listed.has(entry.slug)) entries.set(entry.slug, restoreDates(entry));
    for (const document of group.search) search.set(document.slug, document);
    for (const [slug, targets] of Object.entries(group.graph)) {
      const outgoing = graph.get(slug) ?? new Set<string>();
      for (const target of targets) outgoing.add(target);
      graph.set(slug, outgoing);
    }
  }
  const visible = new Set(entries.keys());
  const sortedGraph = Object.fromEntries([...graph]
    .filter(([slug]) => visible.has(slug))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([slug, targets]) => [slug, [...targets].filter((target) => visible.has(target)).sort()]));
  const backlinks: Record<string, string[]> = Object.fromEntries([...visible].map((slug) => [slug, []]));
  for (const [source, targets] of Object.entries(sortedGraph)) {
    for (const target of targets) backlinks[target]!.push(source);
  }
  for (const targets of Object.values(backlinks)) targets.sort();
  return {
    ...index,
    entries: [...entries.values()].sort((left, right) => left.slug.localeCompare(right.slug)),
    search: [...search.values()].sort((left, right) => left.slug.localeCompare(right.slug)),
    graph: sortedGraph,
    backlinks: Object.fromEntries(Object.entries(backlinks).sort(([left], [right]) => left.localeCompare(right))),
  };
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
