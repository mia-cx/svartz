/**
 * Wikilink autocomplete: typing `[[` suggests the site's published notes, and picking one inserts a link that
 * resolves. The notes come from the plugin's `links/` answer, which the build derives from the index; password-protected
 * and hidden notes are never in it.
 */
import { autocompletion, type Completion, type CompletionSource } from "@codemirror/autocomplete";
import type { Extension } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import type { LinksResponse } from "./api";

/** An open `[[` or `![[` and what follows it on the line, up to a heading or label. */
const OPEN_LINK = /!?\[\[[^\]|#\n]*$/;

/** One load of each endpoint's links, shared by every panel; a failed load is retried by the next caller. */
const loads = new Map<string, Promise<LinksResponse | undefined>>();

/**
 * The site's published notes, which `[[` suggests and the Split preview links to, with how the vault resolves links;
 * `undefined` when they couldn't load.
 */
export function loadLinks(endpoint: string): Promise<LinksResponse | undefined> {
  let load = loads.get(endpoint);
  if (!load) {
    load = fetch(`${endpoint}/links/`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`the site answered ${response.status}`);
        return await response.json() as LinksResponse;
      })
      .catch((cause: unknown) => {
        loads.delete(endpoint);
        // The editor works without them; the console says why links don't resolve.
        console.error("[submissions] couldn't load the site's notes", cause);
        return undefined;
      });
    loads.set(endpoint, load);
  }
  return load;
}

/**
 * The rest of a link's target after the cursor, then whatever closes it on the line: a heading or label, then `]]`.
 * A `[[` ends the scan, so a later link's `]]` never closes this one; a label may still hold a single `[`.
 */
const LINK_REST = /^([^[\]|#\n]*)((?:[|#](?:(?!\[\[)[^\]\n])*)?\]\])?/;

/**
 * Insert `link` in place of the target. In a closed link, that is the whole target, and the cursor lands after the
 * link, or after the target when a heading or label follows. Otherwise the link ends at the cursor and gets its `]]`.
 */
function insertLink(link: string) {
  return (view: EditorView, _completion: Completion, from: number, to: number) => {
    const [, rest = "", close] = LINK_REST.exec(view.state.sliceDoc(to, view.state.doc.lineAt(to).to))!;
    const changes = close ? { from, to: to + rest.length, insert: link } : { from, to, insert: `${link}]]` };
    const anchor = from + changes.insert.length + (close === "]]" ? 2 : 0);
    view.dispatch({ changes, selection: { anchor }, userEvent: "input.complete" });
  };
}

function wikilinkSource(endpoint: string): CompletionSource {
  return async (context) => {
    const match = context.matchBefore(OPEN_LINK);
    if (!match) return null;
    const from = match.from + match.text.indexOf("[[") + 2;
    const targets = (await loadLinks(endpoint))?.notes ?? [];
    if (context.aborted) return null;
    return {
      from,
      options: targets.map(({ link, title }) => ({
        label: link,
        ...(title !== link.slice(link.lastIndexOf("/") + 1) ? { detail: title } : {}),
        apply: insertLink(link),
      })),
      validFor: /^[^\]|#\n]*$/,
    };
  };
}

/** Suggest `endpoint`'s published notes after `[[`. */
export function wikilinkCompletion(endpoint: string): Extension {
  return autocompletion({ override: [wikilinkSource(endpoint)], icons: false });
}
