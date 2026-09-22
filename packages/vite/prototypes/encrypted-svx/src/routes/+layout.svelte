<script>
  import { base } from '$app/paths';
  let { children } = $props();
</script>
<nav><a href={base + '/'}>Locked note</a> · <a href={base + '/away/'}>Public page</a></nav>
<main>{@render children()}</main>
<style>
  :global(body) { font-family: system-ui, sans-serif; max-width: 50rem; margin: 3rem auto; padding: 1rem; }
  nav { margin-bottom: 2rem; }
  :global(button), :global(input) { font: inherit; padding: .5rem; }
</style>
