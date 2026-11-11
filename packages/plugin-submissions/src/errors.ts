import type { ErrorResponse } from "./api";

/** A failure the reader should see. The handler answers `status` with `{ error: code, message }`. */
export class SubmissionError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
    /** Seconds until a rate-limited reader may submit again; sent as `retryAfter` and `Retry-After`. */
    readonly retryAfter?: number,
  ) {
    super(message);
    this.name = "SubmissionError";
  }

  toResponse(): Response {
    const { code: error, message, status, retryAfter } = this;
    if (retryAfter === undefined) return Response.json({ error, message } satisfies ErrorResponse, { status });
    return Response.json({ error, message, retryAfter } satisfies ErrorResponse, { status, headers: { "retry-after": String(retryAfter) } });
  }
}
