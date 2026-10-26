import { defineRenderer, schemaRenderer } from '@svartz/ui/reference/runtime';
import { graphqlBadge, GRAPHQL_KINDS, HTTP_METHODS, methodBadge, readOperation } from './api.js';
import GraphqlExamples from './GraphqlExamples.svelte';
import GraphqlPage from './GraphqlPage.svelte';
import RestExamples from './RestExamples.svelte';
import RestPage from './RestPage.svelte';

const METHOD_ORDER = Object.keys(HTTP_METHODS);
const KIND_ORDER = Object.keys(GRAPHQL_KINDS);

/** `operation.protocol: rest` (the default): one HTTP endpoint per page. */
export const restRenderer = defineRenderer({
	id: 'rest',
	read: (properties) => {
		const operation = readOperation(properties);
		return operation?.protocol === 'rest' ? operation : undefined;
	},
	nav: (operation) => ({ badge: methodBadge(operation.method), label: operation.path, sort: [1, operation.path, METHOD_ORDER.indexOf(operation.method)] }),
	page: RestPage,
	examples: RestExamples
});

/** `operation.protocol: graphql`: one query, mutation, or subscription field per page. */
export const graphqlRenderer = defineRenderer({
	id: 'graphql',
	read: (properties) => {
		const operation = readOperation(properties);
		return operation?.protocol === 'graphql' ? operation : undefined;
	},
	nav: (operation) => ({ badge: graphqlBadge(operation.kind, true), label: operation.name, sort: [1, operation.name, KIND_ORDER.indexOf(operation.kind)] }),
	page: GraphqlPage,
	examples: GraphqlExamples
});

/** REST endpoints, GraphQL operations, and shared schemas. */
export const apiRenderers = [restRenderer, graphqlRenderer, schemaRenderer] as const;
