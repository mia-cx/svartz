---
"svartz": minor
---

`svartz init` asks how to set up the site when it runs in a terminal. Create any number of vaults, or publish folders you already have, such as an Obsidian vault, without changing them. For each vault, pick a theme (each option says what it's for and links its live demo), a colour scheme, shown as swatches, and where it deploys, with the Worker name and domain for Cloudflare Workers. The config imports the chosen schemes from `@svartz/config/schemes`, and `package.json` lists the theme packages the vaults use.

Every answer is also a flag, so init runs unattended: `--vault`, `--id`, `--title`, `--theme`, `--scheme`, `--target`, `--worker` and `--domain`. Give one once to apply it to every vault, or once per `--vault` to match them in order; `--worker` and `--domain` match the `cloudflare-workers` vaults. An empty value keeps a vault's default, and `--scheme svartz` names Svartz's own colours. `--yes` skips the questions. In a SvelteKit app, several host vaults each mount at `/<id>`. Without a terminal or any of these flags, init writes the one `vault` folder it always has.
