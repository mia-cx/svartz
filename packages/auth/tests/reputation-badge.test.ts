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

  it("reads as \"Reputation\" and the score, with the whole score in its tooltip", () => {
    const html = reputationBadgeHtml(12_500);

    expect(html.replace(/<[^>]+>/g, "")).toBe("Reputation 12.5K");
    expect(html).toContain('title="Reputation 12,500"');
    expect(html).toContain('class="sv-reputation-badge-label">Reputation </span>');
  });
});
