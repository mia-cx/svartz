import { describe, expect, it } from "vitest";
import { formatReputation, reputationBadgeHtml } from "../src/reputation-badge";

// Proves the badge reads as Stack Exchange's rep does: whole points, grouped, shortened past ten thousand, and in full
// in its tooltip and to a screen reader.
describe("an account's reputation beside its name", () => {
  it.each([
    [0, "0"],
    [4.32, "4"],
    [1_234, "1,234"],
    [9_999, "9,999"],
    [12_500, "12.5K"],
    [1_250_000, "1.3M"],
    [-3, "-3"],
  ])("shows %d as %s", (score, shown) => {
    expect(formatReputation(score)).toBe(shown);
  });

  // A screen reader reads what isn't aria-hidden: the visually hidden label, and the shown score unless it is shortened.
  const read = (html: string) => html.replace(/<span aria-hidden="true">[^<]*<\/span>/g, "").replace(/<[^>]+>/g, "");

  it("reads as \"Reputation\" and the score", () => {
    const html = reputationBadgeHtml(1_234);

    expect(read(html)).toBe("Reputation 1,234");
    expect(html).toContain('title="Reputation 1,234"');
  });

  it("reads a shortened score whole, and shows it short", () => {
    const html = reputationBadgeHtml(12_500);

    expect(read(html)).toBe("Reputation 12,500");
    expect(html).toContain('<span aria-hidden="true">12.5K</span>');
    expect(html).toContain('title="Reputation 12,500"');
  });
});
