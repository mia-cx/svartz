---
"@svartz/ui": patch
"@svartz/vite": patch
---

Take the deployment base from Svartz's generated `deploymentBasePath` instead of `$app/paths`, whose `base` SvelteKit 3 removed. Site logos and protected note payloads now use the absolute base during server rendering too, as vault links already did. A `SiteLogo` outside a Svartz page, such as in a host's own header, takes the base as a prop: `<SiteLogo {logo} base={vaults[0].basePath} />`.
