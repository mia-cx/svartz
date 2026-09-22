<script>
  import { onMount, onDestroy } from 'svelte';
  let count = $state(0);
  let detail = $state('');
  onMount(() => {
    document.documentElement.dataset.protectedMounted = 'yes';
  });
  onDestroy(() => { delete document.documentElement.dataset.protectedMounted; });
  async function more() {
    const { detailText } = await import('./detail.js');
    detail = detailText;
  }
</script>
<button onclick={() => count++}>SVX_SECRET_COUNTER_9bb812: {count}</button>
<button onclick={more}>Load protected detail</button>
<p>{detail}</p>
