<script lang="ts">
	// Deep imports: the package barrel pulls every icon into SSR.
	import Bug from '@lucide/svelte/icons/bug';
	import Check from '@lucide/svelte/icons/check';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import CircleQuestionMark from '@lucide/svelte/icons/circle-question-mark';
	import ClipboardList from '@lucide/svelte/icons/clipboard-list';
	import Flame from '@lucide/svelte/icons/flame';
	import Info from '@lucide/svelte/icons/info';
	import List from '@lucide/svelte/icons/list';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Quote from '@lucide/svelte/icons/quote';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import X from '@lucide/svelte/icons/x';
	import Zap from '@lucide/svelte/icons/zap';
	import type { CalloutIcon } from './callouts.js';

	let { icon }: { icon: CalloutIcon } = $props();

	const ICONS = {
		pencil: Pencil,
		'clipboard-list': ClipboardList,
		info: Info,
		'circle-check': CircleCheck,
		flame: Flame,
		check: Check,
		'circle-help': CircleQuestionMark,
		'triangle-alert': TriangleAlert,
		x: X,
		zap: Zap,
		bug: Bug,
		list: List,
		quote: Quote
	} satisfies Record<CalloutIcon, unknown>;

	const Icon = $derived(ICONS[icon]);
</script>

<Icon size="1em" strokeWidth={1.75} />
