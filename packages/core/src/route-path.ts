/** Decode a percent-encoded URL pathname once; preserve slashes and return undefined for malformed escapes. */
export function decodeRoutePath(pathname: string): string | undefined {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return undefined;
  }
}
