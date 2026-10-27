<!--
	A WebSocket's examples: connecting in the reader's language (remembered with
	the REST languages), each message by direction, then the upgrade's responses.
-->
<script lang="ts">
	import { CodePanel, type CodeTab, type ReferenceExamplesProps } from '@svartz/ui/reference/runtime';
	import { frameText, messageExample, responseTabs, SOCKET_LANGUAGES, socketSnippets, type WebSocketOperation } from './api.js';
	import { apiSettings } from './settings.js';

	let { data: operation, context }: ReferenceExamplesProps<WebSocketOperation> = $props();

	const LANGUAGE_KEY = 'svartz:api-language';

	const connectTabs = $derived.by(() => {
		const snippets = socketSnippets(operation, apiSettings(context.themeConfig).baseUrl, context.schemas);
		return SOCKET_LANGUAGES.map((language) => ({ id: language.id, label: language.label, code: snippets[language.id] }));
	});
	const messageTabs = (direction: 'send' | 'receive') =>
		operation.messages.flatMap((message): CodeTab[] => {
			if (message.direction !== direction) return [];
			const example = messageExample(message, context.schemas);
			return example === undefined ? [] : [{ id: message.name, label: message.name, code: frameText(example, 2) }];
		});
	const sent = $derived(messageTabs('send'));
	const received = $derived(messageTabs('receive'));
	const responses = $derived(responseTabs(operation.responses, context.schemas));
</script>

<CodePanel title="Connect" tabs={connectTabs} remember={LANGUAGE_KEY} />
{#if sent.length > 0}<CodePanel title="Send" tabs={sent} />{/if}
{#if received.length > 0}<CodePanel title="Receive" tabs={received} />{/if}
{#if responses.length > 0}<CodePanel title="Handshake" tabs={responses} />{/if}
