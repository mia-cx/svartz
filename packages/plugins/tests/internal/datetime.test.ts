import { afterEach, describe, expect, it } from "vitest";
import { normalizeDateTime } from "../../src/internal/datetime";

const zone = process.env.TZ;

afterEach(() => {
  if (zone === undefined) delete process.env.TZ;
  else process.env.TZ = zone;
});

describe("normalizeDateTime", () => {
  it.each(["Europe/Amsterdam", "America/Los_Angeles", "UTC"])(
    "reads a date without an offset as UTC in %s",
    (tz) => {
      process.env.TZ = tz;
      expect(normalizeDateTime("2023-09-08T00:00")?.toISOString()).toBe("2023-09-08T00:00:00.000Z");
      expect(normalizeDateTime("2023-09-08")?.toISOString()).toBe("2023-09-08T00:00:00.000Z");
      expect(normalizeDateTime("08/09/2023", "DD/MM/YYYY")?.toISOString()).toBe("2023-09-08T00:00:00.000Z");
    },
  );

  it("keeps an explicit offset", () => {
    process.env.TZ = "Europe/Amsterdam";
    expect(normalizeDateTime("2023-09-08T00:00+02:00")?.toISOString()).toBe("2023-09-07T22:00:00.000Z");
  });
});
