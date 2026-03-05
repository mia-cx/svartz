# CLI: `svartz init` command design

## Overview

`pnpm create svartz` or `pnpm dlx svartz init` scaffolds a new Svartz project.

## Scaffolding approach: Bundle vs. Clone

### Option A: Bundle (recommended)

**How it works:**
- All templates, themes, and boilerplate are packaged inside the npm package
- `svartz init` extracts them to the user's filesystem
- Fast, no network latency beyond npm install

**Pros:**
- Fast (no git clone)
- Works offline
- Reliable (doesn't depend on GitHub)
- Standard npm package pattern (like `create-react-app`, `create-next-app`, `create-svelte`)

**Cons:**
- Larger npm package size (depends on included templates/themes)
- Always pulls a fixed version (no "latest" from main branch)

**Best for:** Most users; standard, predictable experience

### Option B: Clone (Quartz approach)

**How it works:**
- `svartz init` clones the GitHub repo (`mia-cx/svartz`)
- Sets up from the cloned repo

**Pros:**
- Always latest from `main` branch
- Smaller npm package (just the CLI)

**Cons:**
- Slower (git clone over network)
- Requires git to be installed
- Depends on GitHub availability
- Less standard for npm packages

**Best for:** Contributors, or very large templates

### Recommendation

**Start with bundling (Option A).** It's the modern npm standard and works for most users. If package size becomes a concern, we can:
1. Use tarball compression
2. Ship themes separately (e.g. `@svartz/themes-default`)
3. Offer a lighter scaffold with optional theme installs

---

## `svartz init` user flow

```bash
$ pnpm create svartz
✨ Welcome to Svartz!

? Project name: my-docs
? Description: My documentation site
? Which adapter do you want to use? (Use arrow keys)
  ❯ Static (default; deploy anywhere)
    Cloudflare Workers
    Cloudflare Pages
    Node (SSR)
? Would you like to include any themes? (multi-select) default
? Use git for version control? (Y/n) Y
? Git remote URL: https://github.com/myuser/my-docs.git

🚀 Scaffolding project...
✅ Created my-docs/
✅ Initialized git
✅ Set remote 'origin'
✅ Installed dependencies

Next steps:
  cd my-docs
  pnpm dev

Happy publishing! 🌱
```

## Adapter step

- **Prompt:** “Which adapter do you want to use?” with options: Static, Cloudflare Workers, Cloudflare Pages, Node (SSR).
- **Effect:**
  - **Static** — `@sveltejs/adapter-static` in `svelte.config.js`; no `wrangler.jsonc`.
  - **Cloudflare Workers** — `@sveltejs/adapter-cloudflare-workers`; include `wrangler.jsonc` in the template (or generate it).
  - **Cloudflare Pages** — `@sveltejs/adapter-cloudflare`; optional `wrangler.jsonc` or document Pages deploy separately.
  - **Node** — `@sveltejs/adapter-node`.
- Template can ship one base + small adapter-specific snippets, or separate template dirs per adapter (e.g. `templates/static/`, `templates/cloudflare-workers/`). Same app code; only adapter and deploy config differ.

## Git integration

If user selects `Y` for git:

```ts
// packages/cli/src/init.ts
async function initProject(answers) {
  const projectDir = answers.projectName;
  
  // Scaffold files
  await scaffoldProject(projectDir);
  
  // Initialize git
  if (answers.useGit) {
    execSync('git init', { cwd: projectDir });
    
    // Set remote if provided
    if (answers.gitRemote) {
      execSync(`git remote add origin ${answers.gitRemote}`, { cwd: projectDir });
    }
    
    // Initial commit
    execSync('git add .', { cwd: projectDir });
    execSync('git commit -m "chore: initial svartz scaffold"', { cwd: projectDir });
  }
  
  // Install deps
  execSync('pnpm install', { cwd: projectDir });
}
```

**Git prompts:**
- `Use git for version control?` — Yes/no
- If yes, `Git remote URL (optional):` — User can enter GitHub/GitLab/etc. remote, or leave blank for local-only

---

## Package size consideration

**Bundled templates might include:**
- Base SvelteKit app scaffold
- Default theme (`@svartz/themes-default`)
- Sample vaults (`docs/`, `notes/`)
- Example svartz.config.ts
- CI/CD workflows (GitHub Actions)

**Estimated size:** 500 KB – 2 MB (after compression), depending on theme completeness.

**If too large:**
1. Compress template assets
2. Ship themes as separate optional packages: `pnpm create svartz --with-themes`
3. Or ship minimal scaffold, users install themes on demand: `pnpm svartz theme:install default`

---

## Current approach

For MVP, recommend **Option A (bundle)** with:
- Minimal SvelteKit scaffold
- One default theme
- Sample vaults
- Sensible defaults in `svartz.config.ts`
- Optional interactive setup (git, theme selection)

This matches modern npm package conventions and provides a smooth first-time UX.
