<!--
	The examples column: the request in the reader's language (remembered) and a
	response example per status. GraphQL shows the query, variables, and response.
-->
<script lang="ts">
	import CodePanel from './CodePanel.svelte';
	import {
		exampleFromSchema,
		requestSnippets,
		SNIPPET_LANGUAGES,
		type ApiOperation,
		type SchemaNode
	} from '../api.js';

	let {
		operation,
		baseUrl,
		graphqlEndpoint,
		models
	}: {
		operation: ApiOperation;
		baseUrl: string;
		graphqlEndpoint: string;
		models: Readonly<Record<string, SchemaNode>>;
	} = $props();

	const LANGUAGE_KEY = 'svartz:api-language';
	const json = (value: unknown) => JSON.stringify(value, null, 2);

	const requestTabs = $derived.by(() => {
		if (operation.protocol === 'rest') {
			const snippets = requestSnippets(operation, baseUrl, models);
			return SNIPPET_LANGUAGES.map((language) => ({ id: language.id, label: language.label, code: snippets[language.id] }));
		}
		const query =
			operation.example?.query ??
			`${operation.kind} {\n  ${operation.name}${operation.args.length ? `(${operation.args.map((arg) => `${arg.name}: $${arg.name}`).join(', ')})` : ''} {\n    id\n  }\n}`;
		const tabs = [{ id: 'graphql', label: 'Query', code: query }];
		if (operation.example?.variables !== undefined) tabs.push({ id: 'variables', label: 'Variables', code: json(operation.example.variables) });
		return tabs;
	});

	const responseTabs = $derived.by(() => {
		if (operation.protocol === 'graphql') {
			return operation.example?.response === undefined
				? []
				: [{ id: 'response', label: 'JSON', code: json(operation.example.response) }];
		}
		return operation.responses
			.map((response) => ({
				id: response.status,
				label: response.status,
				code:
					response.example !== undefined
						? json(response.example)
						: response.schema
							? json(exampleFromSchema(response.schema, models))
							: ''
			}))
			.filter((tab) => tab.code);
	});
</script>

<div class="examples">
	{#if operation.protocol === 'graphql'}<p class="endpoint"><span class="sv-label">POST</span> <code>{graphqlEndpoint}</code></p>{/if}
	<CodePanel title="Request" tabs={requestTabs} remember={operation.protocol === 'rest' ? LANGUAGE_KEY : undefined} />
	{#if responseTabs.length > 0}<CodePanel title="Response" tabs={responseTabs} />{/if}
</div>

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
