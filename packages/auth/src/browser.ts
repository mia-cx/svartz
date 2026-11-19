/**
 * The sign-in dialog. The `auth` plugin mounts this script on every page with the vault's {@link SignInConfig};
 * after that, any element with `data-svartz-sign-in` opens the dialog, and other plugins call {@link openSignIn}.
 */
import type { BrowserScriptContext } from "@svartz/core";
import { PROVIDER_MARKS, type Mark } from "./marks";
import type { ProviderId } from "./providers";

export interface SignInProvider {
  readonly id: ProviderId;
  readonly label: string;
}

/** What the dialog needs from the vault's `auth` config. */
export interface SignInConfig {
  /** The auth routes' path below the deployment base, such as `/notes/_svartz/auth`. */
  readonly endpoint: string;
  /** Enabled providers, in the order the dialog lists them. */
  readonly providers: readonly SignInProvider[];
  readonly privacyNotice?: string;
}

const TRIGGER = "[data-svartz-sign-in]";
const SVG_NS = "http://www.w3.org/2000/svg";

let config: SignInConfig | undefined;

function icon({ paths, attributes }: Mark): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  for (const [name, value] of Object.entries(attributes)) svg.setAttribute(name, value);
  for (const entry of paths) {
    const { d, fill } = typeof entry === "string" ? { d: entry, fill: undefined } : entry;
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    if (fill) path.setAttribute("fill", fill);
    svg.append(path);
  }
  return svg;
}

function element<Tag extends keyof HTMLElementTagNameMap>(
  tag: Tag,
  className: string,
  ...children: (Node | string)[]
): HTMLElementTagNameMap[Tag] {
  const node = document.createElement(tag);
  node.className = className;
  node.append(...children);
  return node;
}

function render({ endpoint, providers, privacyNotice }: SignInConfig, returnTo: string): HTMLDialogElement {
  const title = element("h2", "sv-auth-title", "Sign in");
  title.id = "sv-auth-title";
  const close = element("button", "sv-auth-close", icon({
    paths: ["M18 6 6 18", "m6 6 12 12"],
    attributes: { fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round" },
  }));
  close.type = "button";
  close.setAttribute("aria-label", "Close");

  const list = element("ul", "sv-auth-providers");
  for (const { id, label } of providers) {
    const link = element("a", "sv-auth-provider");
    link.append(icon(PROVIDER_MARKS[id]), `Continue with ${label}`);
    link.href = `${endpoint}/start/${encodeURIComponent(id)}/?returnTo=${encodeURIComponent(returnTo)}`;
    // SvelteKit's router handles clicks anywhere in the document; sign-in has to reach the server.
    link.setAttribute("data-sveltekit-reload", "");
    list.append(element("li", "", link));
  }
  // Land on the first provider rather than Close, the first control in the dialog.
  list.querySelector("a")?.setAttribute("autofocus", "");

  const body = element("div", "sv-auth-body", element("div", "sv-auth-head", title, close), list);
  if (privacyNotice) {
    const notice = element("a", "", "Privacy notice");
    notice.href = privacyNotice;
    body.append(element("p", "sv-auth-privacy", notice));
  }

  const dialog = element("dialog", "sv-auth", body);
  dialog.setAttribute("aria-labelledby", title.id);
  close.addEventListener("click", () => dialog.close());
  // The body fills the dialog, so a click landing on the dialog itself came through the backdrop.
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  return dialog;
}

/**
 * Open the sign-in dialog. Each provider starts sign-in and comes back to `returnTo`, by default this page.
 * Throws until the `auth` plugin's script has mounted, which happens on every page of a vault that enables it.
 */
export function openSignIn(returnTo = `${location.pathname}${location.search}${location.hash}`): void {
  if (!config) throw new Error("[svartz:auth] enable the auth plugin on this vault to open the sign-in dialog");
  if (document.querySelector("dialog.sv-auth[open]")) return;
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
  // Opening a modal hides every auto popover, such as a card the opener sits in. They reopen, outermost first, when
  // the dialog closes, so focus goes back to a control the reader can see.
  const popovers: HTMLElement[] = [];
  for (let node = opener?.closest<HTMLElement>(":popover-open"); node; node = node.parentElement?.closest<HTMLElement>(":popover-open")) {
    popovers.unshift(node);
  }
  const dialog = render(config, returnTo);
  dialog.addEventListener("close", () => {
    dialog.remove();
    for (const popover of popovers) if (popover.isConnected && !popover.matches(":popover-open")) popover.showPopover();
    opener?.focus();
  }, { once: true });
  document.body.append(dialog);
  dialog.showModal();
}

/**
 * Browser script entry: remember the vault's config and open the dialog from `data-svartz-sign-in` elements.
 * The build doesn't know a host app's `paths.base`, so the routes get the deployment base here, from `context`.
 */
export function mount(_pathname: string, options: SignInConfig, { base }: BrowserScriptContext = { base: "" }): () => void {
  config = { ...options, endpoint: `${base}${options.endpoint}` };
  const onClick = (event: MouseEvent) => {
    if (!(event.target instanceof Element) || !event.target.closest(TRIGGER)) return;
    event.preventDefault();
    openSignIn();
  };
  document.addEventListener("click", onClick);
  return () => {
    document.removeEventListener("click", onClick);
    // The dialog lives on <body>, outside the page, so client-side navigation alone would leave it open
    // over the next page with this page's returnTo. Removing it (rather than close()) skips the focus
    // hand-back, which would land on the previous page's opener.
    document.querySelector("dialog.sv-auth")?.remove();
  };
}
