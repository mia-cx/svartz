<!--
	The reference column for an operation: method and path, auth, parameters by
	location, request body, and responses with their schemas. GraphQL operations
	show arguments and the return type. The note's Markdown renders after the header.
-->
<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import Copy from '@lucide/svelte/icons/copy';
	import type { IndexEntry } from '@svartz/core';
	import { DescText } from '@svartz/ui';
	import type { Snippet } from 'svelte';
	import MethodPill from './MethodPill.svelte';
	import SchemaTree from './SchemaTree.svelte';
	import type { ApiOperation, ApiParameter } from '../api.js';

	let {
		operation,
		title,
		modelHref,
		entries,
		children
	}: {
		operation: ApiOperation;
		title: string;
		modelHref: (name: string) => string | undefined;
		entries: readonly IndexEntry[];
		children?: Snippet;
	} = $props();

	const LOCATION_TITLES = { path: 'Path parameters', query: 'Query parameters', header: 'Headers', cookie: 'Cookies' } as const;
	const COPIED_MS = 1600;

	const groups = $derived(
		operation.protocol === 'rest'
			? (Object.keys(LOCATION_TITLES) as ApiParameter['in'][])
					.map((location) => ({ location, rows: operation.parameters.filter((parameter) => parameter.in === location) }))
					.filter((group) => group.rows.length > 0)
			: []
	);
	const returnsRef = $derived(
		operation.protocol === 'graphql' && operation.returns ? operation.returns.replace(/[[\]!]/g, '') : undefined
	);

	let copied = $state(false);
	async function copyPath() {
		if (operation.protocol !== 'rest') return;
		await navigator.clipboard.writeText(operation.path);
		copied = true;
		setTimeout(() => (copied = false), COPIED_MS);
	}
</script>

<header class="op-head">
	<h1>{title}</h1>
	<div class="endpoint">
		<MethodPill {operation} />
		{#if operation.protocol === 'rest'}
			<code class="path">{operation.path}</code>
			<button class="sv-icon-button" type="button" onclick={copyPath} aria-label={copied ? 'Copied' : 'Copy path'}>
				{#if copied}<Check aria-hidden="true" />{:else}<Copy aria-hidden="true" />{/if}
			</button>
		{:else}
			<code class="path">{operation.name}</code>
		{/if}
	</div>
	{#if operation.protocol === 'rest' && operation.auth}
		<p class="auth"><span class="sv-label">Auth</span> {operation.auth === 'none' ? 'None' : operation.auth === 'bearer' ? 'Bearer token' : operation.auth}</p>
	{/if}
</header>

{@render children?.()}

{#snippet table(rows: readonly { name: string; type?: string; required: boolean; description?: string }[])}
	<ul class="params">
		{#each rows as row (row.name)}
			<li>
				<div class="row">
					<code class="name">{row.name}</code>
					{#if row.type}<code class="type">{row.type}</code>{/if}
					{#if row.required}<span class="required">required</span>{/if}
				</div>
				{#if row.description}<p><DescText value={row.description} {entries} /></p>{/if}
			</li>
		{/each}
	</ul>
{/snippet}

{#if operation.protocol === 'rest'}
	{#each groups as group (group.location)}
		<section aria-labelledby="params-{group.location}">
			<h2 id="params-{group.location}">{LOCATION_TITLES[group.location]}</h2>
			{@render table(group.rows)}
		</section>
	{/each}

	{#if operation.requestBody?.schema}
		<section aria-labelledby="request-body">
			<h2 id="request-body">Request body <span class="content-type">{operation.requestBody.contentType}</span></h2>
			<SchemaTree schema={operation.requestBody.schema} {modelHref} {entries} />
		</section>
	{/if}

	{#if operation.responses.length > 0}
		<section aria-labelledby="responses">
			<h2 id="responses">Responses</h2>
			{#each operation.responses as response (response.status)}
				<details class="response" open={response.status.startsWith('2')}>
					<summary>
						<span class="status" data-sv-signal style:--sv-hue="var(--sv-hue-{response.status.startsWith('2') ? 'green' : response.status.startsWith('4') || response.status.startsWith('5') ? 'red' : 'amber'})">{response.status}</span>
						<span>{#if response.description}<DescText value={response.description} {entries} />{/if}</span>
					</summary>
					{#if response.schema}<div class="response-body"><SchemaTree schema={response.schema} {modelHref} {entries} /></div>{/if}
				</details>
			{/each}
		</section>
	{/if}
{:else}
	{#if operation.args.length > 0}
		<section aria-labelledby="arguments">
			<h2 id="arguments">Arguments</h2>
			{@render table(operation.args)}
		</section>
	{/if}
	{#if operation.returns}
		<section aria-labelledby="returns">
			<h2 id="returns">Returns</h2>
			<p>
				{#if returnsRef && modelHref(returnsRef)}<a class="type-link" href={modelHref(returnsRef)} data-sv-internal>{operation.returns.replace(/\[\[|\]\]/g, '')}</a>{:else}<code>{operation.returns.replace(/\[\[|\]\]/g, '')}</code>{/if}
			</p>
		</section>
	{/if}
{/if}

<style>
	.op-head {
		margin-block-end: var(--sv-space-5);
	}

	h1 {
		margin: 0 0 var(--sv-space-3);
		color: var(--sv-ink);
		font-size: var(--sv-step-4);
		font-weight: 700;
		letter-spacing: -0.02em;
		line-height: 1.1;
	}

	.endpoint {
		display: flex;
		align-items: center;
		gap: var(--sv-space-3);
		padding: var(--sv-space-2) var(--sv-space-2) var(--sv-space-2) var(--sv-space-3);
		border: var(--sv-rule-width) solid var(--sv-rule);
		border-radius: var(--sv-radius-m);
		background: var(--sv-surface);
	}

	.path {
		flex: 1;
		overflow-x: auto;
		color: var(--sv-ink);
		font-family: var(--sv-font-mono);
		font-size: 0.92rem;
		white-space: nowrap;
	}

	.auth {
		display: flex;
		align-items: baseline;
		gap: var(--sv-space-2);
		margin: var(--sv-space-3) 0 0;
		font-size: var(--sv-step--1);
	}

	section {
		margin-block-start: var(--sv-space-6);
	}

	h2 {
		display: flex;
		align-items: baseline;
		gap: var(--sv-space-3);
		margin: 0 0 var(--sv-space-2);
		padding-block-end: var(--sv-space-1);
		border-block-end: var(--sv-rule-width) solid var(--sv-rule-strong);
		color: var(--sv-ink);
		font-size: var(--sv-step-1);
		font-weight: 700;
	}

	.content-type {
		color: var(--sv-muted);
		font-family: var(--sv-font-mono);
		font-size: 0.75rem;
		font-weight: 400;
	}

	.params {
		margin: 0;
		padding: 0;
		list-style: none;
		font-size: var(--sv-step--1);
	}

	.params li {
		padding-block: var(--sv-space-2);
		border-block-end: var(--sv-rule-width) solid var(--sv-rule);
	}

	.params p {
		margin: var(--sv-space-1) 0 0;
	}

	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--sv-space-2);
	}

	.name {
		color: var(--sv-ink);
		font-family: var(--sv-font-mono);
		font-weight: 600;
	}

	.type {
		color: var(--sv-muted);
		font-family: var(--sv-font-mono);
		font-size: 0.92em;
	}

	.required {
		color: var(--sv-accent-text);
		font-size: var(--sv-label-size);
		font-weight: 700;
		letter-spacing: var(--sv-label-tracking);
		text-transform: uppercase;
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
		min-inline-size: 3em;
		padding: 0.05em 0.45em;
		border-radius: var(--sv-radius-s);
		background: var(--sv-signal-soft);
		color: var(--sv-signal);
		font-family: var(--sv-font-mono);
		font-weight: 600;
		text-align: center;
	}

	.response-body {
		padding: 0 0 var(--sv-space-3) var(--sv-space-4);
	}

	.type-link {
		color: var(--sv-accent-text);
		font-family: var(--sv-font-mono);
	}
</style>
