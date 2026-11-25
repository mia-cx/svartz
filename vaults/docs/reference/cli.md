---
title: "CLI reference"
description: "Initialize, build, develop, and preview a vault."
---

Run these commands through your project's package manager, for example `npx svartz build` or `pnpm svartz build`.

| Command | Flags | What it does |
| --- | --- | --- |
| `init` | `--no-install`, `--no-git` | Scaffold the current directory or integrate the current SvelteKit app. |
| `build` | `--config <path>`, `--vault <id>` | Build all configured vaults, or select one standalone vault or the combined host. |
| `build:all` | `--config <path>` | Build all configured vaults. |
| `dev` | `--config <path>`, `--vault <id>`, `--host <host>`, `--port <port>` | Serve and rebuild content as it changes. |
| `preview` | `--config <path>`, `--vault <id>`, `--host <host>`, `--port <port>` | Serve the build output. Run `build` first. |

Use `svartz --help` or `svartz <command> --help` for flags. Without `--vault`, dev and preview use the combined host if configured, otherwise the first vault. With `--vault <host-id>`, all host vaults still share the same app and output. A standalone vault builds into its own directory.

## What init writes

A standalone project gets a config, starter vault, `.gitignore`, and `dev`, `build`, and `preview` scripts. An already configured standalone project is left alone. In an existing SvelteKit app, init keeps your routes and adapter and adds the Vite wrapper, type reference, Svartz scripts, and any applicable missing generated routes. See [[guides/host-vaults|the host guide]].

If the config root has `turbo.json` and no host app, Svartz syncs the managed `svartz:*` scripts and `//#svartz:*` tasks. It leaves the rest of those files alone. `dev:runner` and `run-managed-task` are internal commands.

## Build directories and locks

A standalone vault gets artifacts, SvelteKit state, and a dependency bridge under `.svartz/vaults/<id>/` when using the default output. Static and Node output use `dist/` there; Cloudflare writes `.svelte-kit/cloudflare/`. A host adapter controls its own output. See [[start/project-layout|Project layout]] and [[start/deploying|Deploy your site]].

Builds share a project lock. A later build normally recovers a crashed build's lock. If it names a leftover `.svartz/.vault-build.lock.recover` guard, check that no Svartz build is running before removing it.
