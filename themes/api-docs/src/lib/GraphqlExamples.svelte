<!-- A GraphQL operation's examples: the endpoint, the query and its variables, then the response. -->
<script lang="ts">
	import { CodePanel, type ReferenceExamplesProps } from '@svartz/ui/reference/runtime';
	import { graphqlQuery, type GraphqlOperation } from './api.js';
	import { apiSettings } from './settings.js';

	let { data: operation, context }: ReferenceExamplesProps<GraphqlOperation> = $props();

	const json = (value: unknown) => JSON.stringify(value, null, 2);
	const endpoint = $derived(apiSettings(context.themeConfig).graphqlEndpoint);
	const requestTabs = $derived([
		{ id: 'graphql', label: 'Query', code: graphqlQuery(operation) },
		...(operation.example?.variables === undefined ? [] : [{ id: 'variables', label: 'Variables', code: json(operation.example.variables) }])
	]);
</script>

<p class="endpoint"><span class="sv-label">POST</span> <code>{endpoint}</code></p>
<CodePanel title="Request" tabs={requestTabs} />
{#if operation.example?.response !== undefined}
	<CodePanel title="Response" tabs={[{ id: 'response', label: 'JSON', code: json(operation.example.response) }]} />
{/if}

<style>
	.endpoint {
		display: flex;
		align-items: baseline;
		gap: var(--sv-space-2);
		margin: 0 0 var(--sv-space-2);
		font-size: var(--sv-step--1);
	}

	.endpoint code {
		color: var(--sv-ink);
		font-family: var(--sv-font-mono);
		overflow-wrap: anywhere;
	}
</style>
