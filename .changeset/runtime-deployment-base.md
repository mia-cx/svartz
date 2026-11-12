---
"@svartz/ui": patch
"@svartz/vite": patch
---

Take the deployment base from Svartz's generated `deploymentBasePath` instead of `$app/paths`, whose `base` SvelteKit 3 removed. Site logos and protected note payloads now use the absolute base during server rendering too, as vault links already did.
