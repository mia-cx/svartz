<script lang="ts">
	import {
		Bug,
		Check,
		CircleCheck,
		CircleQuestionMark,
		ClipboardList,
		Flame,
		Info,
		List,
		Pencil,
		Quote,
		TriangleAlert,
		X,
		Zap
	} from '@lucide/svelte';
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
