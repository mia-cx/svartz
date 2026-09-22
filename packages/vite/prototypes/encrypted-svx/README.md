# Encrypted SVX on a static SvelteKit site

Throwaway compiler/browser prototype for [encrypted-note publication](https://github.com/mia-cx/svartz/issues/34). This is evidence for a design decision, not production encryption code.

## Verdict

Encrypted executable SVX works on pure static hosting. A separately bundled browser module can be encrypted at build time, decrypted after password entry, dynamically imported through a blob URL, and mounted into a prerendered SvelteKit shell.

The experiment requires no authentication server, runtime compilation, or plaintext protected JavaScript on the host. The public shell is prerendered; the protected component mounts after unlocking.

## Run

From this directory, using Node 22 and pnpm 9:

```sh
pnpm install --frozen-lockfile
SVARTZ_PROTOTYPE_PASSWORD=demo-encrypted-note pnpm build
SVARTZ_PROTOTYPE_PASSWORD=demo-encrypted-note pnpm verify
pnpm preview
```

Open http://127.0.0.1:4178/prototype/ and use the demonstration password from the commands above. It is a public test fixture, not a real secret. Verification starts and stops its own static servers and Chromium process; the preview command is optional.

Dependencies match the existing MVP lockfile versions where applicable. This nested package has its own workspace and lockfile, so it does not install or alter the repository's application dependencies.

## What the build does

1. mdsvex and Svelte compile `private/Note.svx`, its imported counter, and a nested dynamic import.
2. Vite produces one self-contained ESM bundle, including its Svelte runtime. `write: false` keeps intermediate plaintext outputs in memory.
3. The prototype collects extracted scoped CSS and an SVG attachment. A fixed attachment token proves replacement with a decrypted blob URL.
4. PBKDF2-SHA-256 derives an AES-256-GCM key using a random salt and 600,000 iterations. Encryption uses a random 96-bit IV and the payload ID as authenticated additional data.
5. Only an encrypted envelope enters `static/protected`. The public application imports the loader, never the protected source.
6. SvelteKit's static adapter prerenders the public pages under a non-root `/prototype` base path.

The browser authenticates/decrypts the payload, creates attachment/CSS/module blob URLs, imports the module, and mounts it. Navigation unmounts the component and revokes its URLs. The key stays in memory during same-document navigation; Lock clears it.

## Verified behavior

The exact machine-readable result is in [results.json](./results.json). Nine focused checks pass in Chromium 151.0.7922.173:

- Static output contains none of the five distinctive protected-content markers or the password. It contains no source maps or SVX sources.
- The locked shell hydrates without protected DOM, CSS, or images. Direct requests for fixture source/plaintext chunks return 404.
- A wrong password mounts nothing.
- A correct password renders the note, updates the imported counter, loads the nested dynamic module, applies scoped CSS, and displays the decrypted image.
- SvelteKit navigation unmounts the protected component, removes its CSS, and permits another unlock with the in-memory key.
- Lock clears the key and removes rendered content.
- Modified ciphertext fails authentication before module import.
- Supported CSP produces no uncaught browser errors.
- A stricter CSP excluding blob scripts blocks the import and leaves no mounted component or protected styles.

Screenshots and fresh results are written to ignored `evidence/`. The protected module is 48,466 bytes; the JSON payload is 50,987 bytes; authenticated ciphertext is 51,003 bytes before base64. These are fixture sizes, not production size forecasts.

## Constraints that matter for v1

**Isolation must happen before normal public bundling.** Adding a dynamic import to the current eager note-artifact graph alone does not protect content. Every note-bearing JS/CSS/asset dependency needs classification before publication. Public source maps, preload files, indexes, prerendered HTML, and obsolete build outputs must obey the same boundary.

**CSP must permit the loader.** The tested shell uses SvelteKit-generated hashes for its bootstrap script and permits `blob:` for scripts, styles, and images. It needs neither `unsafe-eval` nor `unsafe-inline`. A consuming app's stricter HTTP CSP still applies; a meta policy cannot loosen it.

**This prototype mounts an isolated Svelte runtime.** It bundles framework code with the protected note rather than sharing the host runtime. It proves ordinary imported browser components, local state, lifecycle cleanup, CSS, a nested dynamic import, and an attachment. It does not prove automatic inheritance of host Svelte context or support for `$app/*` imports. A production bridge needs an explicit props/context/runtime contract.

**One note and one password group are tested.** No reload-persistent session cache, multi-group assets, protected search index, encrypted graph, arbitrary dependency cycles, imported worker/Wasm modules, or HMR implementation is included. The nested dynamic dependency is bundled eagerly but its dynamic-import call still resolves after unlock.

**Asset rewriting is deliberately narrow.** One fixture SVG import maps to a placeholder. General Markdown attachments, CSS URLs, and transitive asset imports need the production resource collector.

**Locking is UI/session cleanup, not erasure of previously disclosed content.** Browsers retain evaluated module records, and authorized readers can retain decrypted content. Revoking blob URLs does not unload JavaScript already imported.

This is a bounded feasibility check, not a security audit. Marker scans demonstrate this fixture's output isolation; they do not establish a universal information-flow guarantee.

## Attempts and sources

The first build exposed Vite's array return value for library builds; normalizing it fixed collection of in-memory outputs. The first verification used an uppercase CSP attribute match; generated HTML correctly uses lowercase. Visual inspection found a stale session-status label; it now tracks unlock/lock state. Final build and verification pass.

- [Vite code splitting](https://vite.dev/guide/features.html#glob-import)
- [Vite library builds](https://vite.dev/guide/build.html#library-mode)
- [Browser dynamic imports and blob URLs](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/import)
- [Web Crypto decryption](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/decrypt)
- [Svelte mount/unmount](https://svelte.dev/docs/svelte/svelte)
- [SvelteKit static generation](https://svelte.dev/docs/kit/adapter-static)
- [SvelteKit CSP](https://svelte.dev/docs/kit/configuration#csp)
