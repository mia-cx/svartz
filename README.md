# Svartz

A SvelteKit rewrite of [Quartz](https://github.com/jackyzha0/quartz).

Svartz is a set of tools that helps you publish your [digital garden](https://jzhao.xyz/posts/networked-thought) and notes as a website for free.

Some notable differences from Quartz are:

- More robust theming, with some first-party themes for:
  - Notes (standard quartz-like)
  - Package docs (scanning JSdoc & linking to source on github)
  - API docs (input & output examples, route discovery for sveltekit & hono)
  - (TTRPG) Wikis.
- MDSveX by default, so you *can* use svelte components in your vault. (Can use [obsidian-markdown-file-suffix](https://github.com/git-no/obsidian-markdown-file-suffix) if you want to support different markdown extensions in Obsidian).

## Usage

Start using Svartz by either using this repository as a template, forking it, or using our init cli.

```bash
pnpm dlx svartz init
```
