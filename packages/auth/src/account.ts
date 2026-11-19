/**
 * The `/-/account/` plugin page: the body the theme's shell renders. Plain HTML forms post to the `auth` plugin's
 * `account/` routes, which redirect back here with `?status=<code>`, so the page works before any script loads.
 */
import type { PluginPage } from "@svartz/core";
import { HANDLE_MAX_LENGTH, HANDLE_PROBLEM } from "./handle";
import { escape } from "./html";
import { markSvg } from "./marks";
import { isProviderId, PROVIDERS, type ProviderId } from "./providers";
import type { Standing } from "./reputation";
import { standingSection } from "./reputation-page";
import type { Account } from "./session";
import type { LinkedIdentity, SessionSummary } from "./store";

/** The longest display name an account may set. */
export const NAME_MAX_LENGTH = 100;

const TITLE = "Account";

type Section = "profile" | "sign-ins";

/** What a `status` code tells the reader after a form comes back. `provider` and `handle` come from the same query. */
const STATUSES: Readonly<Record<string, { section: Section; error: boolean; text: (provider: string, handle: string) => string }>> = {
  saved: { section: "profile", error: false, text: () => "Profile saved." },
  "handle-taken": { section: "profile", error: true, text: (_, handle) => `@${handle} is taken. Choose another handle.` },
  "handle-invalid": { section: "profile", error: true, text: () => HANDLE_PROBLEM },
  "name-invalid": { section: "profile", error: true, text: () => `Enter a display name of up to ${NAME_MAX_LENGTH} characters.` },
  linked: { section: "sign-ins", error: false, text: (provider) => `${provider} is linked.` },
  "linked-elsewhere": {
    section: "sign-ins", error: true,
    text: (provider) => `That ${provider} account belongs to another account here. Sign in with it and unlink it there first.`,
  },
  "link-expired": { section: "sign-ins", error: true, text: () => "Linking didn't finish. Try again." },
  "link-failed": { section: "sign-ins", error: true, text: (provider) => `${provider} didn't confirm the link. Try again.` },
  unlinked: { section: "sign-ins", error: false, text: (provider) => `${provider} is unlinked.` },
  "unlink-last": { section: "sign-ins", error: true, text: () => "Link another sign-in method before unlinking your last one." },
  "unlink-current": { section: "sign-ins", error: true, text: () => "You're signed in with this one. Sign in another way to unlink it." },
};

/** The query a form's redirect carries back to the page. */
export type StatusCode = keyof typeof STATUSES;

const date = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" });
const when = (iso: string) => `<time datetime="${escape(iso)}">${escape(date.format(new Date(iso)))}</time>`;

/** The page for a reader who isn't signed in: one link per provider, each returning here. */
export function signedOutPage(providers: readonly ProviderId[], start: (provider: ProviderId) => string): PluginPage {
  const links = providers.map((provider) => `<li><a class="sv-auth-provider" href="${escape(start(provider))}" data-sveltekit-reload>${markSvg(provider)}Continue with ${escape(PROVIDERS[provider].label)}</a></li>`);
  return {
    title: TITLE,
    html: `<div class="sv-account">
<h1>${TITLE}</h1>
<p class="sv-account-lead">Sign in to manage your account.</p>
<ul class="sv-auth-providers sv-account-providers">${links.join("")}</ul>
</div>`,
  };
}

/** Everything the signed-in page shows, and where its forms post. */
export interface AccountView {
  readonly account: Account;
  /** The account's reputation score and next threshold. */
  readonly standing: Standing;
  readonly identities: readonly LinkedIdentity[];
  readonly sessions: readonly SessionSummary[];
  /** The session this browser reads through. */
  readonly session: string;
  /**
   * The account's user page in this vault: its URL, or the vault path (`<folder>/<handle>`, without `.md`) a page that
   * doesn't exist yet would have. `undefined` for a hidden page, which gets no link.
   */
  readonly userPage?: { readonly href: string } | { readonly missing: string };
  /** The providers the site offers, in config order. */
  readonly providers: readonly ProviderId[];
  readonly actions: {
    readonly profile: string;
    readonly unlink: string;
    readonly signOutEverywhere: string;
    readonly link: (provider: ProviderId) => string;
  };
  /** The page's query: `status`, and the `provider`, `name` and `handle` it concerns. */
  readonly query: URLSearchParams;
}

function message(section: Section, query: URLSearchParams): { html: string; id: string; error: boolean } | undefined {
  const status = STATUSES[query.get("status") ?? ""];
  if (status?.section !== section) return undefined;
  const provider = query.get("provider") ?? "";
  const label = isProviderId(provider) ? PROVIDERS[provider].label : "The provider";
  const id = `sv-account-${section}-status`;
  const role = status.error ? "alert" : "status";
  const text = status.text(label, query.get("handle") ?? "");
  return { id, error: status.error, html: `<p class="sv-account-status" id="${id}" role="${role}"${status.error ? " data-error" : ""}>${escape(text)}</p>` };
}

function profileSection({ account, actions, query }: AccountView): string {
  const status = message("profile", query);
  // A refused save comes back with what the reader typed, so they can fix it rather than retype it.
  const name = status?.error ? query.get("name") ?? account.name : account.name;
  const handle = status?.error ? query.get("handle") ?? account.handle : account.handle;
  const code = query.get("status");
  const nameInvalid = status?.error && code === "name-invalid";
  const handleInvalid = status?.error && code !== "name-invalid";
  const describe = (invalid: boolean | undefined, hint?: string) => {
    const ids = [invalid ? status!.id : undefined, hint].filter(Boolean).join(" ");
    return `${ids ? ` aria-describedby="${ids}"` : ""}${invalid ? ' aria-invalid="true"' : ""}`;
  };
  return `<section class="sv-account-section" aria-labelledby="sv-account-profile">
<h2 id="sv-account-profile">Profile</h2>
${status?.html ?? ""}
<form class="sv-account-form" method="post" action="${escape(actions.profile)}">
  <div class="sv-account-field">
    <label for="sv-account-name">Display name</label>
    <input class="sv-account-input" id="sv-account-name" name="name" value="${escape(name)}" required maxlength="${NAME_MAX_LENGTH}" autocomplete="nickname"${describe(nameInvalid)}>
  </div>
  <div class="sv-account-field">
    <label for="sv-account-handle">Handle</label>
    <div class="sv-account-input sv-account-handle"><span aria-hidden="true">@</span><input id="sv-account-handle" name="handle" value="${escape(handle)}" required maxlength="${HANDLE_MAX_LENGTH}" autocomplete="username" autocapitalize="none" spellcheck="false"${describe(handleInvalid, "sv-account-handle-hint")}></div>
    <p class="sv-account-hint" id="sv-account-handle-hint">Lowercase letters, numbers, hyphens and underscores. Links to your old handle keep working.</p>
  </div>
  <div><button class="sv-account-button" data-primary type="submit">Save profile</button></div>
</form>
</section>`;
}

function signInsSection({ account, identities, providers, actions, query }: AccountView): string {
  const rows = identities.map((identity) => {
    const label = PROVIDERS[identity.provider].label;
    const detail = identity.handle ? `@${identity.handle}` : identity.name;
    const control = identity.id === account.identity.id
      ? `<span class="sv-account-tag">Current sign-in</span>`
      : identities.length > 1
        ? `<form method="post" action="${escape(actions.unlink)}"><input type="hidden" name="identity" value="${escape(identity.id)}"><button class="sv-account-button" type="submit" aria-label="Unlink ${escape(label)} ${escape(detail)}">Unlink</button></form>`
        : "";
    return `<li class="sv-account-row">${markSvg(identity.provider)}<span class="sv-account-what"><span class="sv-account-name">${escape(label)}</span><span class="sv-account-muted">${escape(detail)}</span></span>${control}</li>`;
  });
  const linked = new Set(identities.map(({ provider }) => provider));
  const links = providers.filter((provider) => !linked.has(provider)).map((provider) =>
    `<li><form method="post" action="${escape(actions.link(provider))}"><button class="sv-auth-provider" type="submit">${markSvg(provider)}Link ${escape(PROVIDERS[provider].label)}</button></form></li>`);
  return `<section class="sv-account-section" aria-labelledby="sv-account-sign-ins">
<h2 id="sv-account-sign-ins">Sign-in methods</h2>
${message("sign-ins", query)?.html ?? ""}
<ul class="sv-account-list">${rows.join("")}</ul>
${links.length ? `<ul class="sv-auth-providers sv-account-providers" aria-label="Link another sign-in method">${links.join("")}</ul>` : ""}
</section>`;
}

function sessionsSection({ sessions, session, actions }: AccountView): string {
  const rows = sessions.map(({ id, provider, createdAt }) =>
    `<li class="sv-account-row">${markSvg(provider)}<span class="sv-account-what"><span class="sv-account-name">${escape(PROVIDERS[provider].label)}</span><span class="sv-account-muted">Signed in ${when(createdAt)}</span></span>${id === session ? `<span class="sv-account-tag">This browser</span>` : ""}</li>`);
  return `<section class="sv-account-section" aria-labelledby="sv-account-sessions">
<h2 id="sv-account-sessions">Sessions</h2>
<ul class="sv-account-list">${rows.join("")}</ul>
<form method="post" action="${escape(actions.signOutEverywhere)}"><button class="sv-account-button" type="submit">Sign out everywhere</button></form>
</section>`;
}

/**
 * A link to the account's user page; or, while it has none, an empty region that a plugin able to create pages fills
 * with the action that starts it, so the page offers nothing where no plugin can.
 */
function userPageLink({ userPage }: AccountView): string {
  if (!userPage) return "";
  if ("href" in userPage) return `<a class="sv-account-button sv-account-page" href="${escape(userPage.href)}">Your page</a>`;
  return `<div class="sv-account-page" data-svartz-region="user-page-actions" data-svartz-user-page="${escape(userPage.missing)}"></div>`;
}

/** The signed-in page: reputation, profile, linked sign-in methods and sessions. */
export function accountPage(view: AccountView): PluginPage {
  const { account } = view;
  const avatar = account.avatarUrl ? `<img class="sv-account-avatar" src="${escape(account.avatarUrl)}" alt="" width="48" height="48">` : "";
  return {
    title: TITLE,
    html: `<div class="sv-account">
<h1>${TITLE}</h1>
<div class="sv-account-who">${avatar}<p><span class="sv-account-name">${escape(account.name)}</span> <span class="sv-account-muted">@${escape(account.handle)}</span></p>${userPageLink(view)}</div>
${standingSection(view.standing)}
${profileSection(view)}
${signInsSection(view)}
${sessionsSection(view)}
</div>`,
  };
}
