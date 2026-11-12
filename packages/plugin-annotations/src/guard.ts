/** Per-reader write budgets: Cloudflare's native binding when present, otherwise this server instance's memory. */
export const RATE_LIMIT_BINDING = "SVARTZ_ANNOTATIONS_RATE_LIMIT";

const HOUR_SECONDS = 3600;
const MS_PER_SECOND = 1000;

interface RateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

const isRateLimitBinding = (value: unknown): value is RateLimitBinding =>
  typeof (value as Partial<RateLimitBinding> | undefined)?.limit === "function";

/** Fixed windows live per isolate/process, rather than across a fleet; expired readers are swept once an hour. */
function memoryWindow(limit: number) {
  const periodMs = HOUR_SECONDS * MS_PER_SECOND;
  const windows = new Map<string, { count: number; resetAt: number }>();
  let sweepAt = 0;
  return (key: string): number | undefined => {
    const now = Date.now();
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

/** Round up in the largest unit so the displayed wait never asks the reader to retry too early. */
function inWords(seconds: number): string {
  if (seconds < 60) return unit("second", seconds);
  if (seconds < HOUR_SECONDS) return unit("minute", Math.ceil(seconds / 60));
  return unit("hour", Math.ceil(seconds / HOUR_SECONDS));
}

/** Build once per server module, so every write through it shares the same budget. */
export function createWriteLimit(writesPerHour: number) {
  const countInMemory = memoryWindow(writesPerHour);
  return async (identity: string, env: Readonly<Record<string, unknown>>): Promise<Response | undefined> => {
    const key = `identity:${identity}`;
    const binding = env[RATE_LIMIT_BINDING];
    let retryAfter: number | undefined;
    if (isRateLimitBinding(binding)) {
      try {
        // The native binding owns its configured quota and doesn't expose its reset time. An hour is a safe wait.
        if ((await binding.limit({ key })).success) return undefined;
        retryAfter = HOUR_SECONDS;
      } catch (error) {
        console.error("[svartz:annotations] the rate-limiting binding failed", error);
        return Response.json({ error: "rate_limit_unavailable", message: "Couldn't count your annotations right now. Try again in a moment." }, {
          status: 503, headers: { "cache-control": "no-store" },
        });
      }
    } else {
      retryAfter = countInMemory(key);
    }
    if (retryAfter === undefined) return undefined;
    return Response.json({ error: "rate_limited", message: `You've sent too many annotations. Try again in ${inWords(retryAfter)}.`, retryAfter }, {
      status: 429, headers: { "cache-control": "no-store", "retry-after": String(retryAfter) },
    });
  };
}
