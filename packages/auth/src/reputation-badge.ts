/**
 * An account's reputation beside its name, the same wherever a plugin names an account: a compact number, as Stack
 * Exchange shows rep, read by assistive technology as "Reputation 1,234". Plugins render it from a `PublicProfile`'s
 * `reputation`: as HTML with {@link reputationBadgeHtml} from `@svartz/auth/badge`, which has no dependencies and so
 * runs anywhere, or as an element with `reputationBadge` from `@svartz/auth/browser`. Its style is in
 * `@svartz/auth/browser.css`.
 */

/** The badge's class: `.sv-reputation-badge`. */
export const REPUTATION_BADGE_CLASS = "sv-reputation-badge";

const whole = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
/** From here the badge shortens, as `12.3K`. */
const COMPACT_FROM = 10_000;

/** `score` as the badge shows it: whole points, grouped (`1,234`), and shortened past ten thousand (`12.3K`). */
export function formatReputation(score: number): string {
  return Math.abs(score) >= COMPACT_FROM ? compact.format(score) : whole.format(score);
}

/** What the badge says to assistive technology and in its tooltip: the score in full, named. */
export const reputationLabel = (score: number): string => `Reputation ${whole.format(score)}`;

/**
 * The badge's parts: what only assistive technology reads, and what everyone sees. A score shown whole reads as
 * "Reputation 1,234"; a shortened one is read in full, "Reputation 12,500", while `12.5K` is shown.
 */
export function reputationBadgeParts(score: number): { readonly hidden: string; readonly shown: string; readonly shortened: boolean } {
  const shown = formatReputation(score);
  const shortened = shown !== whole.format(score);
  return { hidden: shortened ? reputationLabel(score) : "Reputation ", shown, shortened };
}

/**
 * The badge as HTML, to follow an account's name after a space: `<span class="sv-reputation-badge" …>1,234</span>`. A
 * screen reader reads the score whole, and so does its tooltip.
 */
export function reputationBadgeHtml(score: number): string {
  const { hidden, shown, shortened } = reputationBadgeParts(score);
  const visible = shortened ? `<span aria-hidden="true">${shown}</span>` : shown;
  return `<span class="${REPUTATION_BADGE_CLASS}" title="${reputationLabel(score)}"><span class="${REPUTATION_BADGE_CLASS}-label">${hidden}</span>${visible}</span>`;
}
