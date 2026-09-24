<script lang="ts">
	import { base } from '$app/paths';
	import { onMount } from 'svelte';
	import type { ProtectedGroupPayload } from '@svartz/core';
	import {
		isProtectedGroupUnlocked,
		lockProtectedGroup,
		protectedAssets,
		unlockProtectedNote,
		type ProtectedNoteReference,
		type UnlockedNote
	} from './protected-client.js';

	let {
		protection,
		loadBridgeUrls,
		onUnlocked,
		onLocked,
		...noteProps
	}: {
		protection: ProtectedNoteReference;
		loadBridgeUrls: (ids: readonly string[]) => Promise<Readonly<Record<string, string>>>;
		onUnlocked: (id: string, payload: ProtectedGroupPayload) => void;
		onLocked: (id: string) => void;
		[key: string]: unknown;
	} = $props();
	let password = $state('');
	let busy = $state(false);
	let error = $state('');
	let unlocked = $state<UnlockedNote>();
	const NoteComponent = $derived(unlocked?.component);
	const reference = $derived({ ...protection, payloadPath: `${base}${protection.payloadPath}` });

	async function unlock(secret: string): Promise<void> {
		busy = true;
		error = '';
		try {
			unlocked = await unlockProtectedNote(reference, secret, loadBridgeUrls);
			onUnlocked(protection.payloadId, unlocked.payload);
			password = '';
		} catch (cause) {
			error =
				cause instanceof Error && cause.message
					? cause.message
					: 'Incorrect password or damaged note.';
		} finally {
			busy = false;
		}
	}

	onMount(() => {
		if (isProtectedGroupUnlocked(protection.payloadId)) void unlock('');
	});

	$effect(() => {
		if (!unlocked?.css) return;
		const style = document.createElement('style');
		style.textContent = unlocked.css;
		document.head.append(style);
		return () => style.remove();
	});
</script>

{#if NoteComponent}
	<div use:protectedAssets={unlocked!.assets}><NoteComponent {...noteProps} /></div>
	<button
		type="button"
		tabindex="0"
		aria-label="Lock note"
		onclick={() => {
			lockProtectedGroup(protection.payloadId);
			onLocked(protection.payloadId);
			unlocked = undefined;
		}}>Lock note</button
	>
{:else}
	<form
		onsubmit={(event) => {
			event.preventDefault();
			void unlock(password);
		}}
	>
		<label>Password
			<input
				type="password"
				tabindex="0"
				aria-label="Password"
				autocomplete="current-password"
				bind:value={password}
				required
			/>
		</label>
		<button type="submit" tabindex="0" aria-label={busy ? 'Unlocking note' : 'Unlock note'} disabled={busy}>{busy ? 'Unlocking…' : 'Unlock note'}</button>
		{#if error}<p role="alert">{error}</p>{/if}
	</form>
{/if}
