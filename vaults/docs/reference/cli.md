---
title: "CLI reference"
description: "Initialize, build, develop, and preview a vault."
---

Run these commands through your project's package manager, for example `npx svartz build` or `pnpm svartz build`.

| Command | Flags | What it does |
| --- | --- | --- |
| `init` | `--no-install`, `--no-git`, `--yes`, and [[reference/cli#init\|the vault flags]] | Scaffold the current directory or integrate the current SvelteKit app. |
| `build` | `--config <path>`, `--vault <id>` | Build all configured vaults, or select one standalone vault or the combined host. |
| `build:all` | `--config <path>` | Build all configured vaults. |
| `dev` | `--config <path>`, `--vault <id>`, `--host <host>`, `--port <port>` | Serve and rebuild content as it changes. |
| `preview` | `--config <path>`, `--vault <id>`, `--host <host>`, `--port <port>` | Serve the build output. Run `build` first. |

Use `svartz --help` or `svartz <command> --help` for flags. Without `--vault`, dev and preview use the combined host if configured, otherwise the first vault. With `--vault <host-id>`, all host vaults still share the same app and output. A standalone vault builds into its own directory.

## init

In a terminal, `init` asks for each vault: a new one or an existing folder, its theme, its [[themes/colour-schemes|colour scheme]], and where it deploys. Each answer is also a flag. With any of these flags, or `--yes`, or without a terminal, init asks nothing and fills in the rest with defaults.

| Flag | Default |
| --- | --- |
| `--vault <path>` | `vault`. A folder that exists is published as it is, wherever it is. A new one, inside the project and outside every other vault, gets a starter note. Repeat for more vaults. |
| `--id <id>` | The folder's name, or `notes` for the default `vault` folder. |
| `--title <title>` | The project's name for one vault, or each folder's name. |
| `--theme <name>` | `minimal`. Also `wiki`, `blog`, `docs`, `api-docs` and `mcp-docs`. |
| `--scheme <name>` | `svartz`, Svartz's own colours. Also `catppuccin`, `rose-pine`, `nord`, `gruvbox`, `tokyo-night`, `dracula`, `solarized` and `everforest`. |
| `--target <type>` | `static`, or `host` in a SvelteKit app. Also `node`, `cloudflare-workers` and `cloudflare-pages`. `host` works only in a SvelteKit app. |
| `--worker <name>` | The vault's id. For `cloudflare-workers` vaults. |
| `--domain <domain>` | None, so the Worker answers on workers.dev. For `cloudflare-workers` vaults. |

Give a flag once to apply it to every vault, or once per `--vault` to match them in order. `--worker` and `--domain` match the `cloudflare-workers` vaults in order. An empty value keeps that vault's default, so `--domain ""` leaves a Worker on workers.dev. This publishes an existing Obsidian vault as a wiki on a Worker with its own domain, beside a new blog on a Worker without one, and keeps Svartz's colours for the blog:

```sh
npx svartz init --vault ~/Obsidian/Lore --vault blog \
  --theme wiki --theme blog --scheme gruvbox --scheme svartz \
  --target cloudflare-workers \
  --domain lore.example.com --domain ""
```

In a SvelteKit app, one host vault mounts at the app's root. Several each mount at `/<id>`; change a vault's `mountPath` in the config to move it.

## What init writes

A standalone project gets a config, a starter note in each new vault, `.gitignore`, `dev`, `build`, and `preview` scripts, and the theme packages its vaults use. An already configured standalone project is left alone. In an existing SvelteKit app, init keeps your routes and adapter and adds the Vite wrapper, type reference, Svartz scripts, and any applicable missing generated routes. See [[guides/host-vaults|the host guide]].

If the config root has `turbo.json` and no host app, Svartz syncs the managed `svartz:*` scripts and `//#svartz:*` tasks. It leaves the rest of those files alone. `dev:runner` and `run-managed-task` are internal commands.

## Build directories and locks

A standalone vault gets artifacts, SvelteKit state, and a dependency bridge under `.svartz/vaults/<id>/` when using the default output. Static and Node output use `dist/` there; Cloudflare writes `.svelte-kit/cloudflare/`. A host adapter controls its own output. See [[start/project-layout|Project layout]] and [[start/deploying|Deploy a vault]].

Builds share a project lock. A later build normally recovers a crashed build's lock. If it names a leftover `.svartz/.vault-build.lock.recover` guard, check that no Svartz build is running before removing it.
