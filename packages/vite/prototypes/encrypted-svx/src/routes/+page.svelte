<script>
  import { onDestroy, onMount } from 'svelte';
  import { base } from '$app/paths';
  import { unlock, resetSession, hasSession } from '$lib/unlock.js';
  let password = $state('');
  let status = $state('Locked');
  let target;
  let dispose;
  let busy = $state(false);
  let sessionAvailable = $state(false);
  let disposed = false;

  async function open() {
    busy = true;
    status = 'Unlocking';
    try {
      const cleanup = await unlock(base + '/protected/note.json', password, target);
      if (disposed) await cleanup();
      else { dispose = cleanup; status = 'Unlocked'; }
    } catch (error) {
      status = error.name === 'OperationError' ? 'Incorrect password or damaged content' : error.message;
    } finally {
      password = '';
      busy = false;
      sessionAvailable = hasSession();
    }
  }
  async function lock() {
    await dispose?.();
    dispose = undefined;
    resetSession();
    sessionAvailable = false;
    status = 'Locked';
  }
  onDestroy(() => { disposed = true; void dispose?.(); });
  onMount(() => { sessionAvailable = hasSession(); });
</script>
<svelte:head><title>Encrypted SVX prototype</title></svelte:head>
<h1>Encrypted SVX prototype</h1>
<p>Can a static site unlock an interactive note without publishing its plaintext?</p>
<form onsubmit={(event) => { event.preventDefault(); void open(); }}>
  <label>Password <input type="password" bind:value={password} autocomplete="off" /></label>
  <button disabled={busy || status === 'Unlocked'}>Unlock</button>
  <button type="button" onclick={lock} disabled={busy}>Lock</button>
</form>
<p role="status">{status}</p>
<p>Session group available: {sessionAvailable ? 'yes' : 'no'}</p>
<div bind:this={target}></div>
