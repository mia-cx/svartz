# Encrypted SVX sharing its SvelteKit host

Throwaway extension of the [original static-encryption proof](https://github.com/mia-cx/svartz/blob/82f46d7b/packages/vite/prototypes/encrypted-svx/README.md), for [the backend/UI contract](https://github.com/mia-cx/svartz/issues/32). Production code is unchanged.

## Result

Protected SVX can share reactive props, context, and the live SvelteKit router while its source remains encrypted in static output. Use the host's existing Svelte runtime instead of bundling another runtime into each protected note.

The isolated-runtime control reads initial props/context and calls host callbacks, but its displayed values do not update when the host's reactive objects change. The shared-runtime fixture follows those changes in both directions. These are different fixtures; their byte counts are not a controlled size comparison.

The shared fixture passes 11 checks. The isolated control passes four checks, including confirmation of the stale-reactivity limitation. Actual results and versions are in [host-results.json](./host-results.json). [results.json](./results.json) remains historical evidence from the original experiment.

## Reproduce

Run from this directory after `pnpm install --frozen-lockfile`. This run used Node 24.19.0, pnpm 9.14.2, Svelte 5.53.7, SvelteKit 2.53.4, Vite 7.3.1, adapter-static 3.0.10, and Chromium 151.0.7922.173.

Shared runtime:

```sh
SVARTZ_PROTOTYPE_PASSWORD=demo-encrypted-note pnpm build
SVARTZ_PROTOTYPE_PASSWORD=demo-encrypted-note pnpm verify
```

Isolated-runtime control:

```sh
SVARTZ_PROTOTYPE_RUNTIME=isolated SVARTZ_PROTOTYPE_PASSWORD=demo-encrypted-note pnpm build
SVARTZ_PROTOTYPE_RUNTIME=isolated SVARTZ_PROTOTYPE_PASSWORD=demo-encrypted-note pnpm verify
```

The password is a public demonstration fixture. Verification starts its own static servers and Chromium CDP session, enables focus emulation, and cleans them up. Screenshots and raw results go into ignored `evidence/`. No daily-driver application or preview is used.

## What is proved

- Reactive host props update protected DOM. Callback props update the host.
- A reactive context object stays reactive in both directions. A shared public `createContext` helper retains its private key identity, including inside an imported host-authored component.
- `$app/state` page URL changes update the protected DOM. `$app/navigation` `goto` navigates without replacing the document. Its `afterNavigate` hook observes navigation and is removed on disposal. `$app/paths` supplies the `/prototype` base.
- Scoped CSS, encrypted images, local component state, and a nested dynamic import still work.
- Navigation disposes the protected root and its resources. Relocking clears the key; wrong passwords and tampered ciphertext mount no protected component.
- The fixture's protected markers, password, source maps, and SVX sources are absent from static output. Strict CSP without blob scripts blocks import. The supported hash/blob CSP causes no uncaught errors and requires neither unsafe-eval nor unsafe-inline.

Screenshots were inspected. The isolated screenshot shows changed host values beside stale protected values. The shared screenshot shows updated props/context and the live router URL.

## Mechanism

The public application imports its Svelte runtime, SvelteKit client modules, and an explicitly shared context helper through its normal Vite build. `src/lib/host-bridge.js` exposes their existing namespace objects through a throwaway registry. It never imports protected sources.

The protected library build compiles its own SVX dependency graph in memory. A Vite plugin redirects known shared imports to facades referencing those host namespace objects. The protected bundle contains its component code, but no second Svelte runtime or router. After decryption, the host passes props and its context map to the protected entry's `mount` call.

Sharing Svelte alone is insufficient if a module creating context keys executes twice. This prototype explicitly shares the already-public context helper. The imported host component is compiled into the protected payload while using the same helper and runtime.

Protected JS, CSS, and the attachment are encrypted before the public SvelteKit build sees protected output. The AES-GCM envelope, password derivation, and blob loader retain the original experiment's mechanism.

## Production direction and limits

Generate a dependency bridge internally from resolved module ownership; the global registry is not a proposed public API. Reuse public dependencies and keep protected-only dependencies encrypted. An import is not permission to publish protected data.

Compile protected components against the host's installed Svelte compiler/runtime. Compiler-generated `svelte/internal/*` imports need version-compatible handling. Broad namespace exports simplify this fixture; production should retain only needed exports.

Client-compatible SvelteKit APIs can use the host modules. Only the APIs listed above were tested. Forms, remote functions, `$app/stores`, other navigation methods, arbitrary package singletons, workers, Wasm, HMR, other adapters, and other framework versions were not tested. Arbitrary mutable shared module exports also need live-binding support beyond these constant facades.

Server-only modules and private environment imports remain subject to normal SvelteKit client restrictions. Encryption must not bypass them. This prototype rejects unclassified `$app/*` and `$env/*` imports; it does not implement the full transitive server-only module analysis. That is a production gate.

The host supplies props/context at runtime, rather than serializing them into ciphertext. Protected content mounts in the browser after unlock; its public shell remains prerendered.

Session keys remain in memory during same-document navigation. Reload persistence, multiple groups, encrypted discovery data, and general dependency/asset classification remain production work. Disposal removes listeners and rendered resources, but cannot erase content already disclosed to a reader.

The host CSP must permit the blob loader; Svartz cannot loosen a stricter host policy. Sharing the runtime adds no new CSP requirement. Marker scans are fixture evidence, not a universal security audit or a completed v1 backend.

## Attempts

The first bridge build declared an export named `await`, a reserved binding name. Safe local identifiers with export aliases fixed it. Both subsequent builds and browser checks passed. Vite reported the existing mdsvex sourcemap warning; sourcemaps are disabled and absent from public output.

## Primary references

- [Svelte mount and context-map APIs](https://svelte.dev/docs/svelte/svelte#mount)
- [Svelte context and reactive state](https://svelte.dev/docs/svelte/context)
- [SvelteKit page state](https://svelte.dev/docs/kit/$app-state)
- [SvelteKit navigation and lifecycle](https://svelte.dev/docs/kit/$app-navigation)
- [SvelteKit server-only modules](https://svelte.dev/docs/kit/server-only-modules)
- [SvelteKit CSP configuration](https://svelte.dev/docs/kit/configuration#csp)
