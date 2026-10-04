const DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
	year: 'numeric',
	month: 'short',
	day: 'numeric',
	timeZone: 'UTC'
});

/** Format a note date as `Sep 4, 2026`. Dates are calendar days, so format in UTC. */
export function formatDate(value: Date | string | undefined): string | undefined {
	if (value === undefined) return undefined;
	const date = value instanceof Date ? value : new Date(value);
	return Number.isNaN(date.getTime()) ? undefined : DATE_FORMAT.format(date);
}

/** ISO date for `<time datetime>`. */
export function isoDate(value: Date | string | undefined): string | undefined {
	if (value === undefined) return undefined;
	const date = value instanceof Date ? value : new Date(value);
	return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/** `N min read`, rounded up, at least one minute. */
export function readingTime(minutes: number): string {
	return `${Math.max(1, Math.ceil(minutes))} min read`;
}
