import type { ErrorResponse } from "./api";

/** A failure the reader should see. The handler answers `status` with `{ error: code, message }`. */
export class SubmissionError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "SubmissionError";
  }

  toResponse(): Response {
    return Response.json({ error: this.code, message: this.message } satisfies ErrorResponse, { status: this.status });
  }
}
