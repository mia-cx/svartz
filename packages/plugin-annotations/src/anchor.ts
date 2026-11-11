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
 * Where `anchor` is in `text` now, or `null` when its quote is gone.
 * The stored position wins while it still holds the quote. Otherwise every occurrence of the quote is scored by how
 * much of the stored prefix and suffix surround it, and the closest of the best-scoring ones wins.
 */
export function locate(text: string, anchor: Anchor): Position | null {
  const { exact, prefix, suffix, start, end } = anchor;
  if (!exact) return null;
  if (text.slice(start, end) === exact) return { start, end };

  let best: Position | null = null;
  let bestScore = -1;
  let bestDistance = Infinity;
  for (let index = text.indexOf(exact); index !== -1; index = text.indexOf(exact, index + 1)) {
    const after = index + exact.length;
    const score = sharedSuffix(text.slice(Math.max(0, index - prefix.length), index), prefix)
      + sharedPrefix(text.slice(after, after + suffix.length), suffix);
    const distance = Math.abs(index - start);
    if (score > bestScore || (score === bestScore && distance < bestDistance)) {
      best = { start: index, end: after };
      bestScore = score;
      bestDistance = distance;
    }
  }
  return best;
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

function sharedPrefix(a: string, b: string): number {
  let length = 0;
  while (length < a.length && length < b.length && a[length] === b[length]) length++;
  return length;
}

function sharedSuffix(a: string, b: string): number {
  let length = 0;
  while (length < a.length && length < b.length && a[a.length - 1 - length] === b[b.length - 1 - length]) length++;
  return length;
}
