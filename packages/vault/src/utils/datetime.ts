import moment from "moment";

/**
 * Normalize a datetime value from frontmatter to an ISO 8601 Date object.
 * 
 * If dateFormat is provided (moment.js format), attempts to parse the string with that format.
 * Then normalizes to ISO 8601 with milliseconds floored.
 * 
 * If dateFormat is not provided, attempts standard Date parsing.
 * If all parsing fails, returns null (caller should use file timestamp).
 */
export const normalizeDateTime = (
  value: unknown,
  dateFormat?: string,
): Date | null => {
  // If it's already a Date, convert to ISO string and back to normalize
  if (value instanceof Date) {
    return normalizeDateToUTC(value);
  }

  // If it's a string, try to parse it
  if (typeof value === "string") {
    // If dateFormat is provided, use moment to parse with that format
    if (dateFormat) {
      const parsed = moment(value, dateFormat, true);
      if (parsed.isValid()) {
        return normalizeDateToUTC(parsed.toDate());
      }
    }

    // Try parsing as ISO or standard date format
    const directParse = moment(value);
    if (directParse.isValid()) {
      return normalizeDateToUTC(directParse.toDate());
    }
  }

  // Return null if parsing fails — caller will use file timestamp
  return null;
};

/**
 * Normalize a Date to UTC, flooring milliseconds to 000.
 * This ensures all dates in the index are in a consistent format.
 */
const normalizeDateToUTC = (date: Date): Date => {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const hours = date.getUTCHours();
  const minutes = date.getUTCMinutes();
  const seconds = date.getUTCSeconds();
  // Floor milliseconds to 000
  return new Date(Date.UTC(year, month, day, hours, minutes, seconds, 0));
};
