/**
 * The sign-in dialog. The `auth` plugin mounts this script on every page with the vault's {@link SignInConfig};
 * after that, any element with `data-svartz-sign-in` opens the dialog, and other plugins call {@link openSignIn}.
 */

export interface SignInProvider {
  readonly id: string;
  readonly label: string;
}

/** What the dialog needs from the vault's `auth` config. */
export interface SignInConfig {
  /** The auth routes' base path, such as `/notes/_svartz/auth`. */
  readonly endpoint: string;
  /** Enabled providers, in the order the dialog lists them. */
  readonly providers: readonly SignInProvider[];
  readonly privacyNotice?: string;
}

const TRIGGER = "[data-svartz-sign-in]";
const SVG_NS = "http://www.w3.org/2000/svg";

// Brand marks, 24×24, drawn in the link's text colour.
const PROVIDER_ICONS: Readonly<Record<string, string>> = {
  github: "M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12",
};

let config: SignInConfig | undefined;

function icon(paths: readonly string[], attributes: Record<string, string>): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  for (const [name, value] of Object.entries(attributes)) svg.setAttribute(name, value);
  for (const d of paths) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
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
  const close = element("button", "sv-auth-close", icon(["M18 6 6 18", "m6 6 12 12"], {
    fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round",
  }));
  close.type = "button";
  close.setAttribute("aria-label", "Close");

  const list = element("ul", "sv-auth-providers");
  for (const { id, label } of providers) {
    const link = element("a", "sv-auth-provider");
    const mark = PROVIDER_ICONS[id];
    if (mark) link.append(icon([mark], { fill: "currentColor" }));
    link.append(`Continue with ${label}`);
    link.href = `${endpoint}/start/${encodeURIComponent(id)}/?returnTo=${encodeURIComponent(returnTo)}`;
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
  const dialog = render(config, returnTo);
  dialog.addEventListener("close", () => {
    dialog.remove();
    opener?.focus();
  }, { once: true });
  document.body.append(dialog);
  dialog.showModal();
}

/** Browser script entry: remember the vault's config and open the dialog from `data-svartz-sign-in` elements. */
export function mount(_pathname: string, options: SignInConfig): () => void {
  config = options;
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
