/**
 * The submission guard. Every submission passes a rate limit, keyed by the signed-in identity or else the client's
 * IP, and is refused when it has neither. When sign-in is required, anonymous submissions are refused; otherwise,
 * when Turnstile is configured, they must also carry a token Cloudflare verifies. Runs before any GitHub call.
 */
import type { Identity } from "@svartz/auth/server";
import { SubmissionError } from "./errors";

export interface TurnstileOptions {
  /** The widget's public site key. */
  readonly siteKey: string;
  /** The server environment variable holding the widget's secret key. */
  readonly secret: { readonly env: string };
}

export interface RateLimitOptions {
  /** Submissions allowed per key in each period. */
  readonly limit: number;
  /** The window, in seconds. */
  readonly period: number;
}

export interface GuardOptions {
  /** Refuse anonymous submissions. Turnstile is then skipped: a signed-in reader is already known. */
  readonly signInRequired?: boolean;
  readonly turnstile?: TurnstileOptions;
  readonly rateLimit: RateLimitOptions;
}

/** What the guard reads from one submission. */
export interface GuardInput {
  /** The Turnstile token the editor sent, if any. */
  readonly token: string | undefined;
  readonly identity: Identity | null;
  readonly clientAddress: string | undefined;
  readonly env: Readonly<Record<string, unknown>>;
}

/** The Workers rate-limiting binding the guard uses when the server has one under this name. */
export const RATE_LIMIT_BINDING = "SVARTZ_SUBMISSIONS_RATE_LIMIT";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
/** Past this, Cloudflare counts as unreachable and the submission is refused. */
export const SITEVERIFY_TIMEOUT_MS = 5000;
const MS_PER_SECOND = 1000;

/** Cloudflare's `ratelimits` binding: `{ success: false }` once the key is over its limit. */
interface RateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

const isRateLimitBinding = (value: unknown): value is RateLimitBinding =>
  typeof (value as Partial<RateLimitBinding> | undefined)?.limit === "function";

/**
 * A fixed window per key, held in this isolate's (or Node process's) memory: each Workers isolate and each server
 * process counts on its own, so the limit holds per instance, not across a fleet.
 */
function memoryWindow({ limit, period }: RateLimitOptions) {
  const periodMs = period * MS_PER_SECOND;
  const windows = new Map<string, { count: number; resetAt: number }>();
  let sweepAt = 0;

  /** Counts a submission for `key`; answers the seconds until it may submit again, or `undefined` when it may now. */
  return (key: string): number | undefined => {
    const now = Date.now();
    // Expired windows are dropped once per period, so keys that never return don't pile up.
    if (now >= sweepAt) {
      for (const [stale, window] of windows) if (window.resetAt <= now) windows.delete(stale);
      sweepAt = now + periodMs;
    }
    const window = windows.get(key);
    if (!window || window.resetAt <= now) {
      windows.set(key, { count: 1, resetAt: now + periodMs });
      return undefined;
    }
    if (window.count < limit) {
      window.count += 1;
      return undefined;
    }
    return Math.ceil((window.resetAt - now) / MS_PER_SECOND);
  };
}

const unit = (name: "second" | "minute" | "hour", value: number) =>
  new Intl.NumberFormat("en", { style: "unit", unit: name, unitDisplay: "long" }).format(value);

/** `90` → `"2 minutes"`: the wait in the largest unit, rounded up so the reader never retries too early. */
function inWords(seconds: number): string {
  if (seconds < 60) return unit("second", seconds);
  if (seconds < 3600) return unit("minute", Math.ceil(seconds / 60));
  return unit("hour", Math.ceil(seconds / 3600));
}

const rateLimited = (retryAfter: number) =>
  new SubmissionError("rate_limited", 429, `You've sent too many edits. Try again in ${inWords(retryAfter)}.`, retryAfter);

const turnstileUnavailable = () =>
  new SubmissionError("turnstile_unavailable", 503, "Couldn't confirm you're human right now. Try again in a moment.");

const rateLimitUnavailable = () =>
  new SubmissionError("rate_limit_unavailable", 503, "Couldn't count your edits right now. Try again in a moment.");

// Also behind a proxy that hides client addresses: anonymous readers would all share one quota, and one could use it up.
const signInRequired = () =>
  new SubmissionError("sign_in_required", 401, "Sign in to send edits from this site, then open the pull request.");

/** Whether Cloudflare accepts `token`. Network failure, a timeout or an error status throw instead of answering. */
async function verifyTurnstile(secret: string, token: string, clientAddress: string | undefined): Promise<boolean> {
  const form = new URLSearchParams({ secret, response: token });
  if (clientAddress) form.set("remoteip", clientAddress);
  try {
    const response = await fetch(SITEVERIFY_URL, { method: "POST", body: form, signal: AbortSignal.timeout(SITEVERIFY_TIMEOUT_MS) });
    if (!response.ok) throw turnstileUnavailable();
    const result = await response.json() as { success?: unknown };
    return result.success === true;
  } catch (error) {
    if (error instanceof SubmissionError) throw error;
    // Unreachable, timed out, or not JSON: none of them say the token is bad.
    throw turnstileUnavailable();
  }
}

/** Build the guard once per server module; its in-memory window lives as long as the module does. */
export function createGuard({ signInRequired: required = false, turnstile, rateLimit }: GuardOptions) {
  const countInMemory = memoryWindow(rateLimit);

  async function limit(key: string, env: GuardInput["env"]): Promise<void> {
    const binding = env[RATE_LIMIT_BINDING];
    if (isRateLimitBinding(binding)) {
      // The binding doesn't say when its window resets; its period is at most this one.
      const { success } = await binding.limit({ key }).catch((error: unknown) => {
        console.error("[submissions] the rate-limiting binding failed", error);
        throw rateLimitUnavailable();
      });
      if (!success) throw rateLimited(rateLimit.period);
      return;
    }
    const retryAfter = countInMemory(key);
    if (retryAfter !== undefined) throw rateLimited(retryAfter);
  }

  /** Resolves when the submission may go ahead; otherwise throws the {@link SubmissionError} to answer. */
  return async function check({ token, identity, clientAddress, env }: GuardInput): Promise<void> {
    if (!identity && (required || !clientAddress)) throw signInRequired();
    const key = identity ? `identity:${identity.id}` : `ip:${clientAddress}`;
    if (!turnstile || required) return limit(key, env);
    if (!token) throw new SubmissionError("turnstile_required", 403, "Finish the check that you're human, then open the pull request.");
    // Counted before verifying, so a flood of bad tokens spends its own quota rather than Cloudflare round trips.
    await limit(key, env);

    const secret = env[turnstile.secret.env];
    if (typeof secret !== "string" || !secret) {
      throw new SubmissionError(
        "misconfigured",
        503,
        `This site can't accept edits yet: its server has no ${turnstile.secret.env} set.`,
      );
    }
    if (!(await verifyTurnstile(secret, token, clientAddress))) {
      throw new SubmissionError("turnstile_failed", 403, "Couldn't confirm you're human. Finish the check again, then open the pull request.");
    }
  };
}
