<script lang="ts">
  import 'virtual:svartz/tailwind-sources.css';
  import { page } from '$app/state';
  import SvartzRuntimePage from '@svartz/ui/runtime';
</script>

<SvartzRuntimePage pathname={page.url.pathname} />
