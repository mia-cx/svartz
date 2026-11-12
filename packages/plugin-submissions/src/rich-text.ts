/**
 * Rich text: the note edited as formatted text, for readers who don't write Markdown. It is a presentation of the
 * same CodeMirror document as Live Preview and Source, so the Markdown stays the one source of truth and switching
 * modes never changes a byte. Loaded the first time the reader opens it.
 *
 * Syntax hides everywhere, and the cursor never stops inside it. A toolbar formats headings, bold, italics, lists,
 * links, wikilinks and callouts by writing Markdown; the frontmatter shows as a properties panel at the top of the note
 * that edits its keys and values line by line. What the toolbar can't represent (tables, code, HTML, footnotes, math, comments) shows as
 * raw blocks of its source, untouched.
 */
import { startCompletion } from "@codemirror/autocomplete";
import { syntaxTree } from "@codemirror/language";
import {
  EditorSelection,
  EditorState,
  Prec,
  Transaction,
  findClusterBreak,
  type ChangeSpec,
  type Extension,
  type Line,
  type Text,
} from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, keymap, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";
import { CALLOUT, frontmatterEnd, markdown, syntaxDecorations } from "./live-preview";
import { closeProperties, fromPanel, propertiesPanel, updateProperties } from "./properties";

// --- Raw blocks ---------------------------------------------------------------------------------------------------

/** Blocks the toolbar has no button for, shown as their source. */
const RAW_BLOCKS = new Set([
  "FencedCode", "CodeBlock", "HTMLBlock", "CommentBlock", "ProcessingInstructionBlock", "LinkReference",
  "SetextHeading1", "SetextHeading2", "HorizontalRule",
]);
/** Paragraphs to Markdown that the site renders otherwise: a footnote, display math, an Obsidian comment. */
const RAW_PARAGRAPH = /^(?:\[\^[^\]]+\]:|\$\$|%%)/;
/** A table's second line, under a first line holding a `|`. */
const TABLE_DELIMITER = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/;

function isRaw(state: EditorState, node: SyntaxNode): boolean {
  if (RAW_BLOCKS.has(node.name)) return true;
  if (node.name !== "Paragraph") return false;
  const first = state.doc.lineAt(node.from);
  if (RAW_PARAGRAPH.test(first.text)) return true;
  return first.text.includes("|") && first.to < node.to && TABLE_DELIMITER.test(state.doc.line(first.number + 1).text);
}

/** Whether `pos` is in a raw block, where editing is plain text editing. */
function inRaw(state: EditorState, pos: number): boolean {
  for (const side of [1, -1] as const) {
    let node: SyntaxNode | null = syntaxTree(state).resolve(pos, side);
    while (node?.parent && node.parent.name !== "Document") node = node.parent;
    if (node?.parent && isRaw(state, node)) return true;
  }
  return false;
}

/** Live Preview's decorations with every bit of syntax hidden, bullets drawn, and raw blocks left as source. */
const syntax = syntaxDecorations({ reveal: () => false, raw: isRaw, bullets: true });

/** The syntax hidden from view: replaced ranges, which the cursor steps over and deletion skips. */
function hidden(view: EditorView): DecorationSet {
  const decorations = view.plugin(syntax)?.decorations ?? Decoration.none;
  return decorations.update({ filter: (from, to, value) => value.point && to > from });
}

// --- Frontmatter --------------------------------------------------------------------------------------------------

/** Where the note's body starts: after its frontmatter's line, or at 0. */
function bodyStart(doc: Text): number {
  const end = frontmatterEnd(doc);
  if (!end) return 0;
  const close = doc.lineAt(end);
  return close.number < doc.lines ? doc.line(close.number + 1).from : end;
}

/**
 * A note that is only frontmatter, ending at its closing `---`, has no body line: the panel shows that `---` line
 * empty in its place. What the reader writes there, typed or from the toolbar, goes on a new line after the `---`, in
 * the note's line endings, so the frontmatter stays closed. Until the reader writes, the note keeps every byte.
 */
const openBody = EditorState.transactionFilter.of((tr) => {
  const { doc, lineBreak } = tr.startState;
  const end = frontmatterEnd(doc);
  if (!tr.docChanged || !end || end < doc.length || tr.annotation(fromPanel)) return tr;
  const close = doc.lineAt(end).from;
  const written: Array<{ from: number; to: number }> = [];
  let text = "";
  let elsewhere = false;
  tr.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
    if (fromA < close || toA > fromA) elsewhere = true;
    written.push({ from: fromB, to: toB });
    text += inserted.toString();
  });
  // Enter, or a redo, already starts the line.
  if (elsewhere || text.startsWith("\n")) return tr;
  /** A position after the edit as written, moved to where its text lands on the new line. */
  const onNewLine = (pos: number) => {
    if (pos < close) return pos;
    return written.reduce((at, { from, to }) => at + Math.max(0, Math.min(pos, to) - from), end + 1);
  };
  const { ranges, mainIndex } = tr.newSelection;
  return {
    changes: { from: end, insert: lineBreak + text },
    selection: EditorSelection.create(ranges.map((range) => EditorSelection.range(onNewLine(range.anchor), onNewLine(range.head))), mainIndex),
    effects: tr.effects,
    scrollIntoView: tr.scrollIntoView,
    userEvent: tr.annotation(Transaction.userEvent),
  };
});

// --- Line prefixes ------------------------------------------------------------------------------------------------

/**
 * What opens a line before its text: quote marks, a callout's type, then a heading's marks or a list item's marker and
 * checkbox. The groups are those three parts; any may be empty.
 */
const PREFIX = /^((?:[ \t]*>[ \t]?)*)(\[![\w-]+\][+-]?[ \t]?)?(#{1,6}[ \t]+|[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+(?:\[[ xX]\][ \t]+)?)?/;
const LIST_MARKER = /^([ \t]*)(?:([-*+])|(\d{1,9})([.)]))([ \t]+)(\[[ xX]\][ \t]+)?/;
const HEADING_MARKER = /^(#{1,6})[ \t]/;

/** `line`'s prefix and its three parts, or none in a raw block. */
function prefixOf(state: EditorState, line: Line) {
  const [whole, quotes = "", label = "", marker = ""] = inRaw(state, line.from) ? [""] : PREFIX.exec(line.text)!;
  return { length: whole.length, quotes, label, marker };
}

/** The length of the prefix's last part, which Backspace removes: the marker, else the callout's type, else a quote mark. */
function lastPart({ quotes, label, marker }: ReturnType<typeof prefixOf>): number {
  return marker.length || label.length || /[ \t]*>[ \t]?$/.exec(quotes)?.[0].length || 0;
}

/**
 * Keep every cursor out of the syntax: below the frontmatter, and after a line's prefix, so typing never lands inside
 * a heading's marks or before a bullet. Moving left from a line's text goes on to the end of the line above.
 */
const keepOutOfSyntax = EditorState.transactionFilter.of((tr) => {
  if (!tr.selection && !tr.docChanged) return tr;
  const { state } = tr;
  const start = bodyStart(state.doc);
  const selection = tr.newSelection;
  let moved = false;
  const ranges = selection.ranges.map((range, index) => {
    if (!range.empty) {
      if (range.from >= start) return range;
      moved = true;
      return EditorSelection.range(Math.max(range.anchor, start), Math.max(range.head, start));
    }
    let pos = Math.max(range.head, start);
    const line = state.doc.lineAt(pos);
    const end = line.from + prefixOf(state, line).length;
    if (pos < end) {
      const before = tr.docChanged ? undefined : tr.startState.selection.ranges[index]?.head;
      const leftward = before !== undefined && before > pos && before <= line.to;
      pos = leftward && line.number > 1 && line.from > start ? line.from - 1 : end;
    }
    if (pos === range.head) return range;
    moved = true;
    return EditorSelection.cursor(pos);
  });
  return moved ? [tr, { selection: EditorSelection.create(ranges, selection.mainIndex), sequential: true }] : tr;
});

// --- Deleting and breaking lines ----------------------------------------------------------------------------------

/** Inline formatting whose text, once deleted, takes its syntax with it rather than leaving `****` behind. */
const INLINE = new Set(["Emphasis", "StrongEmphasis", "Strikethrough", "InlineCode", "Link"]);

/** The span to delete for `from`–`to`: the whole formatting when that is all of its text. */
function deletion(state: EditorState, from: number, to: number): { from: number; to: number } {
  let span = { from, to };
  for (let node: SyntaxNode | null = syntaxTree(state).resolveInner(from, 1); node && INLINE.has(node.name); node = node.parent) {
    const marks = node.getChildren(node.name === "Link" ? "LinkMark" : node.firstChild?.name ?? "");
    const [open, close] = marks;
    if (!open || !close || open.to !== span.from || close.from !== span.to) break;
    span = { from: node.from, to: node.to };
  }
  return span;
}

function remove(view: EditorView, from: number, to: number, userEvent: string): true {
  view.dispatch({ changes: { from, to }, userEvent, scrollIntoView: true });
  return true;
}

/**
 * Backspace as in a word processor: at a line's start it removes the line's last prefix part (a list marker, a
 * heading, a callout's type, a quote level); elsewhere it deletes the character before the cursor, stepping over hidden
 * syntax, and a widget such as an embed or a checkbox as a whole.
 */
function deleteBackward(view: EditorView): boolean {
  const { state } = view;
  const range = state.selection.main;
  if (!range.empty || state.selection.ranges.length > 1) return false;
  const start = bodyStart(state.doc);
  let pos = range.head;
  if (pos <= start) return start > 0;
  if (inRaw(state, pos)) return false;
  const line = state.doc.lineAt(pos);
  const prefix = prefixOf(state, line);
  if (prefix.length > 0 && pos === line.from + prefix.length) return remove(view, pos - lastPart(prefix), pos, "delete.backward");

  const syntaxRanges = hidden(view);
  for (;;) {
    let before: { from: number; widget: boolean } | undefined;
    syntaxRanges.between(pos, pos, (from, to, value) => {
      if (to !== pos || from >= pos) return;
      before = { from, widget: Boolean(value.spec.widget) };
      return false;
    });
    if (!before) break;
    if (before.widget) return remove(view, before.from, pos, "delete.backward");
    pos = before.from;
  }
  if (pos === line.from) {
    if (line.number === 1 || line.from <= start) return true;
    return remove(view, line.from - 1, line.from, "delete.backward");
  }
  const span = deletion(state, findClusterBreak(line.text, pos - line.from, false) + line.from, pos);
  return remove(view, span.from, span.to, "delete.backward");
}

/** Delete as Backspace's mirror: at a line's end it joins the next line's text, dropping that line's prefix. */
function deleteForward(view: EditorView): boolean {
  const { state } = view;
  const range = state.selection.main;
  if (!range.empty || state.selection.ranges.length > 1 || inRaw(state, range.head)) return false;
  let pos = range.head;
  const syntaxRanges = hidden(view);
  for (;;) {
    let after: { to: number; widget: boolean } | undefined;
    syntaxRanges.between(pos, pos, (from, to, value) => {
      if (from !== pos || to <= pos) return;
      after = { to, widget: Boolean(value.spec.widget) };
      return false;
    });
    if (!after) break;
    if (after.widget) return remove(view, pos, after.to, "delete.forward");
    pos = after.to;
  }
  const line = state.doc.lineAt(pos);
  if (pos === line.to) {
    if (line.number === state.doc.lines) return true;
    const next = state.doc.line(line.number + 1);
    return remove(view, pos, next.from + prefixOf(state, next).length, "delete.forward");
  }
  const span = deletion(state, pos, findClusterBreak(line.text, pos - line.from, true) + line.from);
  return remove(view, span.from, span.to, "delete.forward");
}

/**
 * Enter continues a list or a quote on the next line, and on an empty item ends it, leaving a blank line before what
 * the reader writes next: without one, Markdown reads that text as more of the item or the quote. Elsewhere it is
 * CodeMirror's.
 */
function continueBlock(view: EditorView): boolean {
  const { state } = view;
  const range = state.selection.main;
  if (!range.empty || state.selection.ranges.length > 1 || range.head < bodyStart(state.doc)) return false;
  const line = state.doc.lineAt(range.head);
  const prefix = prefixOf(state, line);
  if (!prefix.length || range.head < line.from + prefix.length) return false;
  if (!line.text.slice(prefix.length).trim()) {
    const cut = line.from + prefix.length - lastPart(prefix);
    // A callout's first line has nothing above it in the callout to run on from.
    if (prefix.label) return remove(view, cut, line.from + prefix.length, "delete");
    // The quote levels left, which a blank line inside them repeats bare: `>`.
    const quotes = state.sliceDoc(line.from, cut);
    const insert = `${quotes.trimEnd()}${state.lineBreak}${quotes}`;
    view.dispatch({
      changes: { from: line.from, to: line.to, insert },
      selection: EditorSelection.cursor(line.from + quotes.trimEnd().length + 1 + quotes.length),
      userEvent: "input",
      scrollIntoView: true,
    });
    return true;
  }
  const list = LIST_MARKER.exec(prefix.marker);
  const next = prefix.quotes + (list ? `${list[1]}${list[2] ?? `${Number(list[3]) + 1}${list[4]}`}${list[5]}${list[6] ? "[ ] " : ""}` : "");
  if (!next) return false;
  view.dispatch(state.replaceSelection(state.lineBreak + next), { scrollIntoView: true, userEvent: "input" });
  return true;
}

// --- Toolbar commands ---------------------------------------------------------------------------------------------

/** The lines the main selection touches. */
function selectedLines(state: EditorState): Line[] {
  const { from, to } = state.selection.main;
  const lines: Line[] = [];
  for (let at = from; ;) {
    const line = state.doc.lineAt(at);
    lines.push(line);
    if (line.to >= to) return lines;
    at = line.to + 1;
  }
}

/** The innermost `name` node the main selection sits strictly inside, past its opening syntax. */
function enclosing(state: EditorState, ...names: string[]): SyntaxNode | undefined {
  const { from, to } = state.selection.main;
  for (let node: SyntaxNode | null = syntaxTree(state).resolveInner(from, 1); node; node = node.parent) {
    if (names.includes(node.name) && node.from < from && to < node.to) return node;
  }
  return undefined;
}

const headingLevel = (state: EditorState) => {
  const line = state.doc.lineAt(state.selection.main.head);
  return HEADING_MARKER.exec(prefixOf(state, line).marker)?.[1]!.length ?? 0;
};

/** Make the selected lines headings of `level`, or paragraphs when they all are already. */
function toggleHeading(view: EditorView, level: number) {
  const { state } = view;
  const off = headingLevel(state) === level;
  view.dispatch({
    changes: selectedLines(state).map((line) => {
      const { quotes, label, marker } = prefixOf(state, line);
      const at = line.from + quotes.length + label.length;
      return { from: at, to: at + marker.length, insert: off ? "" : `${"#".repeat(level)} ` };
    }),
    userEvent: "input.format",
  });
}

type ListKind = "bullet" | "ordered";
const listKind = (marker: string): ListKind | undefined => {
  const list = LIST_MARKER.exec(marker);
  return list ? (list[2] ? "bullet" : "ordered") : undefined;
};

/** Make the selected lines items of a `kind` list, or plain lines when they all are already. */
function toggleList(view: EditorView, kind: ListKind) {
  const { state } = view;
  const lines = selectedLines(state);
  const written = lines.filter((line) => line.text.trim() || lines.length === 1);
  const off = written.every((line) => listKind(prefixOf(state, line).marker) === kind);
  view.dispatch({
    changes: written.map((line, index) => {
      const { quotes, label, marker } = prefixOf(state, line);
      const at = line.from + quotes.length + label.length;
      const indent = listKind(marker) ? /^[ \t]*/.exec(marker)![0] : "";
      return { from: at, to: at + marker.length, insert: off ? "" : `${indent}${kind === "bullet" ? "-" : `${index + 1}.`} ` };
    }),
    userEvent: "input.format",
  });
}

/** The callout the main selection is in: a blockquote whose first line names a type. */
function calloutAt(state: EditorState): SyntaxNode | undefined {
  const { head } = state.selection.main;
  for (let node: SyntaxNode | null = syntaxTree(state).resolveInner(head, -1); node; node = node.parent) {
    if (node.name === "Blockquote" && CALLOUT.test(state.doc.lineAt(node.from).text)) return node;
  }
  return undefined;
}

/** Put the selected lines in a note callout, or take the callout the cursor is in apart into plain lines. */
function toggleCallout(view: EditorView) {
  const { state } = view;
  const callout = calloutAt(state);
  if (!callout) {
    const lines = selectedLines(state);
    const changes: ChangeSpec[] = [{ from: lines[0]!.from, insert: `> [!note]${state.lineBreak}` }];
    for (const line of lines) changes.push({ from: line.from, insert: "> " });
    view.dispatch({ changes, userEvent: "input.format" });
    return;
  }
  const changes: ChangeSpec[] = [];
  for (let number = state.doc.lineAt(callout.from).number; number <= state.doc.lineAt(callout.to).number; number++) {
    const line = state.doc.line(number);
    const quote = /^[ \t]*>[ \t]?/.exec(line.text)?.[0].length ?? 0;
    if (line.from !== callout.from) {
      changes.push({ from: line.from, to: line.from + quote });
      continue;
    }
    const type = /^[ \t]*\[![\w-]+\][+-]?[ \t]*/.exec(line.text.slice(quote))?.[0].length ?? 0;
    // A callout without a title leaves no line behind.
    const end = quote + type === line.text.length && number < state.doc.lines ? line.to + 1 : line.from + quote + type;
    changes.push({ from: line.from, to: end });
  }
  view.dispatch({ changes, userEvent: "input.format" });
}

/** Text the toolbar wraps: the selection, else the word at the cursor, else nothing. */
function target(state: EditorState): { from: number; to: number } {
  const { from, to } = state.selection.main;
  return from === to ? (state.wordAt(from) ?? { from, to }) : { from, to };
}

const MARK = { StrongEmphasis: "**", Emphasis: "*" } as const;

/** Bold or italicise the selection or the word at the cursor, or remove that formatting from around it. */
function toggleMark(view: EditorView, name: keyof typeof MARK, placeholder: string) {
  const { state } = view;
  const node = enclosing(state, name);
  if (node) {
    const width = node.firstChild!.to - node.firstChild!.from;
    view.dispatch({ changes: [{ from: node.from, to: node.from + width }, { from: node.to - width, to: node.to }], userEvent: "input.format" });
    return;
  }
  const mark = MARK[name];
  const { from, to } = target(state);
  const text = from === to ? placeholder : "";
  view.dispatch({
    changes: [{ from, insert: mark + text }, { from: to, insert: mark }],
    selection: EditorSelection.range(from + mark.length, to + mark.length + text.length),
    userEvent: "input.format",
  });
}

/** The link the selection is in, with the range of its URL. */
function linkAt(state: EditorState) {
  const node = enclosing(state, "Link");
  const url = node?.getChild("URL");
  return node && url ? { node, url, href: state.sliceDoc(url.from, url.to) } : undefined;
}

/** A URL as a link destination: the characters that would end it, escaped. */
const destination = (href: string) => href.trim().replace(/[\s()<>]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`);

function setLink(view: EditorView, href: string) {
  const { state } = view;
  const link = linkAt(state);
  if (link) {
    view.dispatch({ changes: { from: link.url.from, to: link.url.to, insert: destination(href) }, userEvent: "input.format" });
    return;
  }
  const { from, to } = target(state);
  const text = from === to ? href.trim() : "";
  view.dispatch({
    changes: [{ from, insert: `[${text}` }, { from: to, insert: `](${destination(href)})` }],
    selection: EditorSelection.cursor(to + text.length + destination(href).length + 4),
    userEvent: "input.format",
  });
}

/** Unwrap the link the selection is in, keeping its text. */
function removeLink(view: EditorView) {
  const link = linkAt(view.state);
  const [open, close] = link?.node.getChildren("LinkMark") ?? [];
  if (!link || !open || !close) return;
  view.dispatch({ changes: [{ from: link.node.from, to: open.to }, { from: close.from, to: link.node.to }], userEvent: "input.format" });
}

/** Wrap the selection in `[[…]]`, or open an empty one, and suggest the site's notes for it. */
function insertWikilink(view: EditorView) {
  const { from, to } = view.state.selection.main;
  const text = view.state.sliceDoc(from, to);
  view.dispatch({ changes: { from, to, insert: `[[${text}]]` }, selection: EditorSelection.cursor(from + 2 + text.length), userEvent: "input" });
  startCompletion(view);
}

// --- The toolbar and the panel ------------------------------------------------------------------------------------

const svg = (paths: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const HEADING = '<path d="M4 12h8"/><path d="M4 18V6"/><path d="M12 18V6"/>';
// Lucide icons, with a pair of brackets drawn for wikilinks.
const ICONS = {
  h1: svg(`${HEADING}<path d="m17 12 3-2v8"/>`),
  h2: svg(`${HEADING}<path d="M21 18h-4c0-4 4-3 4-6 0-1.5-2-2.5-4-1"/>`),
  h3: svg(`${HEADING}<path d="M17.5 10.5c1.7-1 3.5 0 3.5 1.5a2 2 0 0 1-2 2"/><path d="M17 17.5c2 1.5 4 .3 4-1.5a2 2 0 0 0-2-2"/>`),
  bold: svg('<path d="M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8"/>'),
  italic: svg('<line x1="19" x2="10" y1="4" y2="4"/><line x1="14" x2="5" y1="20" y2="20"/><line x1="15" x2="9" y1="4" y2="20"/>'),
  bullet: svg('<path d="M3 12h.01"/><path d="M3 18h.01"/><path d="M3 6h.01"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M8 6h13"/>'),
  ordered: svg('<path d="M10 12h11"/><path d="M10 18h11"/><path d="M10 6h11"/><path d="M4 10h2"/><path d="M4 6h1v4"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/>'),
  link: svg('<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>'),
  wikilink: svg('<path d="M7 4H3v16h4"/><path d="M11 4H7v16h4"/><path d="M13 4h4v16h-4"/><path d="M17 4h4v16h-4"/>'),
  callout: svg('<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>'),
} as const;

const MAC = typeof navigator !== "undefined" && /Mac|iP(?:hone|ad|od)/.test(navigator.platform);

interface Tool {
  readonly id: keyof typeof ICONS;
  readonly label: string;
  /** Mod plus this key runs it. */
  readonly key?: string;
  /** A toggle reports whether it is on where the cursor is. */
  readonly pressed?: (state: EditorState) => boolean;
  readonly run: (view: EditorView, chrome: Chrome) => void;
  /** It starts a group, set apart from the tools before it. */
  readonly group?: true;
}

const TOOLS: readonly Tool[] = [
  { id: "h1", label: "Heading 1", pressed: (state) => headingLevel(state) === 1, run: (view) => toggleHeading(view, 1) },
  { id: "h2", label: "Heading 2", pressed: (state) => headingLevel(state) === 2, run: (view) => toggleHeading(view, 2) },
  { id: "h3", label: "Heading 3", pressed: (state) => headingLevel(state) === 3, run: (view) => toggleHeading(view, 3) },
  { id: "bold", label: "Bold", key: "b", group: true, pressed: (state) => !!enclosing(state, "StrongEmphasis"), run: (view) => toggleMark(view, "StrongEmphasis", "bold text") },
  { id: "italic", label: "Italic", key: "i", pressed: (state) => !!enclosing(state, "Emphasis"), run: (view) => toggleMark(view, "Emphasis", "italic text") },
  {
    id: "bullet", label: "Bulleted list", group: true,
    pressed: (state) => listKind(prefixOf(state, state.doc.lineAt(state.selection.main.head)).marker) === "bullet",
    run: (view) => toggleList(view, "bullet"),
  },
  {
    id: "ordered", label: "Numbered list",
    pressed: (state) => listKind(prefixOf(state, state.doc.lineAt(state.selection.main.head)).marker) === "ordered",
    run: (view) => toggleList(view, "ordered"),
  },
  { id: "link", label: "Link", key: "k", group: true, run: (_, chrome) => chrome.openLink() },
  { id: "wikilink", label: "Link to a page", run: insertWikilink },
  { id: "callout", label: "Callout", pressed: (state) => !!calloutAt(state), run: toggleCallout },
];

const shortcut = (key: string) => ({ label: `${MAC ? "⌘" : "Ctrl+"}${key.toUpperCase()}`, aria: `${MAC ? "Meta" : "Control"}+${key.toUpperCase()}` });

let ids = 0;

/** The toolbar and the link form, above the editor while Rich text shows. */
class Chrome {
  readonly root = document.createElement("div");
  readonly buttons: Array<{ tool: Tool; button: HTMLButtonElement }>;
  readonly linkForm: HTMLElement;
  readonly linkInput: HTMLInputElement;
  editable = true;
  destroyed = false;

  constructor(readonly view: EditorView) {
    const id = `svartz-submissions-rich-${++ids}`;
    this.root.className = "svartz-submissions-rich";
    this.root.innerHTML = `
      <div class="svartz-submissions-toolbar" role="toolbar" aria-label="Formatting"></div>
      <div class="svartz-submissions-link" role="group" aria-label="Link" hidden>
        <label class="sv-label" for="${id}-link">Link address</label>
        <input id="${id}-link" type="text" inputmode="url" autocomplete="off" spellcheck="false" placeholder="https://">
        <button type="button" class="sv-action" data-apply></button>
        <button type="button" class="sv-action" data-unlink>Remove link</button>
        <button type="button" class="sv-action" data-cancel>Cancel</button>
      </div>`;
    const toolbar = this.root.querySelector<HTMLElement>('[role="toolbar"]')!;
    this.buttons = TOOLS.map((tool, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "sv-icon-button";
      button.innerHTML = ICONS[tool.id];
      button.setAttribute("aria-label", tool.label);
      button.title = tool.key ? `${tool.label} (${shortcut(tool.key).label})` : tool.label;
      if (tool.key) button.setAttribute("aria-keyshortcuts", shortcut(tool.key).aria);
      if (tool.pressed) button.setAttribute("aria-pressed", "false");
      if (tool.group) button.dataset.group = "";
      button.tabIndex = index === 0 ? 0 : -1;
      // The editor keeps its selection and focus through a click.
      button.addEventListener("mousedown", (event) => event.preventDefault());
      button.addEventListener("click", () => this.run(tool));
      toolbar.append(button);
      return { tool, button };
    });
    // One stop in the tab order; arrow keys, Home and End move along the toolbar.
    toolbar.addEventListener("keydown", (event) => {
      const current = this.buttons.findIndex(({ button }) => button === document.activeElement);
      const last = this.buttons.length - 1;
      const next = { ArrowRight: current + 1, ArrowLeft: current - 1, Home: 0, End: last }[event.key];
      if (next === undefined || current < 0) return;
      event.preventDefault();
      this.rove(next < 0 ? last : next > last ? 0 : next).focus();
    });
    toolbar.addEventListener("focusin", (event) => {
      const index = this.buttons.findIndex(({ button }) => button === event.target);
      if (index >= 0) this.rove(index);
    });

    this.linkForm = this.root.querySelector(".svartz-submissions-link")!;
    this.linkInput = this.linkForm.querySelector("input")!;
    this.linkForm.querySelector("[data-apply]")!.addEventListener("click", () => this.applyLink());
    this.linkForm.querySelector("[data-unlink]")!.addEventListener("click", () => this.closeLink(() => removeLink(view)));
    this.linkForm.querySelector("[data-cancel]")!.addEventListener("click", () => this.closeLink());
    this.linkInput.addEventListener("keydown", (event) => {
      // Enter mustn't send the panel's form, nor Escape close the panel.
      if (event.key === "Enter") this.applyLink();
      else if (event.key === "Escape") this.closeLink();
      else return;
      event.preventDefault();
      event.stopPropagation();
    });


    this.sync();
    // Once the view is in the page: the panel goes above it, and a cursor another mode left in the frontmatter or a
    // prefix moves out before the reader types.
    queueMicrotask(() => {
      if (this.destroyed || !view.dom.isConnected) return;
      view.dom.before(this.root);
      view.dispatch({ selection: view.state.selection });
    });
  }

  rove(index: number): HTMLButtonElement {
    for (const [at, { button }] of this.buttons.entries()) button.tabIndex = at === index ? 0 : -1;
    return this.buttons[index]!.button;
  }

  run(tool: Tool) {
    if (!this.editable) return;
    tool.run(this.view, this);
    if (tool.id !== "link") this.view.focus();
  }

  /** Show the link form, on the link the cursor is in or for the text to link. */
  openLink() {
    if (!this.editable) return;
    const link = linkAt(this.view.state);
    this.linkInput.value = link?.href ?? "";
    this.linkForm.querySelector("[data-apply]")!.textContent = link ? "Update link" : "Add link";
    this.linkForm.querySelector<HTMLElement>("[data-unlink]")!.hidden = !link;
    this.linkForm.hidden = false;
    this.linkInput.focus();
  }

  applyLink() {
    const href = this.linkInput.value.trim();
    this.closeLink(href ? () => setLink(this.view, href) : undefined);
  }

  closeLink(then?: () => void) {
    this.linkForm.hidden = true;
    then?.();
    this.view.focus();
  }

  /** Bring the toolbar's pressed and disabled states up to date. */
  sync() {
    const { state } = this.view;
    this.editable = state.facet(EditorView.editable);
    for (const { tool, button } of this.buttons) {
      button.disabled = !this.editable;
      if (tool.pressed) button.setAttribute("aria-pressed", String(tool.pressed(state)));
    }
    if (!this.editable) this.linkForm.hidden = true;
  }

  update(update: ViewUpdate) {
    if (
      update.docChanged || update.selectionSet || syntaxTree(update.startState) !== syntaxTree(update.state) ||
      update.startState.facet(EditorView.editable) !== update.state.facet(EditorView.editable)
    ) this.sync();
    updateProperties(update, this.editable);
  }

  destroy() {
    this.destroyed = true;
    this.root.remove();
    closeProperties(this.view);
  }
}

const chrome = ViewPlugin.fromClass(Chrome);

/** Run a toolbar tool from its shortcut. */
const runTool = (id: Tool["id"]) => (view: EditorView) => {
  const plugin = view.plugin(chrome);
  const tool = TOOLS.find((candidate) => candidate.id === id)!;
  if (!plugin?.editable) return false;
  tool.run(view, plugin);
  return true;
};

/** The extension a mode switch installs for Rich text. */
export function richText(): Extension {
  return [
    markdown,
    syntax,
    EditorView.atomicRanges.of(hidden),
    propertiesPanel,
    keepOutOfSyntax,
    // After keepOutOfSyntax, so it runs first: transaction filters run last to first.
    openBody,
    chrome,
    Prec.high(keymap.of([
      { key: "Mod-b", run: runTool("bold") },
      { key: "Mod-i", run: runTool("italic") },
      { key: "Mod-k", run: runTool("link") },
      { key: "Enter", run: continueBlock },
      { key: "Backspace", run: deleteBackward },
      { key: "Delete", run: deleteForward },
    ])),
    EditorView.editorAttributes.of({ class: "cm-lp cm-rt" }),
  ];
}
