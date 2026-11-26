import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { constants } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { vaultSource } from './vaults.mjs';

const [id, profile, executable] = process.argv.slice(2);
if (!id || !profile || !executable || !/^[\w-]+$/.test(id) || !/^[\w-]+$/.test(profile)) {
  throw new Error('Usage: xvfb-run -a node scripts/stress/obsidian.mjs <vault-id> <profile> <obsidian executable>');
}
const dir = resolve('.stress-cache', id, profile);
const source = vaultSource(dirname(dir), profile);
const links = JSON.parse(await readFile(join(dir, 'links.json'), 'utf8'));
const authoredLinkpath = (raw) => raw.slice(2, -2).replace(/\\?\|[\s\S]*$/, '').trim();
const sorted = links.filter((link) => 'href' in link).sort((a, b) => a.path.localeCompare(b.path) || a.raw.localeCompare(b.raw));
const categories = {
  resolved: (link) => link.href && !link.section,
  missing: (link) => !link.href && link.target && !link.assetCandidate,
  labeled: (link) => link.label,
  alias: (link) => link.aliasCandidate,
  ambiguous: (link) => link.ambiguousCandidate,
  heading: (link) => link.section && !link.section.startsWith('^'),
  nestedHeading: (link) => /#[^#]+#/.test(authoredLinkpath(link.raw)),
  block: (link) => link.section?.startsWith('^'),
  deep: (link) => link.target.split('/').length >= 3,
};
const sample = Object.entries(categories).flatMap(([category, match]) => {
  const candidates = [...new Map(sorted.filter(match).map((link) => [`${link.path}\0${link.raw}`, link])).values()];
  return [...new Set([0, 0.5, 1].map((quantile) => candidates[Math.floor(quantile * (candidates.length - 1))]).filter(Boolean))]
    .map((link) => ({ category, ...link, authoredLinkpath: authoredLinkpath(link.raw) }));
});

async function prepareVault(vault, userData) {
  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: source, maxBuffer: 32 * 1024 * 1024 }).toString().split('\0').filter(Boolean);
  // Ignore all upstream vault settings and plugins. Preserve note and attachment paths verbatim.
  for (const path of tracked.filter((path) => !path.split('/').some((part) => part.startsWith('.')))) {
    const output = join(vault, path);
    await mkdir(dirname(output), { recursive: true });
    await copyFile(join(source, path), output, constants.COPYFILE_FICLONE);
  }
  const probe = join(vault, '.obsidian/plugins/stress-link-audit');
  await mkdir(probe, { recursive: true });
  await writeFile(join(probe, 'manifest.json'), JSON.stringify({
    id: 'stress-link-audit', name: 'Stress link audit', version: '1.0.0', minAppVersion: '1.15.1',
  }));
  // Obsidian exposes its parser and subpath resolver to plugins, not as window globals.
  await writeFile(join(probe, 'main.js'), `
const { Plugin, parseLinktext, resolveSubpath } = require('obsidian');
module.exports = class extends Plugin {
  onload() { window.stressLinkAudit = { parseLinktext, resolveSubpath }; }
};
`);
  await mkdir(userData, { recursive: true });
  await writeFile(join(userData, 'obsidian.json'), JSON.stringify({ vaults: { stress: { path: vault, ts: Date.now(), open: true } } }));
}

async function compare(userData) {
  const { chromium } = await import('../../packages/ui/node_modules/playwright/index.mjs');
  const app = spawn(resolve(executable), [`--user-data-dir=${userData}`, '--remote-debugging-port=0', '--disable-gpu'], { stdio: 'inherit' });
  // `close` fires after exit, including when spawn itself fails.
  const closed = new Promise((done) => app.once('close', done));
  let browser;
  try {
    await once(app, 'spawn');
    const activePort = join(userData, 'DevToolsActivePort');
    let port;
    for (let attempt = 0; attempt < 100 && !port; attempt += 1) {
      if (app.exitCode !== null || app.signalCode !== null) throw new Error(`Obsidian exited with ${app.exitCode ?? app.signalCode}`);
      try {
        port = (await readFile(activePort, 'utf8')).split('\n')[0];
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        await delay(200);
      }
    }
    if (!port) throw new Error('Obsidian never exposed its CDP port.');
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    const [context] = browser.contexts();
    const page = context.pages()[0] ?? await context.waitForEvent('page');
    await page.waitForFunction(() => {
      const files = window.app?.vault?.getMarkdownFiles() ?? [];
      return files.length > 0 && files.every((file) => window.app.metadataCache.getFileCache(file));
    }, undefined, { timeout: 90000 });
    return await page.evaluate(async (examples) => {
      const { metadataCache, plugins, vault } = window.app;
      await plugins.setEnable(true);
      await plugins.enablePlugin('stress-link-audit');
      const { parseLinktext, resolveSubpath } = window.stressLinkAudit;
      return {
        notes: vault.getMarkdownFiles().length,
        sample: examples.map((example) => {
          const { path, subpath } = parseLinktext(example.authoredLinkpath);
          const target = metadataCache.getFirstLinkpathDest(path, example.path);
          const cache = target && metadataCache.getFileCache(target);
          const anchor = cache && subpath ? resolveSubpath(cache, subpath) : null;
          return {
            ...example,
            obsidianTarget: target?.path ?? null,
            obsidianHasAnchor: subpath ? Boolean(anchor) : null,
            obsidianAnchorLine: anchor ? anchor.start.line + 1 : null,
          };
        }),
      };
    }, sample);
  } finally {
    try {
      await browser?.close();
    } finally {
      if (app.exitCode === null && app.signalCode === null) app.kill('SIGTERM');
      await closed;
    }
  }
}

const scratch = await mkdtemp(join(dir, 'obsidian-'));
try {
  const userData = join(scratch, 'profile');
  await prepareVault(join(scratch, 'vault'), userData);
  const result = await compare(userData);
  await writeFile(join(dir, 'obsidian.json'), `${JSON.stringify(result, null, 2)}\n`);
  console.log(`${id}: checked ${result.sample.length} link samples with Obsidian (${result.notes} Markdown files).`);
} finally {
  await rm(scratch, { recursive: true, force: true });
}
