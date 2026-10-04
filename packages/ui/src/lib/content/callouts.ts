/** Obsidian's built-in callout types. Each owns an icon and a signal hue. */
export const CALLOUT_TYPES = {
	note: { hue: 'blue', icon: 'pencil' },
	abstract: { hue: 'teal', icon: 'clipboard-list' },
	info: { hue: 'cyan', icon: 'info' },
	todo: { hue: 'cyan', icon: 'circle-check' },
	tip: { hue: 'teal', icon: 'flame' },
	success: { hue: 'green', icon: 'check' },
	question: { hue: 'amber', icon: 'circle-help' },
	warning: { hue: 'orange', icon: 'triangle-alert' },
	failure: { hue: 'red', icon: 'x' },
	danger: { hue: 'red', icon: 'zap' },
	bug: { hue: 'red', icon: 'bug' },
	example: { hue: 'violet', icon: 'list' },
	quote: { hue: 'neutral', icon: 'quote' }
} as const;

export type CalloutType = keyof typeof CALLOUT_TYPES;
export type CalloutHue = (typeof CALLOUT_TYPES)[CalloutType]['hue'];
export type CalloutIcon = (typeof CALLOUT_TYPES)[CalloutType]['icon'];

const ALIASES: Record<string, CalloutType> = {
	summary: 'abstract',
	tldr: 'abstract',
	hint: 'tip',
	important: 'tip',
	check: 'success',
	done: 'success',
	help: 'question',
	faq: 'question',
	caution: 'warning',
	attention: 'warning',
	fail: 'failure',
	missing: 'failure',
	error: 'danger',
	cite: 'quote'
};

export interface ResolvedCallout {
	readonly type: CalloutType;
	readonly hue: CalloutHue;
	readonly icon: CalloutIcon;
	readonly title: string;
}

const isCalloutType = (value: string): value is CalloutType => value in CALLOUT_TYPES;

/**
 * Resolve an author-written callout type (`[!faq]`, `[!my-idea]`) to its canonical
 * type, styling, and title. Unknown types render as notes but keep their own title.
 */
export function resolveCallout(rawType: string, title?: string): ResolvedCallout {
	const key = rawType.toLowerCase();
	const type = isCalloutType(key) ? key : (ALIASES[key] ?? 'note');
	const words = key.replace(/[-_]+/g, ' ').trim();
	return {
		type,
		...CALLOUT_TYPES[type],
		title: title?.trim() || words.charAt(0).toUpperCase() + words.slice(1)
	};
}
