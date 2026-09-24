<script>
  import { base } from '$app/paths';
  import { setContext } from 'svelte';
  import { setHostContext } from '$lib/host-context.js';
  import HostBadge from '$lib/HostBadge.svelte';
  const host = $state({ count: 0, navigationHooks: 0, disposals: 0 });
  setContext('host-state', host);
  setHostContext(host);
  let { children } = $props();
</script>
<nav><a href={base + '/'}>Locked note</a> · <a href={base + '/away/'}>Public page</a></nav>
<button onclick={() => { host.count++; }}>Increment host</button>
<HostBadge location="host" />
<p data-host="hooks">Host observed navigation hooks: {host.navigationHooks}</p>
<p data-host="disposals">Host observed disposals: {host.disposals}</p>
<main>{@render children()}</main>
<style>
  :global(body) { font-family: system-ui, sans-serif; max-width: 50rem; margin: 3rem auto; padding: 1rem; }
  nav { margin-bottom: 2rem; }
  :global(button), :global(input) { font: inherit; padding: .5rem; }
</style>
