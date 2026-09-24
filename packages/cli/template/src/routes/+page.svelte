<script lang="ts">
  import { page } from '$app/state';
  import SvartzRuntimePage from '@svartz/ui/runtime';
</script>

<SvartzRuntimePage pathname={page.url.pathname} />
