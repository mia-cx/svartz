/**
 * The explorer's sort order. `@svartz/ui` sorts the explorer tree with it, and `llms.txt` lists pages in the same order.
 * Browser-safe: it imports nothing.
 */

/** A note's `order` frontmatter, when it is a finite number. Lower sorts first. */
export function orderOf(entry: { readonly properties?: Readonly<Record<string, unknown>> } | undefined): number | undefined {
  const order = entry?.properties?.order;
  return typeof order === "number" && Number.isFinite(order) ? order : undefined;
}

/** What {@link compareExplorerNodes} sorts by. */
export interface ExplorerSortable {
  readonly isFolder: boolean;
  /** The note's `order` frontmatter, or for a folder its folder note's. */
  readonly order?: number;
  readonly title: string;
  /** A theme's explorer row: rank, then key in place of the title, then order. Plain notes rank 2, by title. */
  readonly item?: { readonly sort?: readonly [rank: number, key: string, order: number] };
}

/** Plain notes rank after themed pages that set a rank below 2 (schemas 0, operations 1). */
const PLAIN_RANK = 2;
const naturalOrder = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/** Siblings in explorer order: folders before notes, then by `order`, then a theme row's rank, then title in natural order. */
export function compareExplorerNodes(left: ExplorerSortable, right: ExplorerSortable): number {
  const rank = (node: ExplorerSortable) => node.item?.sort?.[0] ?? PLAIN_RANK;
  const key = (node: ExplorerSortable) => node.item?.sort?.[1] ?? node.title;
  return Number(right.isFolder) - Number(left.isFolder) ||
    (left.order ?? Infinity) - (right.order ?? Infinity) ||
    rank(left) - rank(right) ||
    naturalOrder.compare(key(left), key(right)) ||
    (left.item?.sort?.[2] ?? 0) - (right.item?.sort?.[2] ?? 0);
}
