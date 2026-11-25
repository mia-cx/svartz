---
title: "Installation"
description: "Create a new Svartz project with Node.js and npm."
---

Use Node.js 22.17 or later in the Node 22 line, or Node.js 24 or later. Check with `node --version`.

Run this in a new, empty directory:

```sh
npx svartz@latest init
```

Svartz creates a config, a starter note, and package scripts. It installs dependencies and initializes Git unless the directory is already in a Git worktree. Add `--no-install` or `--no-git` to skip either step.

Inside an existing SvelteKit app, `init` integrates a host vault instead. Follow [[guides/host-vaults|Host Svartz in SvelteKit]] for that path.

Next, [[start/first-site|open your first site]].
