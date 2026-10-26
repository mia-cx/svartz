<!--
	An MCP tool's reference column: the tool name, the server it's called on,
	auth, the note's Markdown, then its input, output, and annotations.
-->
<script lang="ts">
	import { AuthSummary, EndpointBar, ReferenceSection, SchemaTree, type ReferencePageProps } from '@svartz/ui/reference/runtime';
	import { declaredHints, endpointUrl, TOOL_BADGE, type McpTool } from './mcp.js';

	let { data: tool, context, children }: ReferencePageProps<McpTool> = $props();

	const entries = $derived(context.vault.entries);
	const server = $derived(endpointUrl(tool.endpoint, context.themeConfig));
	const hints = $derived(declaredHints(tool.annotations));
	const takesArguments = $derived.by(() => {
		const input = tool.inputSchema;
		return Boolean(input.properties?.length || input.ref || input.values || input.oneOf?.length || input.anyOf?.length);
	});
</script>

<header class="head">
	<h1>{context.entry.title}</h1>
	<EndpointBar badge={TOOL_BADGE} code={tool.name} copyLabel="Copy tool name" />
	{#if server || tool.title}
		<dl class="facts">
			{#if server}<div><dt class="sv-label">Server</dt><dd><code>{server}</code></dd></div>{/if}
			{#if tool.title && tool.title !== context.entry.title}<div><dt class="sv-label">Display name</dt><dd>{tool.title}</dd></div>{/if}
		</dl>
	{/if}
	{#if tool.auth}<AuthSummary auth={tool.auth} {entries} />{/if}
</header>

{@render children()}

<ReferenceSection id="input" title="Input" note="arguments">
	{#if takesArguments}
		<SchemaTree schema={tool.inputSchema} schemaHref={context.schemaHref} {entries} />
	{:else}
		<p class="empty">Takes no arguments.</p>
	{/if}
</ReferenceSection>

{#if tool.outputSchema}
	<ReferenceSection id="output" title="Output" note="structuredContent">
		<SchemaTree schema={tool.outputSchema} schemaHref={context.schemaHref} {entries} />
	</ReferenceSection>
{/if}

{#if hints.length > 0}
	<ReferenceSection id="annotations" title="Annotations">
		<p class="lede">Hints the server declares about the tool. They are not guarantees.</p>
		<dl class="hints">
			{#each hints as [hint, value] (hint)}
				<div><dt><code>{hint}</code></dt><dd><code>{value}</code></dd></div>
			{/each}
		</dl>
	</ReferenceSection>
{/if}

<style>
	.head {
		display: grid;
		gap: var(--sv-space-3);
		margin-block-end: var(--sv-space-4);
	}

	h1 {
		margin: 0;
		color: var(--sv-ink);
		font-size: var(--sv-step-4);
		font-weight: 700;
		line-height: 1.1;
		overflow-wrap: anywhere;
	}

	.head :global(.auth) {
		margin: 0;
	}

	.facts,
	.hints {
		display: grid;
		gap: var(--sv-space-1);
		margin: 0;
		font-size: var(--sv-step--1);
	}

	.facts div,
	.hints div {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--sv-space-1) var(--sv-space-3);
	}

	dd {
		min-inline-size: 0;
		margin: 0;
		color: var(--sv-text);
	}

	code {
		color: var(--sv-ink);
		font-family: var(--sv-font-mono);
		overflow-wrap: anywhere;
	}

	.hints div {
		padding-block: var(--sv-space-2);
		border-block-end: var(--sv-rule-width) solid var(--sv-rule);
	}

	.hints dt code {
		font-weight: 600;
	}

	.lede {
		margin: 0 0 var(--sv-space-1);
		color: var(--sv-muted);
		font-size: var(--sv-step--1);
	}

	.empty {
		margin: 0;
		color: var(--sv-text);
		font-size: var(--sv-step--1);
	}
</style>
