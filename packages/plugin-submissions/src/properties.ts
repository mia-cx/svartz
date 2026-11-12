/**
 * Rich text's properties panel: the note's frontmatter as name and value fields. Each edit rewrites only the lines of
 * the property it changes, in the note's own line endings; every other byte of the frontmatter stays as it was.
 *
 * A value shows as text when it is a single scalar, as comma-separated text when it is a list of scalars (written back
 * as the flow or block list it was), and as its YAML otherwise.
 */
import { Annotation, StateField, type ChangeSpec, type Text } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { frontmatterEnd } from "./live-preview";

/** A top-level frontmatter key: plain, or quoted. */
const KEY = /^("(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[^\s#:'"-][^:]*?|-[^\s:][^:]*?)[ \t]*:(?=[ \t]|$)/;

/** One top-level frontmatter property: its key, and its lines from `from` to `to`. `colon` is just past the `:`. */
interface Property {
  readonly key: string;
  readonly keyEnd: number;
  readonly colon: number;
  readonly from: number;
  readonly to: number;
}

/** The frontmatter's properties, and where its closing `---` starts; `undefined` without frontmatter. */
function readProperties(doc: Text): { properties: Property[]; close: number } | undefined {
  const end = frontmatterEnd(doc);
  if (!end) return undefined;
  const close = doc.lineAt(end);
  const properties: Array<{ -readonly [K in keyof Property]: Property[K] }> = [];
  for (let number = 2; number < close.number; number++) {
    const line = doc.line(number);
    const key = KEY.exec(line.text);
    if (key) {
      properties.push({ key: decode(key[1]!) ?? key[1]!, keyEnd: line.from + key[1]!.length, colon: line.from + key[0].length, from: line.from, to: line.to });
    } else if (properties.length && /^(?:[ \t]|-(?:[ \t]|$))/.test(line.text)) {
      properties[properties.length - 1]!.to = line.to;
    }
  }
  return { properties, close: close.from };
}

/** A YAML scalar as text: quotes undone, plain as it is; `undefined` for anything else. */
function decode(raw: string): string | undefined {
  if (raw.startsWith('"')) {
    try {
      const text: unknown = JSON.parse(raw);
      return typeof text === "string" ? text : undefined;
    } catch {
      return undefined;
    }
  }
  if (raw.startsWith("'")) return /^'(?:[^']|'')*'$/.test(raw) ? raw.slice(1, -1).replaceAll("''", "'") : undefined;
  return /^[[{|>&*!]/.test(raw) ? undefined : raw.trimEnd();
}

/** Text YAML would read as something else when written plain. */
const UNSAFE_PLAIN = /^$|^[\s\-?:,[\]{}#&*!|>'"%@`]|\s$|: | #|[\n\r]/;

/** `text` as a YAML scalar, in the quotes the value had, or plain where that reads back the same. */
function encode(text: string, quote: string, flow = false): string {
  if (quote === "'") return `'${text.replaceAll("'", "''")}'`;
  return quote === '"' || UNSAFE_PLAIN.test(text) || (flow && /[,[\]{}]/.test(text)) ? JSON.stringify(text) : text;
}

/**
 * How the panel edits a value: a scalar as text, a list of scalars as comma-separated text (written back flow or
 * block, as it was), anything else as its YAML.
 */
type Field =
  | { readonly kind: "text"; readonly text: string; readonly quote: string }
  | { readonly kind: "list"; readonly items: readonly string[]; readonly indent?: string }
  | { readonly kind: "yaml"; readonly text: string };

function fieldOf(doc: Text, property: Property): Field {
  const [first = "", ...rest] = doc.sliceString(property.colon, property.to, "\n").split("\n");
  const head = first.trim();
  const yaml: Field = { kind: "yaml", text: rest.length ? [head, ...rest].join("\n").replace(/^\n/, "") : head };
  const scalars = (raws: string[]) => {
    const items = raws.map(decode);
    return items.every((item): item is string => item !== undefined && !item.includes(",")) ? items : undefined;
  };
  if (!rest.length) {
    const flow = /^\[([^[\]{}]*)\]$/.exec(head);
    if (flow) {
      const items = flow[1]!.trim() ? scalars(flow[1]!.split(",").map((item) => item.trim())) : [];
      return items ? { kind: "list", items } : yaml;
    }
    const text = decode(head);
    return text === undefined ? yaml : { kind: "text", text, quote: /^["']/.exec(head)?.[0] ?? "" };
  }
  const block = rest.map((line) => /^([ \t]*)- (.*)$/.exec(line));
  const indent = block[0]?.[1];
  if (head || indent === undefined || !block.every((match) => match?.[1] === indent)) return yaml;
  const items = scalars(block.map((match) => match![2]!.trim()));
  return items ? { kind: "list", items, indent } : yaml;
}

/** What follows `key:` for `value` typed into `field`'s input, with `lineBreak` between lines. */
function valueSource(field: Field, value: string, lineBreak: string): string {
  if (field.kind === "text") return value ? ` ${encode(value, field.quote)}` : "";
  if (field.kind === "yaml") {
    if (!value) return "";
    const lines = value.split(/\r?\n/);
    // An indented or `- ` first line is a block value, which starts on the line below the key, even as one line.
    const block = /^(?:[ \t]|-(?:[ \t]|$))/.test(lines[0]!) || (lines[0] === "" && lines.length > 1);
    return `${block ? lineBreak : " "}${lines.join(lineBreak)}`;
  }
  const items = value.split(",").map((item) => item.trim()).filter(Boolean);
  if (field.indent === undefined) return ` [${items.map((item) => encode(item, "", true)).join(", ")}]`;
  return items.map((item) => `${lineBreak}${field.indent}- ${encode(item, "")}`).join("");
}

const encodeKey = (key: string) => (/^[^\s#:'"\-?,[\]{}&*!|>%@`][^:#]*$/.test(key) && key.trim() === key ? key : JSON.stringify(key));

/** Marks the panel's own edits, which mustn't redraw the panel under the reader's typing. */
const fromPanel = Annotation.define<true>();

// Lucide "x".
const REMOVE_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';

let hints = 0;

/** The panel: a disclosure listing the properties, with Add property under them. */
class Properties {
  readonly element = document.createElement("details");
  readonly #list = document.createElement("div");
  readonly #add = Object.assign(document.createElement("button"), { type: "button", className: "sv-action", textContent: "Add property" });
  readonly #hint = Object.assign(document.createElement("p"), { id: `svartz-submissions-list-hint-${++hints}`, className: "sv-visually-hidden", textContent: "Separate items with commas." });
  #editable: boolean;
  /** The field last focused, which gets focus back when the editor redraws the panel's place. */
  #focused: HTMLElement | undefined;

  constructor(readonly view: EditorView) {
    this.#editable = view.state.facet(EditorView.editable);
    this.element.className = "svartz-submissions-properties";
    this.element.open = true;
    this.#list.className = "svartz-submissions-property-list";
    this.element.append(Object.assign(document.createElement("summary"), { textContent: "Properties" }), this.#hint, this.#list, this.#add);
    this.#add.addEventListener("click", () => this.#addRow());
    this.element.addEventListener("focusin", (event) => (this.#focused = event.target as HTMLElement));
    this.#render();
  }

  /** Focus what had it before the editor moved the panel, as it does once a note's first property starts its frontmatter. */
  refocus() {
    const focused = this.#focused;
    queueMicrotask(() => {
      if (focused?.isConnected && !this.element.contains(document.activeElement)) focused.focus();
    });
  }

  /** Redraw after an edit that wasn't the panel's own, such as an undo; follow the editor's lock. */
  update(update: ViewUpdate, editable: boolean) {
    const before = frontmatterEnd(update.startState.doc);
    const changed = update.docChanged && (before ? update.changes.touchesRange(0, before) : frontmatterEnd(update.state.doc) > 0);
    if (changed && !update.transactions.some((tr) => tr.annotation(fromPanel))) this.#render();
    if (editable !== this.#editable) this.#lock(editable);
  }

  #lock(editable: boolean) {
    this.#editable = editable;
    for (const field of this.element.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea")) field.readOnly = !editable;
    for (const button of this.element.querySelectorAll("button")) button.disabled = !editable;
  }

  /** Write `changes` to the frontmatter, as the panel's own edit. */
  #write(changes: ChangeSpec) {
    this.view.dispatch({ changes, annotations: fromPanel.of(true), userEvent: "input" });
  }

  #render() {
    const { doc } = this.view.state;
    this.#list.replaceChildren(...(readProperties(doc)?.properties ?? []).map((property, index) => this.#row(index, property.key, fieldOf(doc, property))));
    this.#lock(this.#editable);
  }

  /** A new property's row, written into the frontmatter once it has a name. */
  #addRow() {
    const row = this.#row(undefined, "", { kind: "text", text: "", quote: "" });
    this.#list.append(row);
    row.querySelector("input")!.focus();
  }

  /**
   * A property's row: its name, its value and a remove button. `index` is its place among the frontmatter's
   * properties, which the panel's own edits keep; a new row has none until it is named.
   */
  #row(index: number | undefined, key: string, field: Field): HTMLElement {
    const row = document.createElement("div");
    row.className = "svartz-submissions-property";
    const name = Object.assign(document.createElement("input"), { type: "text", value: key, autocomplete: "off", spellcheck: false });
    name.setAttribute("aria-label", "Property name");
    const multiline = field.kind === "yaml" && field.text.includes("\n");
    const value = multiline
      ? Object.assign(document.createElement("textarea"), { rows: Math.min(field.text.split("\n").length, 8) })
      : Object.assign(document.createElement("input"), { type: "text" });
    value.value = field.kind === "list" ? field.items.join(", ") : field.text;
    if (field.kind === "list") value.setAttribute("aria-describedby", this.#hint.id);
    const remove = Object.assign(document.createElement("button"), { type: "button", className: "sv-icon-button", innerHTML: REMOVE_ICON });
    const label = () => {
      const shown = name.value.trim() || "New property";
      value.setAttribute("aria-label", shown);
      remove.setAttribute("aria-label", `Remove ${shown}`);
    };
    label();

    const current = () => (index === undefined ? undefined : readProperties(this.view.state.doc)?.properties[index]);
    const rename = () => {
      const next = name.value.trim();
      const property = current();
      if (!next) {
        name.value = property?.key ?? "";
        return label();
      }
      label();
      if (property) {
        if (next !== property.key) this.#write({ from: property.from, to: property.keyEnd, insert: encodeKey(next) });
        return;
      }
      const { lineBreak, doc } = this.view.state;
      const line = `${encodeKey(next)}:${valueSource(field, value.value, lineBreak)}`;
      const read = readProperties(doc);
      index = read?.properties.length ?? 0;
      this.#write(read ? { from: read.close, insert: `${line}${lineBreak}` } : { from: 0, insert: `---${lineBreak}${line}${lineBreak}---${lineBreak}` });
    };
    name.addEventListener("input", label);
    name.addEventListener("change", rename);
    name.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      // Enter names the property; it mustn't send the panel's form.
      event.preventDefault();
      rename();
    });
    value.addEventListener("input", () => {
      const property = current();
      if (property) this.#write({ from: property.colon, to: property.to, insert: valueSource(field, value.value, this.view.state.lineBreak) });
    });
    value.addEventListener("keydown", (event) => {
      if (!multiline && event instanceof KeyboardEvent && event.key === "Enter") event.preventDefault();
    });
    remove.addEventListener("click", () => {
      const property = current();
      // Its lines and the line break after them. The rows after it move up a place, so the panel redraws.
      if (property) this.view.dispatch({ changes: { from: property.from, to: property.to + 1 }, userEvent: "delete" });
      else row.remove();
      this.#add.focus();
    });
    row.append(name, value, remove);
    return row;
  }
}

/** Each view's panel while Rich text shows. The editor may redraw the widget; the panel and its rows stay. */
const panels = new WeakMap<EditorView, Properties>();

/** The panel's place in the editor, scrolling with the note as its first block. */
class PropertiesWidget extends WidgetType {
  override eq() {
    return true;
  }

  toDOM(view: EditorView) {
    let panel = panels.get(view);
    if (panel) panel.refocus();
    else panels.set(view, (panel = new Properties(view)));
    return panel.element;
  }

  /** Its fields take their own keys and clicks. */
  override ignoreEvent() {
    return true;
  }
}

const widget = new PropertiesWidget();

function placePanel(doc: Text): DecorationSet {
  const end = frontmatterEnd(doc);
  return Decoration.set(end
    ? Decoration.replace({ widget, block: true }).range(0, end)
    : Decoration.widget({ widget, block: true, side: -1 }).range(0));
}

/** The frontmatter, shown as the properties panel; a note without any gets the panel above its first line. */
export const propertiesPanel = StateField.define<DecorationSet>({
  create: (state) => placePanel(state.doc),
  update: (value, tr) => (tr.docChanged ? placePanel(tr.state.doc) : value),
  provide: (field) => [EditorView.decorations.from(field), EditorView.atomicRanges.of((view) => view.state.field(field))],
});

/** Bring `view`'s panel up to date with `update`, and with whether the editor takes edits. */
export function updateProperties(update: ViewUpdate, editable: boolean) {
  panels.get(update.view)?.update(update, editable);
}

/** Forget `view`'s panel, as Rich text closes. */
export function closeProperties(view: EditorView) {
  panels.delete(view);
}
