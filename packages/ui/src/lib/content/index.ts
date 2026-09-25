import Callout from './Callout.svelte';
import CodeBlock from './CodeBlock.svelte';
import Embed from './Embed.svelte';
import Link from './Link.svelte';

export { Callout, CodeBlock, Embed, Link };
export { CALLOUT_TYPES, resolveCallout, type CalloutType, type ResolvedCallout } from './callouts.js';
export { classifyLink, type LinkKind } from './links.js';

/**
 * The shared OFM content slots, ready to spread into a theme's `components`.
 * Pair with `prose.css` on the element that wraps the note body.
 */
export const svartzContentComponents = {
	callout: { default: Callout },
	codeBlock: { default: CodeBlock },
	link: { default: Link },
	embed: { default: Embed }
} as const;
