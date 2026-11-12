/**
 * The sign-in dialog. The `auth` plugin mounts this script on every page with the vault's {@link SignInConfig};
 * after that, any element with `data-svartz-sign-in` opens the dialog, and other plugins call {@link openSignIn}.
 */
import type { ProviderId } from "./providers";

export interface SignInProvider {
  readonly id: ProviderId;
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

/** An SVG path, filled from the `<svg>` unless it carries its own colour. */
type Path = string | { readonly d: string; readonly fill: string };
interface Mark {
  readonly paths: readonly Path[];
  /** `<svg>` attributes, such as `fill`, or a `viewBox` other than 24×24. */
  readonly attributes: Readonly<Record<string, string>>;
}

// Each brand's official mark, in the colours its guidelines allow.
const PROVIDER_MARKS: Readonly<Record<ProviderId, Mark>> = {
  // Monochrome, in the link's text colour.
  github: { attributes: { fill: "currentColor" }, paths: ["M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"] },
  // The four-colour "G" from Google's sign-in button, which its branding guidelines require.
  google: {
    attributes: { viewBox: "0 0 48 48" },
    paths: [
      { fill: "#EA4335", d: "M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" },
      { fill: "#4285F4", d: "M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" },
      { fill: "#FBBC05", d: "M10.53 28.59c-.5-1.45-.78-2.99-.78-4.59s.27-3.14.78-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" },
      { fill: "#34A853", d: "M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" },
    ],
  },
  // The Discord symbol in Blurple.
  discord: { attributes: { fill: "#5865F2" }, paths: ["M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"] },
  // The X logo from X's brand toolkit, monochrome in the link's text colour.
  x: {
    attributes: { fill: "currentColor", viewBox: "0 0 1200 1227" },
    paths: ["M714.163 519.284L1160.89 0H1055.03L667.137 450.887L357.328 0H0L468.492 681.821L0 1226.37H105.866L515.491 750.218L842.672 1226.37H1200L714.137 519.284H714.163ZM569.165 687.828L521.697 619.934L144.011 79.6944H306.615L611.412 515.685L658.88 583.579L1055.08 1150.3H892.476L569.165 687.854V687.828Z"],
  },
};

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
