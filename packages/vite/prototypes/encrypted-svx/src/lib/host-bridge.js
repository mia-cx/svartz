import * as svelte from 'svelte';
import * as client from 'svelte/internal/client';
import * as store from 'svelte/store';
import 'svelte/internal/flags/legacy';
import 'svelte/internal/disclose-version';
import * as state from '$app/state';
import * as navigation from '$app/navigation';
import * as paths from '$app/paths';
import * as context from '$lib/host-context.js';

// Throwaway registry of public dependencies. Protected entries never enter it.
export function registerHostBridge() {
  globalThis.__svartzPrototypeHost = {
    svelte, 'svelte/internal/client': client, 'svelte/store': store,
    '$app/state': state, '$app/navigation': navigation, '$app/paths': paths,
    '$lib/host-context.js': context
  };
}
