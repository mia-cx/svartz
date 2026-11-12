/**
 * Where an annotation sits in a note, kept stable across markup changes.
 *
 * Offsets count characters of the content element's text: its text nodes joined in document order, which is what
 * `element.textContent` returns. Markup carries no weight, so reflowed HTML around the same words keeps its anchors.
 * `locate` is pure and runs anywhere; `describe` and `rangeOf` need a DOM.
 */

/** How a passage is found again: its quote, the text around it, and where it last was. */
export interface Anchor {
  readonly exact: string;
  /** Up to {@link CONTEXT_LENGTH} characters before the quote. */
  readonly prefix: string;
  /** Up to {@link CONTEXT_LENGTH} characters after the quote. */
  readonly suffix: string;
  readonly start: number;
  readonly end: number;
}

/** A passage in the text: `text.slice(start, end)`. */
export interface Position {
  readonly start: number;
  readonly end: number;
}

/** Characters of context kept on each side of a quote. */
export const CONTEXT_LENGTH = 32;

/** The anchor for `range`, a selection inside `root`. */
export function describe(root: Node, range: Range): Anchor {
  const text = root.textContent ?? "";
  const start = offsetOf(root, range.startContainer, range.startOffset);
  const end = offsetOf(root, range.endContainer, range.endOffset);
  return {
    exact: text.slice(start, end),
    prefix: text.slice(Math.max(0, start - CONTEXT_LENGTH), start),
    suffix: text.slice(end, end + CONTEXT_LENGTH),
    start,
    end,
  };
}

/**
 * The most a quote may have changed and still be found, as a share of its length: a fixed typo or an inserted word,
 * not a rewrite.
 */
export const MAX_QUOTE_EDITS = 0.25;

/**
 * The confidence threshold. A passage counts as found when at least this share of its anchor's characters, quote and
 * context together, still agree with the text there: one minus the edits needed, over the anchor's length. A long
 * quote that survived can carry rewritten surroundings; a short one needs its surroundings, because its words alone
 * turn up elsewhere. Below the threshold the passage is reported gone rather than risk the wrong one.
 */
export const MIN_AGREEMENT = 0.6;

/** Cells of the fuzzy search's table, which bounds its work: a long quote searches a narrower stretch around where it was. */
const SEARCH_CELLS = 4_000_000;
/**
 * Candidates scored in full, so a common word stays cheap. They are picked by how much of the quote and the context
 * right beside it agree, then nearest first, so unrelated repeats of a quote never crowd out its passage.
 */
const MAX_CANDIDATES = 64;

interface Candidate extends Position {
  /** Edits between the quote and the text here. */
  readonly edits: number;
}

/**
 * Where `anchor` is in `text` now, or `null` when its passage is gone.
 * The quote with its context unchanged is found at once, at the occurrence nearest the stored position. Otherwise the
 * candidates are every exact occurrence of the quote and the near matches a bounded fuzzy search finds around the stored
 * position. Each is scored by how much of the quote and its context agree with the text there (see
 * {@link MIN_AGREEMENT}); the best one wins, the nearest of equals, and none wins below the threshold.
 */
export function locate(text: string, anchor: Anchor): Position | null {
  const { exact, prefix, suffix, start } = anchor;
  if (!exact) return null;
  const distance = (position: Position) => Math.abs(position.start - start);
  // The common cases: the passage and its context are unchanged, where they were or moved as a whole.
  let at: Position | undefined;
  for (const whole of occurrences(text, prefix + exact + suffix)) {
    const here = { start: whole.start + prefix.length, end: whole.start + prefix.length + exact.length };
    // Occurrences come in order, so once one is farther than the last, the rest are too.
    if (at && distance(here) >= distance(at)) break;
    at = here;
  }
  if (at) return at;

  const candidates = [...occurrences(text, exact), ...nearMatches(text, anchor)]
    .map((candidate) => ({ candidate, disagreement: candidate.edits - adjacentAgreement(text, anchor, candidate) }))
    .sort((a, b) => a.disagreement - b.disagreement || distance(a.candidate) - distance(b.candidate))
    .slice(0, MAX_CANDIDATES);
  let best: Candidate | undefined;
  let bestScore = MIN_AGREEMENT;
  for (const { candidate } of candidates) {
    const score = agreement(text, anchor, candidate);
    if (score < bestScore || (score === bestScore && best && distance(candidate) >= distance(best))) continue;
    best = candidate;
    bestScore = score;
  }
  return best ? { start: best.start, end: best.end } : null;
}

/** A DOM range over `position` in `root`'s text, for highlighting and measuring it. */
export function rangeOf(root: Node, { start, end }: Position): Range {
  const nodes = textNodes(root);
  const range = (root.ownerDocument ?? (root as Document)).createRange();
  // A boundary between two text nodes belongs to the next one at the start and the previous one at the end,
  // so the range never begins or ends on an empty stretch of the line before or after it.
  const [startNode, startOffset] = pointAt(nodes, start, false) ?? [root, 0];
  const [endNode, endOffset] = pointAt(nodes, end, true) ?? [root, 0];
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  return range;
}

/** Characters of `root`'s text before the boundary point (`container`, `offset`). */
function offsetOf(root: Node, container: Node, offset: number): number {
  const before = (root.ownerDocument ?? (root as Document)).createRange();
  before.setStart(root, 0);
  before.setEnd(container, offset);
  // A range's string is the data of the text nodes it covers: the same text model as `textContent`.
  return before.toString().length;
}

function textNodes(root: Node): Text[] {
  const walker = (root.ownerDocument ?? (root as Document)).createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node as Text);
  return nodes;
}

function pointAt(nodes: readonly Text[], offset: number, atEnd: boolean): [Text, number] | undefined {
  let seen = 0;
  for (const node of nodes) {
    const next = seen + node.length;
    if (atEnd ? offset <= next : offset < next) return [node, offset - seen];
    seen = next;
  }
  const last = nodes.at(-1);
  return last && [last, last.length];
}

function* occurrences(text: string, exact: string): Generator<Candidate> {
  for (let index = text.indexOf(exact); index !== -1; index = text.indexOf(exact, index + 1)) {
    yield { start: index, end: index + exact.length, edits: 0 };
  }
}

/** The share of `anchor`'s characters that agree with the text around `candidate`, from 0 to 1. */
function agreement(text: string, { exact, prefix, suffix }: Anchor, candidate: Candidate): number {
  // The context sits against the passage, wherever its far end now falls.
  const before = editsToStart(reverse(prefix), reverse(text.slice(Math.max(0, candidate.start - 2 * prefix.length), candidate.start)));
  const after = editsToStart(suffix, text.slice(candidate.end, candidate.end + 2 * suffix.length));
  return 1 - (candidate.edits + before + after) / (exact.length + prefix.length + suffix.length);
}

/**
 * Characters of `anchor`'s context that match the text right beside `candidate`, up to the first difference on each
 * side: a cheap estimate of {@link agreement} for choosing which candidates it scores.
 */
function adjacentAgreement(text: string, { prefix, suffix }: Anchor, { start, end }: Candidate): number {
  let before = 0;
  // Past either end of the text `charCodeAt` is NaN, which matches nothing.
  while (before < prefix.length && unit(prefix.charCodeAt(prefix.length - 1 - before)) === unit(text.charCodeAt(start - 1 - before))) before++;
  let after = 0;
  while (after < suffix.length && unit(suffix.charCodeAt(after)) === unit(text.charCodeAt(end + after))) after++;
  return before + after;
}

/**
 * Near matches of the quote: for each place in the text where the fewest edits turn the quote into the text there,
 * that passage and its edit count, up to {@link MAX_QUOTE_EDITS}. Sellers' approximate string matching, over a
 * stretch centred on the stored position and sized to {@link SEARCH_CELLS}.
 */
function nearMatches(text: string, { exact, start }: Anchor): Candidate[] {
  const quote = codes(exact);
  const length = quote.length;
  const maxEdits = Math.floor(length * MAX_QUOTE_EDITS);
  if (!maxEdits) return [];
  const span = Math.max(length + 2 * maxEdits, Math.floor(SEARCH_CELLS / length));
  const from = Math.max(0, Math.min(start - Math.floor((span - length) / 2), text.length - span));
  const window = codes(text.slice(from, from + span));

  // Column by column over the text: `cost[i]` is the fewest edits turning the quote's first `i` characters into text
  // ending here, and `origin[i]` is where that text starts.
  const cost = Uint32Array.from({ length: length + 1 }, (_, i) => i);
  const origin = new Int32Array(length + 1).fill(from);
  const found: Candidate[] = [];
  let pending: Candidate | undefined;
  let previous = length;
  for (let j = 0; j < window.length; j++) {
    let diagonal = cost[0]!;
    let diagonalOrigin = origin[0]!;
    origin[0] = from + j + 1;
    for (let i = 1; i <= length; i++) {
      const above = cost[i]!;
      const aboveOrigin = origin[i]!;
      let best = diagonal + (quote[i - 1] === window[j] ? 0 : 1);
      let bestOrigin = diagonalOrigin;
      if (above + 1 < best) [best, bestOrigin] = [above + 1, aboveOrigin];
      if (cost[i - 1]! + 1 < best) [best, bestOrigin] = [cost[i - 1]! + 1, origin[i - 1]!];
      diagonal = above;
      diagonalOrigin = aboveOrigin;
      cost[i] = best;
      origin[i] = bestOrigin;
    }
    // Keep each local minimum: the end where a match is best, not its neighbours one edit worse.
    const edits = cost[length]!;
    if (edits < previous) pending = edits <= maxEdits ? { start: origin[length]!, end: from + j + 1, edits } : undefined;
    else if (edits > previous && pending) {
      found.push(pending);
      pending = undefined;
    }
    previous = edits;
  }
  if (pending) found.push(pending);
  return found;
}

/** The fewest edits turning `pattern` into some start of `text`. */
function editsToStart(pattern: string, text: string): number {
  const row = Uint32Array.from({ length: text.length + 1 }, (_, j) => j);
  const a = codes(pattern);
  const b = codes(text);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = row[j]!;
      row[j] = Math.min(diagonal + (a[i - 1] === b[j - 1] ? 0 : 1), above + 1, row[j - 1]! + 1);
      diagonal = above;
    }
  }
  return Math.min(...row);
}

const SPACE = 32;
const NO_BREAK_SPACE = 0xa0;

/** A UTF-16 code unit with every kind of whitespace alike: reflowing a sentence costs nothing. */
function unit(code: number): number {
  return code <= SPACE || code === NO_BREAK_SPACE ? SPACE : code;
}

/** The text's {@link unit}s, so offsets stay the text's own. */
function codes(text: string): Uint16Array {
  const units = new Uint16Array(text.length);
  for (let i = 0; i < text.length; i++) units[i] = unit(text.charCodeAt(i));
  return units;
}

function reverse(text: string): string {
  return text.split("").reverse().join("");
}
