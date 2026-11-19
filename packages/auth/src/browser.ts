/**
 * The sign-in dialog. The `auth` plugin mounts this script on every page with the vault's {@link SignInConfig};
 * after that, any element with `data-svartz-sign-in` opens the dialog, and other plugins call {@link openSignIn}.
 */
import type { BrowserScriptContext } from "@svartz/core";
import { PROVIDER_MARKS, type Mark } from "./marks";
import type { ProviderId } from "./providers";
import { REPUTATION_BADGE_CLASS, reputationBadgeParts, reputationLabel } from "./reputation-badge";

/** An account's reputation as a badge to follow its name, as `reputationBadgeHtml` renders it on the server. */
export function reputationBadge(score: number): HTMLSpanElement {
  const { hidden, shown, shortened } = reputationBadgeParts(score);
  let visible: Node | string = shown;
  if (shortened) {
    visible = element("span", "", shown);
    (visible as HTMLElement).setAttribute("aria-hidden", "true");
  }
  const badge = element("span", REPUTATION_BADGE_CLASS, element("span", `${REPUTATION_BADGE_CLASS}-label`, hidden), visible);
  badge.title = reputationLabel(score);
  return badge;
}

export interface SignInProvider {
  readonly id: ProviderId;
  readonly label: string;
}

/** What the dialog needs from the vault's `auth` config. */
export interface SignInConfig {
  /** The auth routes' path below the deployment base, such as `/notes/_svartz/auth`. */
  readonly endpoint: string;
  /** This vault's mount path below the deployment base, where its account page and dashboard live. */
  readonly mountPath: string;
  /** Enabled providers, in the order the dialog lists them. */
  readonly providers: readonly SignInProvider[];
  readonly privacyNotice?: string;
  /** The folder of user pages, below the deployment base, such as `/notes/users/`; only on the vault that holds them. */
  readonly userPages?: string;
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
 * Who the site's links name: the signed-in handle, and whether the dashboard has a panel for them. A suspended account
 * gets the account link alone, to the page that says why.
 */
type Viewer = { readonly handle: string; readonly dashboard: boolean } | { readonly suspended: true; readonly dashboard?: undefined } | null;

/** Asked once per document: signing in or out loads a new one. */
const viewers = new Map<string, Promise<Viewer>>();

// Lucide "circle-user-round" and "layout-dashboard", as the theme's other actions draw their icons.
const ACCOUNT_ICON: Mark = {
  paths: ["M18 20a6 6 0 0 0-12 0", "M14 10a2 2 0 1 1-4 0 2 2 0 0 1 4 0", "M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0"],
  attributes: { fill: "none", stroke: "currentColor", "stroke-linecap": "round", "stroke-linejoin": "round" },
};
const DASHBOARD_ICON: Mark = {
  paths: ["M3 4a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z", "M14 4a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1z", "M14 13a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1z", "M3 17a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"],
  attributes: { fill: "none", stroke: "currentColor", "stroke-linecap": "round", "stroke-linejoin": "round" },
};

/**
 * Link a signed-in reader to their account page, and to the dashboard when it has a panel for them, in the site
 * actions. Answers what removes them.
 */
function showViewerLinks(home: string): () => void {
  const links: HTMLAnchorElement[] = [];
  let gone = false;
  const url = `${home}/_svartz/auth/viewer/`;
  let viewer = viewers.get(url);
  if (!viewer) {
    viewer = fetch(url, { headers: { accept: "application/json" } })
      .then((response) => response.ok ? response.json() as Promise<Viewer> : null);
    viewers.set(url, viewer);
    // A failed request is asked again on the next page.
    viewer.catch(() => viewers.delete(url));
  }
  viewer.then((answer) => {
    const region = document.querySelector('[data-svartz-region="site-actions"]');
    if (gone || !answer || !region) return;
    const link = (path: string, mark: Mark, label: string) => {
      const anchor = element("a", "");
      anchor.href = `${home}/-/${path}/`;
      anchor.append(icon(mark), label);
      links.push(anchor);
      region.append(anchor);
    };
    link("account", ACCOUNT_ICON, "Account");
    if (answer.dashboard) link("dashboard", DASHBOARD_ICON, "Dashboard");
  }).catch((cause: unknown) => console.error("[svartz:auth] couldn't tell who is signed in", cause));
  return () => {
    gone = true;
    for (const link of links) link.remove();
  };
}

type Standing = { readonly score: number; readonly next?: { readonly role: string; readonly score: number } } | null;

const points = new Intl.NumberFormat("en", { maximumFractionDigits: 2 });
const pointsText = (score: number) => `${points.format(score)} ${score === 1 ? "point" : "points"}`;

/**
 * On a user page, show its owner's reputation in the page actions, and to the owner their next threshold. Answers
 * what removes it.
 */
function showReputation(home: string, page: string): () => void {
  let shown: HTMLElement | undefined;
  let gone = false;
  fetch(`${home}/_svartz/auth/reputation/?page=${encodeURIComponent(page)}`, { headers: { accept: "application/json" } })
    .then((response) => response.ok ? response.json() as Promise<Standing> : null)
    .then((standing) => {
      const region = document.querySelector('[data-svartz-region="page-actions"]');
      if (gone || !standing || !region) return;
      const next = standing.next ? ` · ${pointsText(standing.next.score)} for ${standing.next.role}` : "";
      shown = element("span", "sv-reputation", `Reputation: ${pointsText(standing.score)}${next}`);
      region.append(shown);
    })
    .catch((cause: unknown) => console.error("[svartz:auth] couldn't read this page's reputation", cause));
  return () => {
    gone = true;
    shown?.remove();
  };
}

/**
 * Browser script entry: remember the vault's config, open the dialog from `data-svartz-sign-in` elements, and link a
 * signed-in reader to their account and the dashboard. The build doesn't know a host app's `paths.base`, so the routes
 * get the deployment base here, from `context`.
 */
export function mount(pathname: string, options: SignInConfig, { base }: BrowserScriptContext = { base: "" }): () => void {
  config = { ...options, endpoint: `${base}${options.endpoint}` };
  const onClick = (event: MouseEvent) => {
    if (!(event.target instanceof Element) || !event.target.closest(TRIGGER)) return;
    event.preventDefault();
    openSignIn();
  };
  document.addEventListener("click", onClick);
  const hideViewerLinks = showViewerLinks(`${base}${options.mountPath}`);
  // Only pages in the user page folder can be one; the server decides which are.
  const page = pathname.slice(base.length);
  const hideReputation = options.userPages && page.startsWith(options.userPages) && page !== options.userPages
    ? showReputation(`${base}${options.mountPath}`, page)
    : () => {};
  return () => {
    hideViewerLinks();
    hideReputation();
    document.removeEventListener("click", onClick);
    // The dialog lives on <body>, outside the page, so client-side navigation alone would leave it open
    // over the next page with this page's returnTo. Removing it (rather than close()) skips the focus
    // hand-back, which would land on the previous page's opener.
    document.querySelector("dialog.sv-auth")?.remove();
  };
}
