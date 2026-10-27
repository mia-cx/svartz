<!--
	A REST operation's reference column: method and path, auth, the note's own
	Markdown, parameters by location, the request body, and each response.
-->
<script lang="ts">
	import { DescText } from '@svartz/ui';
	import { AuthSummary, EndpointBar, ReferenceSection, SchemaTree, type ReferencePageProps } from '@svartz/ui/reference/runtime';
	import { fieldsSchema, methodBadge, type ApiParameter, type RestOperation } from './api.js';

	let { data: operation, context, children }: ReferencePageProps<RestOperation> = $props();

	const LOCATION_TITLES = { path: 'Path parameters', query: 'Query parameters', header: 'Headers', cookie: 'Cookies' } as const;
	const entries = $derived(context.vault.entries);
	const groups = $derived(
		(Object.keys(LOCATION_TITLES) as ApiParameter['in'][])
			.map((location) => ({ location, rows: operation.parameters.filter((parameter) => parameter.in === location) }))
			.filter((group) => group.rows.length > 0)
	);
	const statusHue = (status: string) => (status.startsWith('2') ? 'green' : status.startsWith('4') || status.startsWith('5') ? 'red' : 'amber');
</script>

<header class="head">
	<h1>{context.entry.title}</h1>
	<EndpointBar badge={methodBadge(operation.method)} code={operation.path} copyLabel="Copy path" />
	{#if operation.auth}<AuthSummary auth={operation.auth} {entries} />{/if}
</header>

{@render children()}

{#each groups as group (group.location)}
	<ReferenceSection id="params-{group.location}" title={LOCATION_TITLES[group.location]}>
		<SchemaTree schema={fieldsSchema(group.rows)} schemaHref={context.schemaHref} {entries} />
	</ReferenceSection>
{/each}

{#if operation.requestBody?.schema}
	<ReferenceSection id="request-body" title="Request body" note={operation.requestBody.contentType}>
		<SchemaTree schema={operation.requestBody.schema} schemaHref={context.schemaHref} {entries} />
	</ReferenceSection>
{/if}

{#if operation.responses.length > 0}
	<ReferenceSection id="responses" title="Responses">
		{#each operation.responses as response (response.status)}
			<details class="response" open={response.status.startsWith('2')}>
				<summary>
					<span class="status" data-sv-signal style:--sv-hue="var(--sv-hue-{statusHue(response.status)})">{response.status}</span>
					<span>{#if response.description}<DescText value={response.description} {entries} />{/if}</span>
					{#if response.contentType}<code class="media">{response.contentType}</code>{/if}
				</summary>
				{#if response.schema}
					<div class="response-body"><SchemaTree schema={response.schema} schemaHref={context.schemaHref} {entries} /></div>
				{/if}
			</details>
		{/each}
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
	}

	.head :global(.auth) {
		margin: 0;
	}

	.response {
		border-block-end: var(--sv-rule-width) solid var(--sv-rule);
	}

	.response summary {
		display: flex;
		align-items: center;
		gap: var(--sv-space-3);
		padding-block: var(--sv-space-2);
		font-size: var(--sv-step--1);
		cursor: pointer;
		list-style: none;
	}

	.response summary::-webkit-details-marker {
		display: none;
	}

	.status {
		/* Matches the reference badges: darker in light mode, for small text at 4.5:1. */
		--sv-signal: light-dark(oklch(0.46 0.13 var(--sv-hue)), oklch(0.78 0.12 var(--sv-hue)));
		flex: none;
		min-inline-size: 3em;
		padding: 0.05em 0.45em;
		border-radius: var(--sv-radius-s);
		background: var(--sv-signal-soft);
		color: var(--sv-signal);
		font-family: var(--sv-font-mono);
		font-weight: 600;
		text-align: center;
	}

	.media {
		margin-inline-start: auto;
		color: var(--sv-muted);
		font-family: var(--sv-font-mono);
		font-size: 0.92em;
		overflow-wrap: anywhere;
	}

	.response-body {
		padding: 0 0 var(--sv-space-3) var(--sv-space-4);
	}
</style>
