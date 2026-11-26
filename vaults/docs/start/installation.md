---
title: "Installation"
order: 1
description: "Create a new Svartz project with Node.js and npm."
---

Use Node.js 22.17 or later in the Node 22 line, or Node.js 24 or later. Check with `node --version`.

Run this in a new, empty directory:

```sh
npx svartz@latest init
```

In a terminal, `init` asks how to set up the site:

1. Start a new vault, or publish a folder you already have, such as an Obsidian vault. Svartz never changes an existing folder.
2. Pick a [[themes|theme]]. Each option says what it's for and links its live demo.
3. Pick a [[themes/colour-schemes|colour scheme]], or keep Svartz's own.
4. Pick where it deploys. For Cloudflare Workers, name the Worker and, optionally, its domain.

Add as many vaults as you like; each is its own site. Svartz then writes `svartz.config.ts`, a starter note in each new vault, and package scripts. It installs dependencies and initializes Git unless the directory is already in a Git worktree. Add `--no-install` or `--no-git` to skip either step.

To skip the questions, pass the answers as [[reference/cli#init|flags]], or `--yes` for one `vault` folder on the minimal theme.

Inside an existing SvelteKit app, `init` integrates a host vault instead. Follow [[guides/host-vaults|Host Svartz in SvelteKit]] for that path.

Next, [[start/first-site|open your first site]].
