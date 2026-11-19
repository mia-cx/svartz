/**
 * The Reputation and Kudos panels, rendered at `/-/dashboard/auth/reputation/` and `/-/dashboard/auth/kudos/`, and the
 * Reputation section of `/-/account/`. Plain HTML forms post to the `auth` plugin's `reputation/` routes, which
 * redirect back with `?status=<code>`.
 */
import type { PluginPage } from "@svartz/core";
import { HANDLE_MAX_LENGTH } from "./handle";
import { escape } from "./html";
import { DAILY_LIMIT, THRESHOLD_MAX, WEIGHTS, type ReputationSettings, type Standing, type Threshold, type Weight } from "./reputation";

export const REPUTATION_TITLE = "Reputation";
export const KUDOS_TITLE = "Kudos";

/** The longest kudos reason. */
export const REASON_MAX_LENGTH = 200;

const number = new Intl.NumberFormat("en", { maximumFractionDigits: 2 });
/** `12.5 points`, `1 point`. */
export const pointsText = (points: number) => `${number.format(points)} ${points === 1 ? "point" : "points"}`;

type Section = "points" | "thresholds" | "kudos";

/**
 * What a form's `status` tells the reader; `who` is the handle or role the form named. `field` is the field it refused;
 * `points-invalid` names it in the query's `invalid`.
 */
const STATUSES: Readonly<Record<string, { section: Section; error: boolean; field?: string; text: (who: string, query: URLSearchParams) => string }>> = {
  "points-saved": { section: "points", error: false, text: () => "Points saved." },
  "points-invalid": {
    section: "points", error: true,
    text: (_, query) => {
      const setting = SETTINGS.find(({ field }) => field === query.get("invalid"));
      return setting ? `Enter ${setting.label} as a number from ${number.format(setting.bounds.min)} to ${number.format(setting.bounds.max)}.` : "Enter every value as a number.";
    },
  },
  "threshold-saved": { section: "thresholds", error: false, text: (role) => `Threshold saved for ${role}.` },
  "threshold-removed": { section: "thresholds", error: false, text: (role) => `Removed the threshold for ${role}.` },
  "threshold-invalid": { section: "thresholds", error: true, field: "score", text: () => `Enter a score above 0 and up to ${number.format(THRESHOLD_MAX)}.` },
  "role-unknown": { section: "thresholds", error: true, field: "role", text: () => "Choose a role from the list." },
  "kudos-given": { section: "kudos", error: false, text: (who) => `Gave @${who} kudos.` },
  "kudos-already": { section: "kudos", error: true, field: "handle", text: (who) => `You already gave @${who} kudos today.` },
  "kudos-limit": { section: "kudos", error: true, text: () => "You've given all your kudos for today." },
  "kudos-self": { section: "kudos", error: true, field: "handle", text: () => "Give kudos to someone else." },
  "account-unknown": { section: "kudos", error: true, field: "handle", text: (who) => `No account has the handle @${who}.` },
  "reason-invalid": { section: "kudos", error: true, field: "reason", text: () => `Say why, in up to ${REASON_MAX_LENGTH} characters.` },
};

/** The `status` codes a `reputation/` route answers with. */
export type ReputationStatus = keyof typeof STATUSES;

function message(section: Section, query: URLSearchParams): { html: string; id: string; error: boolean; field?: string } | undefined {
  const status = STATUSES[query.get("status") ?? ""];
  if (status?.section !== section) return undefined;
  const id = `sv-reputation-${section}-status`;
  const text = status.text(query.get("handle") ?? query.get("role") ?? "", query);
  return {
    id,
    error: status.error,
    field: status.error ? status.field ?? query.get("invalid") ?? undefined : undefined,
    html: `<p class="sv-account-status" id="${id}" role="${status.error ? "alert" : "status"}"${status.error ? " data-error" : ""}>${escape(text)}</p>`,
  };
}

type Message = ReturnType<typeof message>;

/** `aria-invalid` and `aria-describedby` for a field, when the form came back refused for it. */
const described = (status: Message, field: string, hint?: string) => {
  const ids = [status?.field === field ? status.id : undefined, hint].filter(Boolean).join(" ");
  return `${ids ? ` aria-describedby="${ids}"` : ""}${status?.field === field ? ' aria-invalid="true"' : ""}`;
};

/** Each weight's label and hint, in the order the panel lists them. */
const SETTINGS: ReadonlyArray<{ name: Weight | "dailyLimit"; field: string; label: string; hint: string; bounds: { min: number; max: number } }> = [
  { name: "edit", field: "edit", label: "Merged edit", hint: "Times 1 + log2 of the lines it changes.", bounds: WEIGHTS.edit },
  { name: "page", field: "page", label: "Merged new page", hint: "Instead of the edit's points.", bounds: WEIGHTS.page },
  { name: "agreement", field: "agreement", label: "+1 on a comment", hint: "For the comment's author.", bounds: WEIGHTS.agreement },
  { name: "kudos", field: "kudos", label: "Kudos", hint: "From a moderator.", bounds: WEIGHTS.kudos },
  { name: "declined", field: "declined", label: "Declined pull request", hint: "0 or less.", bounds: WEIGHTS.declined },
  {
    name: "dailyLimit", field: "daily-limit", label: "Daily limit",
    hint: "The most points an account earns a day from edits, new pages and +1s.", bounds: DAILY_LIMIT,
  },
];

/** The form field each setting posts as, for the route. */
export const SETTING_FIELDS: ReadonlyArray<{ readonly name: Weight | "dailyLimit"; readonly field: string; readonly bounds: { readonly min: number; readonly max: number } }> = SETTINGS;

/** Everything the Reputation panel shows, and where its forms post. */
export interface ReputationView {
  /** Whether the viewer may change the points and thresholds; without it the panel only lists them. */
  readonly canWrite: boolean;
  readonly settings: ReputationSettings;
  readonly thresholds: readonly Threshold[];
  /** Stored roles, which a threshold may give. */
  readonly roles: readonly string[];
  readonly query: URLSearchParams;
  readonly actions: { readonly points: string; readonly threshold: string; readonly removeThreshold: string };
}

const option = (value: string, selected: string | null) => `<option value="${escape(value)}"${value === selected ? " selected" : ""}>${escape(value)}</option>`;

function pointsSection({ canWrite, settings, query, actions }: ReputationView): string {
  const status = message("points", query);
  // A refused save comes back with what the admin typed, so they can fix it rather than retype it.
  const refused = status?.error === true;
  if (!canWrite) {
    const rows = SETTINGS.map(({ name, label, hint }) =>
      `<li class="sv-account-row"><span class="sv-account-what"><span class="sv-account-name">${escape(label)}</span><span class="sv-account-muted">${escape(hint)}</span></span><span class="sv-account-tag">${escape(number.format(settings[name]))}</span></li>`);
    return `<section class="sv-account-section" aria-labelledby="sv-reputation-points">
<h2 id="sv-reputation-points">Points</h2>
<ul class="sv-account-list">${rows.join("")}</ul>
</section>`;
  }
  const fields = SETTINGS.map(({ name, field, label, hint, bounds }) => {
    const id = `sv-reputation-${field}`;
    const value = refused ? query.get(field) ?? "" : String(settings[name]);
    return `<div class="sv-account-field">
    <label for="${id}">${escape(label)}</label>
    <input class="sv-account-input" id="${id}" name="${field}" type="number" inputmode="decimal" step="any" min="${bounds.min}" max="${bounds.max}" value="${escape(value)}" required${described(status, field, `${id}-hint`)}>
    <p class="sv-account-hint" id="${id}-hint">${escape(hint)} From ${number.format(bounds.min)} to ${number.format(bounds.max)}.</p>
  </div>`;
  });
  return `<section class="sv-account-section" aria-labelledby="sv-reputation-points">
<h2 id="sv-reputation-points">Points</h2>
${status?.html ?? ""}
<form class="sv-account-form sv-dashboard-grid" method="post" action="${escape(actions.points)}">
  ${fields.join("\n  ")}
  <div class="sv-dashboard-submit"><button class="sv-account-button" data-primary type="submit">Save points</button></div>
</form>
</section>`;
}

function thresholdsSection({ canWrite, thresholds, roles, query, actions }: ReputationView): string {
  const status = message("thresholds", query);
  const typed = (key: string) => (status?.error ? query.get(key) : null);
  const rows = thresholds.map(({ role, score }) => {
    const remove = canWrite
      ? `<form method="post" action="${escape(actions.removeThreshold)}"><input type="hidden" name="role" value="${escape(role)}"><button class="sv-account-button" type="submit" aria-label="Remove the threshold for ${escape(role)}">Remove</button></form>`
      : "";
    return `<li class="sv-account-row"><span class="sv-account-what"><span class="sv-account-name">${escape(role)}</span><span class="sv-account-muted">At ${escape(pointsText(score))}</span></span>${remove}</li>`;
  });
  const form = !canWrite ? "" : roles.length === 0
    ? `<p class="sv-account-muted">Create a role under People &amp; permissions to give it a threshold.</p>`
    : `<form class="sv-account-form sv-dashboard-grid" method="post" action="${escape(actions.threshold)}">
  <div class="sv-account-field">
    <label for="sv-reputation-role">Role</label>
    <select class="sv-account-input" id="sv-reputation-role" name="role" required${described(status, "role")}>${roles.map((role) => option(role, typed("role"))).join("")}</select>
  </div>
  <div class="sv-account-field">
    <label for="sv-reputation-score">Score</label>
    <input class="sv-account-input" id="sv-reputation-score" name="score" type="number" inputmode="decimal" step="any" min="0" max="${THRESHOLD_MAX}" value="${escape(typed("score") ?? "")}" required${described(status, "score", "sv-reputation-score-hint")}>
    <p class="sv-account-hint" id="sv-reputation-score-hint">Accounts get the role once their score reaches this, and keep it.</p>
  </div>
  <div class="sv-dashboard-submit"><button class="sv-account-button" data-primary type="submit">Save threshold</button></div>
</form>`;
  return `<section class="sv-account-section" aria-labelledby="sv-reputation-thresholds">
<h2 id="sv-reputation-thresholds">Thresholds</h2>
${status?.html ?? ""}
${rows.length ? `<ul class="sv-account-list">${rows.join("")}</ul>` : `<p class="sv-account-muted">No thresholds yet.</p>`}
${form}
</section>`;
}

/** The Reputation panel: the points each event earns, and the thresholds that give roles. */
export function reputationPage(view: ReputationView): PluginPage {
  return {
    title: REPUTATION_TITLE,
    html: `<div class="sv-account sv-dashboard">
<h1>${REPUTATION_TITLE}</h1>
${pointsSection(view)}
${thresholdsSection(view)}
</div>`,
  };
}

/** Everything the Kudos panel shows. */
export interface KudosView {
  /** The points a kudos gives now. */
  readonly points: number;
  readonly query: URLSearchParams;
  readonly action: string;
}

/** The Kudos panel: a form to give an account kudos, with a reason. */
export function kudosPage({ points, query, action }: KudosView): PluginPage {
  const status = message("kudos", query);
  const typed = (key: string) => (status?.error ? query.get(key) ?? "" : "");
  return {
    title: KUDOS_TITLE,
    html: `<div class="sv-account sv-dashboard">
<h1>${KUDOS_TITLE}</h1>
<p class="sv-account-lead">Give an account ${escape(pointsText(points))} for good work.</p>
<section class="sv-account-section" aria-labelledby="sv-reputation-kudos">
<h2 id="sv-reputation-kudos">Give kudos</h2>
${status?.html ?? ""}
<form class="sv-account-form" method="post" action="${escape(action)}">
  <div class="sv-account-field">
    <label for="sv-reputation-kudos-handle">Account</label>
    <div class="sv-account-input sv-account-handle"><span aria-hidden="true">@</span><input id="sv-reputation-kudos-handle" name="handle" value="${escape(typed("handle"))}" required maxlength="${HANDLE_MAX_LENGTH}" autocomplete="off" autocapitalize="none" spellcheck="false"${described(status, "handle")}></div>
  </div>
  <div class="sv-account-field">
    <label for="sv-reputation-kudos-reason">Reason</label>
    <input class="sv-account-input" id="sv-reputation-kudos-reason" name="reason" value="${escape(typed("reason"))}" required maxlength="${REASON_MAX_LENGTH}" autocomplete="off"${described(status, "reason", "sv-reputation-kudos-reason-hint")}>
    <p class="sv-account-hint" id="sv-reputation-kudos-reason-hint">Kept in the audit log.</p>
  </div>
  <div><button class="sv-account-button" data-primary type="submit">Give kudos</button></div>
</form>
</section>
</div>`,
  };
}

/** The account page's Reputation section: the score, and the next role it can earn. */
export function standingSection({ score, next }: Standing): string {
  return `<section class="sv-account-section" aria-labelledby="sv-account-reputation">
<h2 id="sv-account-reputation">Reputation</h2>
<p class="sv-account-lead">${escape(pointsText(score))}</p>
${next ? `<p class="sv-account-muted">At ${escape(pointsText(next.score))}, you get the ${escape(next.role)} role.</p>` : ""}
</section>`;
}
