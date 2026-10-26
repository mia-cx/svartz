<!--
	A tool's examples: pick one, then see its `tools/call` request and what came
	back. A result with `isError` is a tool that ran and failed; a JSON-RPC
	error means the server rejected the request and no tool ran.
-->
<script lang="ts">
	import { CodePanel, type CodeTab, type ReferenceExamplesProps } from '@svartz/ui/reference/runtime';
	import { callMessage, responseMessage, toolExamples, type McpTool, type McpToolExample } from './mcp.js';

	let { data: tool, context }: ReferenceExamplesProps<McpTool> = $props();

	const uid = $props.id();
	const examples = $derived(toolExamples(tool, context.schemas));
	let chosen = $state(0);
	const example = $derived(examples[Math.min(chosen, examples.length - 1)]!);
	const titleOf = (candidate: McpToolExample, index: number) => candidate.title ?? `Example ${index + 1}`;

	function outcome(candidate: McpToolExample): Pick<CodeTab, 'badge' | 'caption'> {
		if (candidate.error) {
			return { badge: { label: 'JSON-RPC error', hue: 'red' }, caption: `Code ${candidate.error.code}. The server rejected the call, so no tool ran.` };
		}
		if (candidate.result?.isError) return { badge: { label: 'Tool error', hue: 'amber' }, caption: 'The tool ran and failed: isError is true.' };
		return { badge: { label: 'Result', hue: 'green' } };
	}

	const response = $derived(responseMessage(example));
</script>

{#if examples.length > 1}
	<div class="picker">
		<label class="sv-label" for="{uid}-example">Example</label>
		<select id="{uid}-example" bind:value={chosen}>
			{#each examples as candidate, index (index)}<option value={index}>{titleOf(candidate, index)}</option>{/each}
		</select>
	</div>
{/if}

<CodePanel title="Request" tabs={[{ id: 'request', label: 'tools/call', code: callMessage(tool, example) }]} />
{#if response}
	<CodePanel title="Response" tabs={[{ id: 'response', label: 'JSON-RPC', code: response, ...outcome(example) }]} />
{/if}

<style>
	.picker {
		display: flex;
		align-items: center;
		gap: var(--sv-space-3);
		margin-block-end: var(--sv-space-3);
	}

	select {
		flex: 1;
		min-inline-size: 0;
		padding: var(--sv-space-1) var(--sv-space-2);
		border: var(--sv-rule-width) solid var(--sv-rule);
		border-radius: var(--sv-radius-m);
		background: var(--sv-paper);
		color: var(--sv-ink);
		font: inherit;
		font-size: var(--sv-step--1);
	}
</style>
