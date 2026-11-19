import { describe, expect, it } from "vitest";
import { runsCode } from "../src/content";

// Proves the sanitizer reads a URL's scheme as a browser does, so a script URL can't hide behind characters a browser drops.
describe("a URL that runs code", () => {
  it.each([
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    " javascript:alert(1)",
    "\u0001javascript:alert(1)",
    "java\tscript:alert(1)",
    "java\nscript:alert(1)",
    "java\r\nscript:alert(1)",
    "vbscript:msgbox(1)",
    "data:text/html,<script>alert(1)</script>",
    "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
    "data: text/html,<script>alert(1)</script>",
    "data:application/xhtml+xml,<script xmlns='http://www.w3.org/1999/xhtml'>alert(1)</script>",
  ])("is refused: %j", (url) => {
    expect(runsCode(url)).toBe(true);
  });

  it.each([
    "https://example.com/",
    "/wiki/javascript:/",
    "#javascript:alert(1)",
    "notes/data:text/html",
    "data:image/png;base64,AAAA",
    "mailto:ada@example.org",
  ])("is not %j", (url) => {
    expect(runsCode(url)).toBe(false);
  });
});
