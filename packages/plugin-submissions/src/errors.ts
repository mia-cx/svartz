import type { ErrorResponse } from "./api";

/** A failure the reader should see. The handler answers `status` with `{ error: code, message }`. */
export class SubmissionError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
    /** Seconds until a rate-limited reader may submit again; sent as `retryAfter` and `Retry-After`. */
    readonly retryAfter?: number,
    /** The URL of the published page a new page's title collides with; sent as `existing`. */
    readonly existing?: string,
  ) {
    super(message);
    this.name = "SubmissionError";
  }

  toResponse(): Response {
    const { code: error, message, status, retryAfter, existing } = this;
    const body: ErrorResponse = { error, message, ...(retryAfter === undefined ? {} : { retryAfter }), ...(existing ? { existing } : {}) };
    return Response.json(body, { status, headers: retryAfter === undefined ? {} : { "retry-after": String(retryAfter) } });
  }
}

/** The site's GitHub credentials are missing or wrong: `reason` tells the site owner which, without any secret. */
export const misconfigured = (reason: string) =>
  new SubmissionError("misconfigured", 503, `This site can't open pull requests yet: ${reason}.`);
