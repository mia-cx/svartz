import { defineRenderer, schemaRenderer } from '@svartz/ui/reference/runtime';
import { graphqlBadge, GRAPHQL_KINDS, HTTP_METHODS, methodBadge, readOperation, WEBSOCKET_BADGE } from './api.js';
import GraphqlExamples from './GraphqlExamples.svelte';
import GraphqlPage from './GraphqlPage.svelte';
import HttpPage from './HttpPage.svelte';
import RestExamples from './RestExamples.svelte';
import WebSocketExamples from './WebSocketExamples.svelte';

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
	page: HttpPage,
	examples: RestExamples
});

/** `operation.protocol: websocket`: one WebSocket endpoint per page, listed after the path's HTTP methods. */
export const websocketRenderer = defineRenderer({
	id: 'websocket',
	read: (properties) => {
		const operation = readOperation(properties);
		return operation?.protocol === 'websocket' ? operation : undefined;
	},
	nav: (operation) => ({ badge: WEBSOCKET_BADGE, label: operation.path, sort: [1, operation.path, METHOD_ORDER.length] }),
	page: HttpPage,
	examples: WebSocketExamples
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

/** REST endpoints, WebSockets, GraphQL operations, and shared schemas. */
export const apiRenderers = [restRenderer, websocketRenderer, graphqlRenderer, schemaRenderer] as const;
