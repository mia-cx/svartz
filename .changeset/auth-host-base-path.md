---
'@svartz/auth': patch
---

The sign-in dialog works in a host app that sets SvelteKit's `paths.base`. Its provider links used to leave the base out and answer 404; the dialog now adds the deployment base it is mounted with, so standalone and host vaults both reach their sign-in routes.
