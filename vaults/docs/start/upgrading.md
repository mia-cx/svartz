---
title: "Upgrading"
description: "Update Svartz packages together and check the build locally."
---

Read the [release notes](https://github.com/mia-cx/svartz/releases) for the version you want. Upgrade `svartz` and the `@svartz/*` packages your project installs, including its themes and plugins. For a starter project:

```sh
npm install -D svartz@latest @svartz/config@latest
npm run build
npm run preview
```

Open the local preview before deploying. If you use a scaffolded SvelteKit host, rerun `npx svartz@latest init` to update supported generated files. Compare changes before committing them, especially if you own your catchall route.

The config's `version` describes the file format, not the package version. Keep its major at `1` while the [[reference/configuration|configuration reference]] calls for it.
