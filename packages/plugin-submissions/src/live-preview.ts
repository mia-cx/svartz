/**
 * Live Preview: Obsidian-style rendering of Markdown while it is edited. Headings, emphasis, links, wikilinks, inline
 * code, callouts, embeds and task checkboxes show formatted; the line holding the cursor shows its raw syntax. Only
 * decorations change: the document's bytes are the same in every mode.
 */
import { Language, defineLanguageFacet, languageDataProp, syntaxTree } from "@codemirror/language";
import type { EditorState, Extension, Range, Text } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { Strikethrough, TaskList, parser, type MarkdownConfig } from "@lezer/markdown";

const OPEN_BRACKET = 91; // [
const BANG = 33; // !

/** `[[target]]` and `![[target]]`, as Obsidian writes links and embeds. */
const Wikilinks: MarkdownConfig = {
  defineNodes: ["Wikilink", "Embed", "WikilinkMark"],
  parseInline: [{
    name: "Wikilink",
    parse(cx, next, pos) {
      const embed = next === BANG;
      const open = embed ? pos + 1 : pos;
      if ((!embed && next !== OPEN_BRACKET) || cx.char(open) !== OPEN_BRACKET || cx.char(open + 1) !== OPEN_BRACKET) return -1;
      const close = cx.slice(open + 2, cx.offset + cx.text.length).indexOf("]]");
      if (close < 1) return -1;
      const end = open + 2 + close + 2;
      return cx.addElement(cx.elt(embed ? "Embed" : "Wikilink", pos, end, [
        cx.elt("WikilinkMark", pos, open + 2),
        cx.elt("WikilinkMark", end - 2, end),
      ]));
    },
    before: "Link",
  }],
};

const data = defineLanguageFacet();
const markdownParser = parser.configure([Strikethrough, TaskList, Wikilinks, { props: [languageDataProp.add({ Document: data })] }]);
/** Markdown with Obsidian's links and GitHub's task lists and strikethrough, for the decorations to read. */
const markdown = new Language(data, markdownParser, [], "markdown");

/** Lines searched for frontmatter's closing `---`. */
const FRONTMATTER_LINES = 500;

/**
 * Where frontmatter at the top of the note ends, or 0: YAML that Markdown would misread as a heading or a rule. Read by
 * line, as document positions count every line break as one character, CRLF included.
 */
function frontmatterEnd(doc: Text): number {
  if (doc.lines < 2 || doc.line(1).text.trimEnd() !== "---") return 0;
  for (let number = 2; number <= Math.min(doc.lines, FRONTMATTER_LINES); number++) {
    const line = doc.line(number);
    if (line.text.trimEnd() === "---") return line.to;
  }
  return 0;
}
/** A callout's first line: `> [!note] Title`. */
const CALLOUT = /^\s*>\s*\[!([\w-]+)\][+-]?/;

const hide = Decoration.replace({});
const mark = (className: string) => Decoration.mark({ class: className });
const line = (className: string, attributes?: Record<string, string>) => Decoration.line({ class: className, ...(attributes ? { attributes } : {}) });
const MARKS = {
  Emphasis: mark("cm-lp-em"),
  StrongEmphasis: mark("cm-lp-strong"),
  Strikethrough: mark("cm-lp-strike"),
  InlineCode: mark("cm-lp-code"),
  Link: mark("cm-lp-link"),
  Wikilink: mark("cm-lp-link cm-lp-wikilink"),
} as const;
/** Syntax that hides away from the cursor, as its parent node names it. */
const HIDDEN_MARKS = new Set(["EmphasisMark", "StrikethroughMark", "CodeMark", "LinkMark", "URL", "LinkTitle"]);

/** A task's `[ ]` or `[x]`, as a checkbox that toggles it. */
class TaskWidget extends WidgetType {
  constructor(readonly checked: boolean) {
    super();
  }

  override eq(other: TaskWidget) {
    return other.checked === this.checked;
  }

  toDOM() {
    const box = Object.assign(document.createElement("input"), { type: "checkbox", checked: this.checked, tabIndex: -1, className: "cm-lp-task" });
    box.setAttribute("aria-label", "Done");
    return box;
  }

  override ignoreEvent() {
    return false;
  }
}

/** A short label standing in for syntax: a callout's type, or the note an embed shows. */
class LabelWidget extends WidgetType {
  constructor(readonly text: string, readonly className: string) {
    super();
  }

  override eq(other: LabelWidget) {
    return other.text === this.text && other.className === this.className;
  }

  toDOM() {
    return Object.assign(document.createElement("span"), { className: this.className, textContent: this.text });
  }
}

const calloutName = (type: string) => type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();

/** Whether a selection touches any line from `from` to `to`: those lines show their syntax. */
function revealed(state: EditorState, from: number, to: number): boolean {
  const start = state.doc.lineAt(from).from;
  const end = state.doc.lineAt(to).to;
  return state.selection.ranges.some((range) => range.from <= end && range.to >= start);
}

function decorate(view: EditorView): DecorationSet {
  const { state } = view;
  const ranges: Array<Range<Decoration>> = [];
  const frontmatter = frontmatterEnd(state.doc);
  const tree = syntaxTree(state);

  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from: Math.max(from, frontmatter),
      to,
      enter(node) {
        if (node.from < frontmatter) return;
        const name = node.name;
        const shown = revealed(state, node.from, node.to);

        const heading = /^ATXHeading(\d)$/.exec(name);
        if (heading) {
          ranges.push(line(`cm-lp-heading cm-lp-h${heading[1]}`).range(state.doc.lineAt(node.from).from));
          return;
        }
        if (name === "HeaderMark") {
          if (shown || node.node.parent?.name.startsWith("SetextHeading")) return;
          const leading = node.from === node.node.parent?.from;
          const hideFrom = !leading && state.sliceDoc(node.from - 1, node.from) === " " ? node.from - 1 : node.from;
          const hideTo = leading && state.sliceDoc(node.to, node.to + 1) === " " ? node.to + 1 : node.to;
          ranges.push(hide.range(hideFrom, hideTo));
          return;
        }
        if (name in MARKS) {
          if (node.to > node.from) ranges.push(MARKS[name as keyof typeof MARKS].range(node.from, node.to));
          if (name === "Wikilink" && !shown) {
            // `[[target|label]]` shows `label`; `[[target]]` shows `target`.
            const pipe = state.sliceDoc(node.from + 2, node.to - 2).indexOf("|");
            if (pipe >= 0) ranges.push(hide.range(node.from + 2, node.from + 2 + pipe + 1));
          }
          return;
        }
        if (name === "WikilinkMark") {
          if (!shown && node.node.parent?.name === "Wikilink") ranges.push(hide.range(node.from, node.to));
          return;
        }
        if (HIDDEN_MARKS.has(name)) {
          // A link's own syntax hides; an image's stays, as images don't render here.
          const parent = node.node.parent?.name;
          if (!shown && parent !== "Image" && parent !== "Autolink" && node.to > node.from) ranges.push(hide.range(node.from, node.to));
          return;
        }
        if (name === "Embed") {
          if (!shown) ranges.push(Decoration.replace({ widget: new LabelWidget(state.sliceDoc(node.from + 3, node.to - 2), "cm-lp-embed") }).range(node.from, node.to));
          return false;
        }
        if (name === "TaskMarker") {
          if (!shown) ranges.push(Decoration.replace({ widget: new TaskWidget(/x/i.test(state.sliceDoc(node.from, node.to))) }).range(node.from, node.to));
          return;
        }
        if (name === "FencedCode") {
          for (let at = node.from; at <= node.to;) {
            const { from: start, to: end } = state.doc.lineAt(at);
            ranges.push(line("cm-lp-codeblock").range(start));
            at = end + 1;
          }
          return false;
        }
        if (name === "Blockquote") {
          const first = state.doc.lineAt(node.from);
          const callout = CALLOUT.exec(first.text);
          for (let at = node.from; at <= node.to;) {
            const current = state.doc.lineAt(at);
            ranges.push(callout
              ? line("cm-lp-callout", { "data-callout": callout[1]!.toLowerCase() }).range(current.from)
              : line("cm-lp-quote").range(current.from));
            at = current.to + 1;
          }
          if (callout && !revealed(state, first.from, first.from)) {
            const type = first.text.indexOf("[!");
            ranges.push(Decoration.replace({ widget: new LabelWidget(calloutName(callout[1]!), "cm-lp-callout-type") })
              .range(first.from + type, first.from + callout[0].length));
          }
          return;
        }
        if (name === "QuoteMark") {
          if (shown) return;
          const end = state.sliceDoc(node.to, node.to + 1) === " " ? node.to + 1 : node.to;
          ranges.push(hide.range(node.from, end));
        }
      },
    });
  }
  return Decoration.set(ranges, true);
}

/** Toggle the task whose checkbox was clicked. */
function toggleTask(view: EditorView, box: HTMLElement): boolean {
  const at = view.posAtDOM(box);
  const marker = view.state.sliceDoc(at, at + 3);
  if (!/^\[[ xX]\]$/.test(marker)) return false;
  view.dispatch({ changes: { from: at + 1, to: at + 2, insert: marker[1] === " " ? "x" : " " } });
  return true;
}

const decorations = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = decorate(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged || syntaxTree(update.startState) !== syntaxTree(update.state)) {
        this.decorations = decorate(update.view);
      }
    }
  },
  {
    decorations: (plugin) => plugin.decorations,
    eventHandlers: {
      mousedown(event, view) {
        const target = event.target as HTMLElement;
        return target.matches(".cm-lp-task") && toggleTask(view, target);
      },
    },
  },
);

/** The extension a mode switch installs for Live Preview. */
export function livePreview(): Extension {
  return [markdown, decorations, EditorView.editorAttributes.of({ class: "cm-lp" })];
}
