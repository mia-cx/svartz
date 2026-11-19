/**
 * A line diff of two Markdown sources, as unified-diff hunks: Myers' algorithm on what remains between the common
 * first and last lines, so a typical edit costs little however long the page. A diff needing more than
 * {@link MAX_EDITS} line edits, or of sources longer than {@link MAX_LINES} lines together, isn't computed: a reader
 * could otherwise make the server spend its time and memory on any two revisions.
 */

/** One line of a hunk: unchanged, added or removed, with its number in the old and the new source. */
export interface DiffLine {
  readonly kind: "same" | "add" | "del";
  readonly text: string;
  /** Its number in the old source; absent for an added line. */
  readonly old?: number;
  /** Its number in the new source; absent for a removed line. */
  readonly new?: number;
}

export type Hunk = readonly DiffLine[];

/** Line edits a diff may take before it counts as too large to show. */
export const MAX_EDITS = 1000;
/** Lines of both sources together a diff may weigh. */
export const MAX_LINES = 40_000;
/** Unchanged lines shown around each change. */
const CONTEXT = 3;

type Op = readonly ["same" | "add" | "del", string];

const lines = (text: string) => (text === "" ? [] : text.replace(/\r?\n$/, "").split(/\r?\n/));

/** Myers' shortest edit script from `a` to `b`, or `undefined` past {@link MAX_EDITS}. */
function myers(a: readonly string[], b: readonly string[]): Op[] | undefined {
  const n = a.length;
  const m = b.length;
  const limit = Math.min(n + m, MAX_EDITS);
  // `v[k + offset]` is the furthest x on diagonal k; `trace[d]` keeps diagonals -d-1 to d+1 as step d began.
  const offset = limit + 1;
  const v = new Int32Array(2 * limit + 3);
  const trace: Int32Array[] = [];
  for (let d = 0; d <= limit; d++) {
    trace.push(v.slice(offset - d - 1, offset + d + 2));
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[offset + k - 1]! < v[offset + k + 1]!) ? v[offset + k + 1]! : v[offset + k - 1]! + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) return backtrack(a, b, trace);
    }
  }
  return undefined;
}

function backtrack(a: readonly string[], b: readonly string[], trace: readonly Int32Array[]): Op[] {
  const ops: Op[] = [];
  let x = a.length;
  let y = b.length;
  for (let d = trace.length - 1; d >= 0; d--) {
    const at = (k: number) => trace[d]![k + d + 1]!;
    const k = x - y;
    const previousK = k === -d || (k !== d && at(k - 1) < at(k + 1)) ? k + 1 : k - 1;
    const previousX = at(previousK);
    const previousY = previousX - previousK;
    while (x > previousX && y > previousY) {
      x--;
      y--;
      ops.push(["same", a[x]!]);
    }
    if (d > 0) ops.push(x === previousX ? ["add", b[--y]!] : ["del", a[--x]!]);
    x = previousX;
    y = previousY;
  }
  return ops.reverse();
}

/**
 * The hunks that turn `before` into `after`, each with up to three unchanged lines around its changes: `[]` when they
 * are the same, `undefined` when the diff is too large to compute.
 */
export function diffLines(before: string, after: string): Hunk[] | undefined {
  const a = lines(before);
  const b = lines(after);
  if (a.length + b.length > MAX_LINES) return undefined;
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let end = 0;
  while (end < a.length - start && end < b.length - start && a[a.length - 1 - end] === b[b.length - 1 - end]) end++;
  const middle = myers(a.slice(start, a.length - end), b.slice(start, b.length - end));
  if (!middle) return undefined;
  const ops: Op[] = [
    ...a.slice(0, start).map((text) => ["same", text] as const),
    ...middle,
    ...a.slice(a.length - end).map((text) => ["same", text] as const),
  ];

  const numbered: DiffLine[] = [];
  let old = 1;
  let next = 1;
  for (const [kind, text] of ops) {
    numbered.push(kind === "same" ? { kind, text, old: old++, new: next++ } : kind === "del" ? { kind, text, old: old++ } : { kind, text, new: next++ });
  }

  // Each change with its context; ranges that touch or overlap make one hunk.
  const ranges: [number, number][] = [];
  numbered.forEach((line, index) => {
    if (line.kind === "same") return;
    const from = Math.max(index - CONTEXT, 0);
    const to = Math.min(index + CONTEXT, numbered.length - 1);
    const last = ranges.at(-1);
    if (last && from <= last[1] + 1) last[1] = to;
    else ranges.push([from, to]);
  });
  return ranges.map(([from, to]) => numbered.slice(from, to + 1));
}
