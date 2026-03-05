/**
 * Datetime normalization — ported from @svartz/vault datetime.ts.
 */

import moment from "moment";

export const normalizeDateTime = (
  value: unknown,
  dateFormat?: string,
): Date | null => {
  if (value instanceof Date) {
    return normalizeDateToUTC(value);
  }

  if (typeof value === "string") {
    if (dateFormat) {
      const parsed = moment(value, dateFormat, true);
      if (parsed.isValid()) {
        return normalizeDateToUTC(parsed.toDate());
      }
    }

    const directParse = moment(value);
    if (directParse.isValid()) {
      return normalizeDateToUTC(directParse.toDate());
    }
  }

  return null;
};

const normalizeDateToUTC = (date: Date): Date => {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const hours = date.getUTCHours();
  const minutes = date.getUTCMinutes();
  const seconds = date.getUTCSeconds();
  return new Date(Date.UTC(year, month, day, hours, minutes, seconds, 0));
};
