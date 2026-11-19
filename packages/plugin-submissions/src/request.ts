/**
 * A request's body, read chunk by chunk, or `undefined` once it passes `max` bytes: the stream is cancelled there and
 * nothing more is buffered, so a body without a Content-Length can't exhaust memory.
 */
export async function readBody(request: Request, max: number): Promise<Uint8Array | undefined> {
  if (Number(request.headers.get("content-length")) > max) return undefined;
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  for (let read = await reader.read(); !read.done; read = await reader.read()) {
    bytes += read.value.byteLength;
    if (bytes > max) {
      await reader.cancel();
      return undefined;
    }
    chunks.push(read.value);
  }
  const body = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}
