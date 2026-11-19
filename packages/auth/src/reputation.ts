/**
 * Reputation: an append-only ledger in `auth_reputation`, one entry per event that earned or took back points, and an
 * account's score is the sum of its entries. Plugins post events with {@link postReputation}; auth weighs each with
 * the site's weights, records it once however often it is posted, and gives every role whose threshold the score
 * reaches. Nothing ever takes a role away, and reputation never gives a role twice, so an admin's removal sticks.
 * A plugin whose content was undone takes back what it earned with {@link reverseReputation}.
 */
import { auditStatement, type AuditEntry } from "./audit";
import { accountsDatabase, ACCOUNTS_DATABASE_ENV, type Database } from "./store";

type Env = Readonly<Record<string, unknown>>;

/** What earns points, with each weight's default and the bounds an admin may set it within. */
export const WEIGHTS = {
  /** A merged edit scores this times `1 + log2(changed lines)`. */
  edit: { default: 1, min: 0, max: 100 },
  /** A merged new page. */
  page: { default: 5, min: 0, max: 100 },
  /** Each +1 a comment receives. */
  agreement: { default: 0.5, min: 0, max: 100 },
  /** A moderator's kudos. */
  kudos: { default: 5, min: 0, max: 100 },
  /** A pull request closed without merging: nothing, or a penalty. */
  declined: { default: 0, min: -100, max: 0 },
} as const;

export type Weight = keyof typeof WEIGHTS;

/** The most points an account earns per UTC day from edits, new pages and +1s. Kudos don't count toward it. */
export const DAILY_LIMIT = { default: 100, min: 1, max: 100_000 } as const;

/** The highest score a threshold may ask for. */
export const THRESHOLD_MAX = 1_000_000;

/** Kudos one moderator may give per UTC day; each account gets at most one from them a day. */
export const KUDOS_PER_DAY = 10;

/** The weights and daily limit in force: the defaults, with whatever an admin changed. */
export type ReputationSettings = { readonly [Name in Weight]: number } & { readonly dailyLimit: number };

/** Who made an automatic change, in the audit log: no account, and no handle anyone can take. */
const REPUTATION_ACTOR: AuditEntry["actor"] = { id: "auth:reputation", handle: "auth:reputation" };

/** The setting names stored in `auth_reputation_settings`. */
const DAILY_LIMIT_SETTING = "daily-limit";

/** Sources whose points count toward the daily limit: what an account earns from others' actions on its work. */
const LIMITED = ["edit", "page", "agreement"] as const;

/** The start of the current UTC day, ISO 8601, which entries' `at` compare against. */
const today = (now = new Date()) => `${now.toISOString().slice(0, 10)}T00:00:00.000Z`;

/** Points as stored: two decimals, so sums read cleanly. */
const rounded = (points: number) => Math.round(points * 100) / 100;

/** The site's weights and daily limit. */
export async function readSettings(db: Database): Promise<ReputationSettings> {
  const { results } = await db.prepare("SELECT name, value FROM auth_reputation_settings").all<{ name: string; value: number }>();
  const stored = new Map(results.map(({ name, value }) => [name, value]));
  const weights = Object.fromEntries(Object.entries(WEIGHTS).map(([name, { default: fallback }]) => [name, stored.get(name) ?? fallback]));
  return { ...weights as Record<Weight, number>, dailyLimit: stored.get(DAILY_LIMIT_SETTING) ?? DAILY_LIMIT.default };
}

/** Set every weight and the daily limit, recording the change. The caller checked each is in bounds. */
export async function saveSettings(db: Database, actor: AuditEntry["actor"], settings: ReputationSettings): Promise<void> {
  const at = new Date().toISOString();
  const values: Array<[string, number]> = [...Object.keys(WEIGHTS).map((name) => [name, settings[name as Weight]] as [string, number]), [DAILY_LIMIT_SETTING, settings.dailyLimit]];
  await db.batch([
    ...values.map(([name, value]) => db.prepare(`INSERT INTO auth_reputation_settings (name, value, updated_at) VALUES (?, ?, ?)
      ON CONFLICT (name) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`).bind(name, value, at)),
    auditStatement(db, { actor, action: "auth:weights:set", target: "reputation", detail: Object.fromEntries(values) }),
  ]);
}

/** A threshold: reaching `score` gives the account `role`. */
export interface Threshold {
  readonly role: string;
  readonly score: number;
}

/** Every threshold, lowest score first. */
export async function listThresholds(db: Database): Promise<Threshold[]> {
  const { results } = await db.prepare("SELECT role, score FROM auth_reputation_thresholds ORDER BY score, role").all<Threshold>();
  return results;
}

/**
 * Set `role`'s threshold to `score`, recording the change, then give the role to every account already there. The
 * caller checked that `role` is a stored role and `score` is in bounds.
 */
export async function setThreshold(db: Database, actor: AuditEntry["actor"], { role, score }: Threshold): Promise<void> {
  await db.batch([
    db.prepare(`INSERT INTO auth_reputation_thresholds (role, score, updated_at) VALUES (?, ?, ?)
      ON CONFLICT (role) DO UPDATE SET score = excluded.score, updated_at = excluded.updated_at`).bind(role, score, new Date().toISOString()),
    auditStatement(db, { actor, action: "auth:threshold:set", target: role, detail: { score } }),
  ]);
  await promote(db);
}

/** Remove `role`'s threshold, recording it; `false`, changing nothing, when it has none. Nobody loses the role. */
export async function removeThreshold(db: Database, actor: AuditEntry["actor"], role: string): Promise<boolean> {
  const { results } = await db.prepare("SELECT 1 FROM auth_reputation_thresholds WHERE role = ?").bind(role).all();
  if (results.length === 0) return false;
  await db.batch([
    db.prepare("DELETE FROM auth_reputation_thresholds WHERE role = ?").bind(role),
    auditStatement(db, { actor, action: "auth:threshold:remove", target: role }),
  ]);
  return true;
}

/**
 * The score of `?1` (every account, when null), at the two decimals entries are stored with: a raw sum such as
 * 0.1 + 0.7 = 0.7999999999999999 would miss a threshold of 0.8 that the account's page shows as reached.
 */
const SCORES = `scores AS (
    SELECT account_id, ROUND(SUM(points), 2) AS score FROM auth_reputation WHERE ?1 IS NULL OR account_id = ?1 GROUP BY account_id
  )`;

/** Accounts whose score reaches a threshold whose role they don't hold and reputation never gave them. */
const DUE = `WITH ${SCORES}, due AS (
    SELECT s.account_id, s.score, t.role, t.score AS threshold FROM scores s JOIN auth_reputation_thresholds t ON s.score >= t.score
    WHERE NOT EXISTS (SELECT 1 FROM auth_reputation_promotions p WHERE p.account_id = s.account_id AND p.role = t.role)
      AND NOT EXISTS (SELECT 1 FROM auth_role_members m WHERE m.account_id = s.account_id AND m.role = t.role)
  )`;

/**
 * Give `account` (every account, when omitted) each role whose threshold its score reaches, unless it holds the role or
 * reputation gave it before: a role an admin removed stays removed. Each promotion is audited, in one transaction with
 * it, in three statements however many accounts are due.
 */
async function promote(db: Database, account?: string): Promise<void> {
  const at = new Date().toISOString();
  await db.batch([
    db.prepare(`${DUE} INSERT INTO auth_audit (at, actor_id, actor_handle, action, target, detail)
      SELECT ?2, ?3, ?4, 'auth:role:promote', d.role, json_object('account', a.handle, 'score', d.score, 'threshold', d.threshold)
      FROM due d JOIN auth_accounts a ON a.id = d.account_id`).bind(account ?? null, at, REPUTATION_ACTOR.id, REPUTATION_ACTOR.handle),
    db.prepare(`${DUE} INSERT INTO auth_role_members (role, account_id, added_at) SELECT role, account_id, ?2 FROM due WHERE true
      ON CONFLICT DO NOTHING`).bind(account ?? null, at),
    // The memberships just added are the ones this batch stamped, so the promotion is recorded only where it landed.
    db.prepare(`WITH ${SCORES}
      INSERT INTO auth_reputation_promotions (account_id, role, promoted_at)
      SELECT s.account_id, t.role, ?2 FROM scores s JOIN auth_reputation_thresholds t ON s.score >= t.score
      WHERE EXISTS (SELECT 1 FROM auth_role_members m WHERE m.account_id = s.account_id AND m.role = t.role AND m.added_at = ?2)
      ON CONFLICT DO NOTHING`).bind(account ?? null, at),
  ]);
}

/** Whether reputation gave `account` `role`, whether or not it still holds it. */
export async function wasPromoted(db: Database, account: string, role: string): Promise<boolean> {
  const { results } = await db.prepare("SELECT 1 FROM auth_reputation_promotions WHERE account_id = ? AND role = ?").bind(account, role).all();
  return results.length > 0;
}

/** Where an account stands: its score, and the next threshold whose role it doesn't hold, if any. */
export interface Standing {
  readonly score: number;
  readonly next?: Threshold;
}

export async function standingOf(db: Database, account: string): Promise<Standing> {
  const score = await scoreOf(db, account);
  const { results: [next] } = await db.prepare(`SELECT role, score FROM auth_reputation_thresholds
    WHERE score > ?2 AND role NOT IN (SELECT role FROM auth_role_members WHERE account_id = ?1) ORDER BY score, role LIMIT 1`)
    .bind(account, score).all<Threshold>();
  return next ? { score, next } : { score };
}

/** An account's score: the sum of its entries. */
export async function scoreOf(db: Database, account: string): Promise<number> {
  const { results: [row] } = await db.prepare("SELECT COALESCE(SUM(points), 0) AS score FROM auth_reputation WHERE account_id = ?")
    .bind(account).all<{ score: number }>();
  return rounded(row?.score ?? 0);
}

/** Who an entry credits: an account by its id, or the account a provider account (`github:583231`) is linked to. */
export type Recipient = { readonly account: string } | { readonly identity: string };

/**
 * An event that earns points, as a plugin posts it. `ref` names the event, unique within its kind and prefixed with the
 * posting plugin's id (`submissions:…`): posting the same event again changes nothing.
 */
export type ReputationEvent =
  /** An edit merged or committed to the content, `lines` lines changed (added plus removed). */
  | { readonly kind: "edit"; readonly to: Recipient; readonly ref: string; readonly lines: number }
  /** A new page merged or committed. */
  | { readonly kind: "page"; readonly to: Recipient; readonly ref: string }
  /** A pull request closed without merging. */
  | { readonly kind: "declined"; readonly to: Recipient; readonly ref: string }
  /**
   * Account `from` agrees (`agreed`) or doesn't agree with something `to` wrote, as of `version`. `ref` names the pair,
   * such as the comment and `from`; the agreement scores once while it stands, and taking it back takes the points back
   * with a further entry. Nobody scores from their own agreement. `version` orders the pair's changes: it grows with
   * every change, in the write that makes it, and is read with `agreed` in one read. A post with a lower version than
   * one already settled changes nothing, so a request that read before a later change can't overwrite it.
   */
  | { readonly kind: "agreement"; readonly to: Recipient; readonly ref: string; readonly from: string; readonly agreed: boolean; readonly version: number };

/** The longest `ref` accepted. */
const REF_MAX_LENGTH = 512;

/** The account `to` names, if it names one. */
async function recipientOf(db: Database, to: Recipient): Promise<string | undefined> {
  const { results: [row] } = "account" in to
    ? await db.prepare("SELECT id FROM auth_accounts WHERE id = ?").bind(to.account).all<{ id: string }>()
    : await db.prepare("SELECT account_id AS id FROM auth_identities WHERE id = ?").bind(to.identity).all<{ id: string }>();
  return row?.id;
}

/**
 * `points` cut to what is left of `account`'s daily limit `limit` from the {@link LIMITED} sources `sources` (a JSON
 * array) since `day`, never below 0. Each argument is a placeholder, so the statement that appends reads the day's
 * total itself, and racing posts can't both spend what is left.
 */
const limitedPoints = (account: string, points: string, limit: string, day: string, sources: string) =>
  `MAX(0, MIN(${points}, ${limit} - COALESCE((SELECT SUM(points) FROM auth_reputation WHERE account_id = ${account} AND points > 0
    AND at >= ${day} AND source IN (SELECT value FROM json_each(${sources}))), 0)))`;

/** The source of the entries {@link reverseReputation} writes, each under the ref of the event it takes back. */
const REVERSAL = "reversal";

/**
 * Append an entry unless one for `(source, ref)` exists, or `ref` was reversed: an event taken back before it was
 * posted scores nothing. A positive entry from a {@link LIMITED} source is cut to what is left of the account's daily
 * limit, so it may land as 0.
 */
async function append(db: Database, entry: { account: string; source: string; ref: string; points: number }, dailyLimit?: number): Promise<void> {
  const values = [entry.account, entry.source, entry.ref, rounded(entry.points), new Date().toISOString()];
  const limited = dailyLimit !== undefined && entry.points > 0;
  const points = limited ? limitedPoints("?1", "?4", "?6", "?7", "?8") : "?4";
  await db.prepare(`INSERT INTO auth_reputation (account_id, source, ref, points, at)
      SELECT ?1, ?2, ?3, ${points}, ?5 WHERE NOT EXISTS (SELECT 1 FROM auth_reputation WHERE source = '${REVERSAL}' AND ref = ?3)
      ON CONFLICT (source, ref) DO NOTHING`)
    .bind(...values, ...limited ? [dailyLimit, today(), JSON.stringify(LIMITED)] : [])
    .run();
}

/**
 * Settle `event` in one transaction. It is stored in `auth_reputation_agreements` unless a newer version is, and the
 * ledger is then made to follow whatever is stored, never `event` itself. The pair's entries alternate, credit then
 * take-back, under refs `<ref>#0`, `<ref>#1`…, so an odd count means credited. A credit goes to `account`, the
 * event's recipient, unless that is `event.from`; a take-back returns exactly what its credit gave, to the account it
 * gave it to.
 */
async function settleAgreement(db: Database, event: Extract<ReputationEvent, { kind: "agreement" }>, settings: ReputationSettings, account: string | undefined): Promise<void> {
  const at = new Date().toISOString();
  const recipient = account === event.from ? undefined : account;
  // ?1 the event's ref, ?2 its entries' ref prefix; `entries` counts them and `stored` is the settled state.
  const entries = "(SELECT COUNT(*) AS count FROM auth_reputation WHERE source = 'agreement' AND substr(ref, 1, length(?2)) = ?2)";
  const stored = "(SELECT agreed FROM auth_reputation_agreements WHERE ref = ?1)";
  await db.batch([
    db.prepare(`INSERT INTO auth_reputation_agreements (ref, version, agreed) VALUES (?1, ?2, ?3)
      ON CONFLICT (ref) DO UPDATE SET version = excluded.version, agreed = excluded.agreed WHERE excluded.version > auth_reputation_agreements.version`)
      .bind(event.ref, event.version, event.agreed ? 1 : 0),
    db.prepare(`INSERT INTO auth_reputation (account_id, source, ref, points, at)
      SELECT ?3, 'agreement', ?2 || n.count, ${limitedPoints("?3", "?4", "?5", "?6", "?7")}, ?8 FROM ${entries} n
      WHERE ?3 IS NOT NULL AND n.count % 2 = 0 AND ${stored} = 1`)
      .bind(event.ref, `${event.ref}#`, recipient ?? null, rounded(settings.agreement), settings.dailyLimit, today(), JSON.stringify(LIMITED), at),
    db.prepare(`INSERT INTO auth_reputation (account_id, source, ref, points, at)
      SELECT last.account_id, 'agreement', ?2 || n.count, -last.points, ?3 FROM ${entries} n,
        (SELECT account_id, points FROM auth_reputation WHERE source = 'agreement' AND substr(ref, 1, length(?2)) = ?2 ORDER BY id DESC LIMIT 1) last
      WHERE n.count % 2 = 1 AND ${stored} = 0`)
      .bind(event.ref, `${event.ref}#`, at),
  ]);
}

function checkRef(ref: string): void {
  if (typeof ref !== "string" || ref === "" || ref.length > REF_MAX_LENGTH) {
    throw new Error(`[svartz:auth] a reputation event's ref must be 1 to ${REF_MAX_LENGTH} characters`);
  }
}

/** Throw unless `event` is one auth can weigh: a plugin bug, never a reader's input. */
function check(event: ReputationEvent): void {
  checkRef(event.ref);
  if (event.kind === "edit" && !(Number.isFinite(event.lines) && event.lines >= 0)) {
    throw new Error("[svartz:auth] an edit's lines must be a finite number of at least 0");
  }
  if (event.kind === "agreement" && !(Number.isSafeInteger(event.version) && event.version >= 0)) {
    throw new Error("[svartz:auth] an agreement's version must be a whole number of at least 0");
  }
  if (!["edit", "page", "declined", "agreement"].includes(event.kind)) throw new Error(`[svartz:auth] unknown reputation event "${String((event as { kind: unknown }).kind)}"`);
}

/** The points `event` scores under `settings`. A change of no lines scores as one. */
function pointsFor(event: Exclude<ReputationEvent, { kind: "agreement" }>, settings: ReputationSettings): number {
  if (event.kind === "edit") return settings.edit * (1 + Math.log2(Math.max(1, Math.round(event.lines))));
  return settings[event.kind];
}

/**
 * Record `event` in the ledger, weighed with the site's weights, and give its account any role a threshold now grants.
 * Posting an event again, as a repeated webhook delivery or a poll that reads it again would, scores nothing more, and
 * gives any role the first post failed to give. An event whose recipient has no account changes nothing.
 *
 * Throws when the site binds no `SVARTZ_DB`, or the write fails.
 */
export async function postReputation(env: Env, event: ReputationEvent): Promise<void> {
  check(event);
  const db = await accountsDatabase(env);
  if (!db) throw new Error(`[svartz:auth] bind a D1 database as ${ACCOUNTS_DATABASE_ENV} to keep reputation`);
  const settings = await readSettings(db);
  const account = await recipientOf(db, event.to);
  if (event.kind === "agreement") await settleAgreement(db, event, settings, account);
  else if (account) {
    const limited = event.kind === "declined" ? undefined : settings.dailyLimit;
    await append(db, { account, source: event.kind, ref: event.ref, points: pointsFor(event, settings) }, limited);
  }
  // Decided from the ledger as just written, and also when the event was recorded before: posting it again finishes a
  // promotion that failed after its entry landed.
  if (account) await promote(db, account);
}

/** Taking back what an `edit` or `page` event earned, when the content it scored for is undone. */
export interface Reversal {
  /** The account the event credited, as the plugin's own records name it. */
  readonly account: string;
  /** The ref the event was posted with. */
  readonly ref: string;
}

/**
 * Take back what each `edit` or `page` event `ref` earned its `account`, as one `reversal` entry per event under the
 * same ref, all in one transaction however many there are, then give any role a threshold grants. An event is taken
 * back once: reversing it again changes nothing. An event not posted yet still gets its entry, at 0 points, and scores
 * nothing when it is posted; one that was posted and earned `account` nothing (it scored 0, or credited someone else)
 * gets none. A reversal lowers a score but never takes away a role the account holds.
 *
 * Throws when the site binds no `SVARTZ_DB`, or the write fails.
 */
export async function reverseReputation(env: Env, reversals: readonly Reversal[]): Promise<void> {
  for (const { ref } of reversals) checkRef(ref);
  if (reversals.length === 0) return;
  const db = await accountsDatabase(env);
  if (!db) throw new Error(`[svartz:auth] bind a D1 database as ${ACCOUNTS_DATABASE_ENV} to keep reputation`);
  const at = new Date().toISOString();
  await db.batch(reversals.map(({ account, ref }) => db.prepare(`INSERT INTO auth_reputation (account_id, source, ref, points, at)
      SELECT ?1, '${REVERSAL}', ?2, ROUND(-e.earned, 2), ?3 FROM (
        SELECT COALESCE(SUM(CASE WHEN account_id = ?1 THEN points END), 0) AS earned, COUNT(*) AS entries
        FROM auth_reputation WHERE source IN ('edit', 'page') AND ref = ?2
      ) e
      WHERE (e.earned <> 0 OR e.entries = 0) AND EXISTS (SELECT 1 FROM auth_accounts WHERE id = ?1)
      ON CONFLICT (source, ref) DO NOTHING`).bind(account, ref, at)));
  await promote(db);
}

/** What giving kudos came to. */
export type KudosResult = "given" | "already" | "limit";

/**
 * Give `recipient` kudos from `giver`, with `reason`, in one transaction with its audit entry. `already` when `giver`
 * gave them kudos today, `limit` when `giver` gave {@link KUDOS_PER_DAY} today. The caller checked the permission, and
 * that the two differ.
 */
export async function giveKudos(db: Database, giver: AuditEntry["actor"], recipient: { readonly id: string; readonly handle: string }, reason: string): Promise<KudosResult> {
  const prefix = `${giver.id}:`;
  const day = today();
  const ref = `${prefix}${recipient.id}:${day.slice(0, 10)}`;
  const at = new Date().toISOString();
  const { kudos: points } = await readSettings(db);
  // The insert counts the giver's kudos today itself, so racing gifts can't both pass the limit, and the audit entry
  // lands only after an insert that changed a row.
  const [gift] = await db.batch([
    db.prepare(`INSERT INTO auth_reputation (account_id, source, ref, points, at) SELECT ?1, 'kudos', ?2, ?3, ?4
      WHERE (SELECT COUNT(*) FROM auth_reputation WHERE source = 'kudos' AND substr(ref, 1, ?6) = ?5 AND at >= ?7) < ?8
      ON CONFLICT (source, ref) DO NOTHING RETURNING id`).bind(recipient.id, ref, points, at, prefix, prefix.length, day, KUDOS_PER_DAY),
    db.prepare(`INSERT INTO auth_audit (at, actor_id, actor_handle, action, target, detail)
      SELECT ?, ?, ?, 'auth:kudos:give', ?, ? WHERE changes() > 0`)
      .bind(at, giver.id, giver.handle, recipient.handle, JSON.stringify({ reason, points })),
  ]);
  // Also after a repeated gift: it finishes a promotion that failed after the first one landed.
  await promote(db, recipient.id);
  if (gift!.results.length > 0) return "given";
  const { results } = await db.prepare("SELECT 1 FROM auth_reputation WHERE source = 'kudos' AND ref = ?").bind(ref).all();
  return results.length > 0 ? "already" : "limit";
}
