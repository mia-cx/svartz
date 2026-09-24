<script>
  import { getContext, onDestroy } from 'svelte';
  import { page } from '$app/state';
  import { goto, afterNavigate } from '$app/navigation';
  import { base } from '$app/paths';
  import { getHostContext } from '$lib/host-context.js';
  import HostBadge from '../src/lib/HostBadge.svelte';
  let { input, onAction } = $props();
  const host = getContext('host-state');
  const typedHost = getHostContext();
  let navigationCount = $state(0);
  afterNavigate(() => { navigationCount++; host.navigationHooks++; });
  onDestroy(() => { host.disposals++; });
</script>
<h2>SVX_SECRET_HOST_89ae12</h2>
<p data-probe="prop">Prop: {input.label}</p>
<p data-probe="context">Context: {host.count}</p>
<p data-probe="context-identity">Shared context identity: {host === typedHost ? 'yes' : 'no'}</p>
<p data-probe="router">Route: {page.url.pathname}?step={page.url.searchParams.get('step') ?? ''}</p>
<p data-probe="navigation">Navigation callbacks: {navigationCount}</p>
<button onclick={onAction}>Call host callback</button>
<button onclick={() => { host.count++; }}>Increment from protected</button>
<button onclick={() => goto(base + '/?step=2', { noScroll: true })}>Protected navigation</button>
<HostBadge location="protected" />
