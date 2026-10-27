<!--
	A REST or WebSocket endpoint's reference column: badge and path, auth, the
	note's own Markdown, parameters by location, the request body, and each
	response. A WebSocket's responses answer its upgrade, followed by the
	messages it sends and receives and the codes it closes with.
-->
<script lang="ts">
	import { DescText } from '@svartz/ui';
	import { AuthSummary, Badge, EndpointBar, ReferenceSection, SchemaTree, type ReferenceBadge, type ReferencePageProps } from '@svartz/ui/reference/runtime';
	import { endpointBadge, fieldsSchema, type ApiParameter, type RestOperation, type WebSocketOperation } from './api.js';

	let { data: operation, context, children }: ReferencePageProps<RestOperation | WebSocketOperation> = $props();

	const LOCATION_TITLES = { path: 'Path parameters', query: 'Query parameters', header: 'Headers', cookie: 'Cookies' } as const;
	const DIRECTION_BADGES: Record<'send' | 'receive', ReferenceBadge> = { send: { label: 'SEND', hue: 'blue' }, receive: { label: 'RECEIVE', hue: 'green' } };
	const NORMAL_CLOSE = new Set(['1000', '1001']);
	const entries = $derived(context.vault.entries);
	const groups = $derived(
		(Object.keys(LOCATION_TITLES) as ApiParameter['in'][])
			.map((location) => ({ location, rows: operation.parameters.filter((parameter) => parameter.in === location) }))
			.filter((group) => group.rows.length > 0)
	);
	const socket = $derived(operation.protocol === 'websocket' ? operation : undefined);
	const requestBody = $derived(operation.protocol === 'rest' ? operation.requestBody : undefined);
	const statusHue = (status: string) =>
		status.startsWith('2') || status === '101' ? 'green' : status.startsWith('4') || status.startsWith('5') ? 'red' : 'amber';
</script>

{#snippet code(value: string, hue: string)}
	<span class="status" data-sv-signal style:--sv-hue="var(--sv-hue-{hue})">{value}</span>
{/snippet}

<header class="head">
	<h1>{context.entry.title}</h1>
	<EndpointBar badge={endpointBadge(operation)} code={operation.path} copyLabel="Copy path" />
	{#if operation.auth}<AuthSummary auth={operation.auth} {entries} />{/if}
</header>

{@render children()}

{#each groups as group (group.location)}
	<ReferenceSection id="params-{group.location}" title={LOCATION_TITLES[group.location]}>
		<SchemaTree schema={fieldsSchema(group.rows)} schemaHref={context.schemaHref} {entries} />
	</ReferenceSection>
{/each}

{#if requestBody?.schema}
	<ReferenceSection id="request-body" title="Request body" note={requestBody.contentType}>
		<SchemaTree schema={requestBody.schema} schemaHref={context.schemaHref} {entries} />
	</ReferenceSection>
{/if}

{#if operation.responses.length > 0}
	<ReferenceSection id="responses" title={socket ? 'Handshake' : 'Responses'}>
		{#each operation.responses as response (response.status)}
			<details class="row" open={response.status.startsWith('2')}>
				<summary class="line">
					{@render code(response.status, statusHue(response.status))}
					<span>{#if response.description}<DescText value={response.description} {entries} />{/if}</span>
					{#if response.contentType}<code class="media">{response.contentType}</code>{/if}
				</summary>
				{#if response.headers.length > 0}
					<ul class="headers">
						{#each response.headers as [name, value] (name)}<li><code>{name}: {value}</code></li>{/each}
					</ul>
				{/if}
				{#if response.schema}
					<div class="row-body"><SchemaTree schema={response.schema} schemaHref={context.schemaHref} {entries} /></div>
				{/if}
			</details>
		{/each}
	</ReferenceSection>
{/if}

{#if socket && socket.messages.length > 0}
	<ReferenceSection id="messages" title="Messages">
		{#each socket.messages as message (`${message.direction} ${message.name}`)}
			<details class="row">
				<summary class="line">
					<Badge badge={DIRECTION_BADGES[message.direction]} fixed />
					<code class="name">{message.name}</code>
					{#if message.description}<span><DescText value={message.description} {entries} /></span>{/if}
				</summary>
				{#if message.schema}
					<div class="row-body"><SchemaTree schema={message.schema} schemaHref={context.schemaHref} {entries} /></div>
				{/if}
			</details>
		{/each}
	</ReferenceSection>
{/if}

{#if socket && socket.close.length > 0}
	<ReferenceSection id="close-codes" title="Close codes">
		{#each socket.close as close (close.code)}
			<div class="row line">
				{@render code(close.code, NORMAL_CLOSE.has(close.code) ? 'green' : 'red')}
				{#if close.description}<span><DescText value={close.description} {entries} /></span>{/if}
			</div>
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

	.row {
		border-block-end: var(--sv-rule-width) solid var(--sv-rule);
	}

	.line {
		display: flex;
		align-items: center;
		gap: var(--sv-space-3);
		padding-block: var(--sv-space-2);
		font-size: var(--sv-step--1);
	}

	summary.line {
		cursor: pointer;
		list-style: none;
	}

	summary.line::-webkit-details-marker {
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

	.name {
		flex: none;
		color: var(--sv-ink);
		font-family: var(--sv-font-mono);
		font-weight: 600;
	}

	.media {
		margin-inline-start: auto;
		color: var(--sv-muted);
		font-family: var(--sv-font-mono);
		font-size: 0.92em;
		overflow-wrap: anywhere;
	}

	.headers {
		margin: 0;
		padding: 0 0 var(--sv-space-3) var(--sv-space-4);
		list-style: none;
		font-family: var(--sv-font-mono);
		font-size: var(--sv-step--1);
		overflow-wrap: anywhere;
	}

	.row-body {
		padding: 0 0 var(--sv-space-3) var(--sv-space-4);
	}
</style>
