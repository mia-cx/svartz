<script>
  import { getHostContext } from '$lib/host-context.js';
  let { location } = $props();
  const host = getHostContext();
</script>
<p data-badge={location}>Shared host component ({location}): {host.count}</p>
