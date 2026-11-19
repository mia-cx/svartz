/**
 * The page a reader sees once, on their first sign-in: choose a handle. Plain server-rendered HTML with a form that
 * posts back to itself, so it works before any script loads and outside the theme.
 */
import { HANDLE_MAX_LENGTH } from "./handle";
import { escape } from "./html";
import type { Identity } from "./providers";

// Script-free and self-contained: only inline styles, images from https, and a form posting to this origin.
const SECURITY_HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
  "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; img-src https:; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  "x-content-type-options": "nosniff",
  "referrer-policy": "same-origin",
};

const STYLE = `
:root { color-scheme: light dark; --bg: oklch(0.985 0 0); --fg: oklch(0.21 0.006 285.885); --muted: oklch(0.552 0.016 285.938);
  --line: oklch(0.92 0.004 286.32); --accent: oklch(0.21 0.006 285.885); --on-accent: oklch(0.985 0 0); --error: oklch(0.577 0.245 27.325); }
@media (prefers-color-scheme: dark) { :root { --bg: oklch(0.141 0.005 285.823); --fg: oklch(0.985 0 0); --muted: oklch(0.705 0.015 286.067);
  --line: oklch(0.274 0.006 286.033); --accent: oklch(0.985 0 0); --on-accent: oklch(0.21 0.006 285.885); --error: oklch(0.704 0.191 22.216); } }
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 16px; background: var(--bg); color: var(--fg);
  font: 16px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { width: 100%; max-width: 24rem; }
h1 { font-size: 1.5rem; line-height: 1.25; margin: 0 0 0.5rem; }
p { margin: 0 0 1.5rem; color: var(--muted); }
.who { display: flex; align-items: center; gap: 0.75rem; }
.who img { width: 2.5rem; height: 2.5rem; border-radius: 50%; }
label { display: block; font-weight: 600; margin-bottom: 0.375rem; }
.field { display: flex; align-items: center; border: 1px solid var(--line); border-radius: 0.5rem; padding: 0 0.75rem; }
.field:focus-within { outline: 2px solid var(--accent); outline-offset: 2px; }
.field:has([aria-invalid]) { border-color: var(--error); }
.field span { color: var(--muted); }
input { flex: 1; min-width: 0; border: 0; background: none; color: inherit; font: inherit; padding: 0.625rem 0.25rem; outline: none; }
.hint, .error { font-size: 0.875rem; margin: 0.375rem 0 0; }
.error { color: var(--error); }
.actions { display: flex; align-items: center; gap: 1rem; margin-top: 1.5rem; }
button { font: inherit; font-weight: 600; border: 0; border-radius: 0.5rem; padding: 0.625rem 1rem; min-height: 2.75rem;
  background: var(--accent); color: var(--on-accent); cursor: pointer; }
button:focus-visible, a:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
a { color: inherit; }
`;

function page(title: string, body: string, status: number): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title><style>${STYLE}</style></head><body><main>${body}</main></body></html>`;
  return new Response(html, { status, headers: SECURITY_HEADERS });
}

/** What the chooser shows: the site, who is signing in, the handle in the field and any problem with it. */
export interface Chooser {
  readonly siteTitle: string;
  readonly providerLabel: string;
  readonly identity: Identity;
  readonly handle: string;
  readonly error?: string;
  /** Where the form posts. */
  readonly action: string;
  /** Where Cancel goes: the page the reader signed in from. */
  readonly cancel: string;
}

/** The handle chooser; `status` is 422 when it comes back with an error. */
export function chooserPage({ siteTitle, providerLabel, identity, handle, error, action, cancel }: Chooser): Response {
  const avatar = identity.avatarUrl ? `<img src="${escape(identity.avatarUrl)}" alt="">` : "";
  const described = error ? "handle-error handle-hint" : "handle-hint";
  return page("Choose your handle", `
<h1>Choose your handle</h1>
<p class="who">${avatar}<span>Signing in to ${escape(siteTitle)} with ${escape(providerLabel)} as ${escape(identity.name)}.</span></p>
<form method="post" action="${escape(action)}">
  <label for="handle">Handle</label>
  <div class="field"><span aria-hidden="true">@</span><input id="handle" name="handle" value="${escape(handle)}" required
    maxlength="${HANDLE_MAX_LENGTH}" autocomplete="username" autocapitalize="none" spellcheck="false" autofocus
    aria-describedby="${described}"${error ? ' aria-invalid="true"' : ""}></div>
  ${error ? `<p class="error" id="handle-error" role="alert">${escape(error)}</p>` : ""}
  <p class="hint" id="handle-hint">Lowercase letters, numbers, hyphens and underscores. People find you by it.</p>
  <div class="actions"><button type="submit">Create account</button><a href="${escape(cancel)}">Cancel</a></div>
</form>`, error ? 422 : 200);
}

/** What a reader sees when the chooser outlived its sign-in, or was opened without one. */
export function expiredPage(home: string): Response {
  return page("Sign in again", `
<h1>Sign in again</h1>
<p>This sign-in expired before you chose a handle.</p>
<p><a href="${escape(home)}">Back to the site</a></p>`, 400);
}
