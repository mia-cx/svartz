import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { constants } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const [id, profile, executable] = process.argv.slice(2);
if (!id || !profile || !executable || !/^[\w-]+$/.test(id) || !/^[\w-]+$/.test(profile)) {
  throw new Error('Usage: xvfb-run -a node scripts/stress/obsidian.mjs <vault-id> <profile> <obsidian executable>');
}
const dir = resolve('.stress-cache', id, profile);
const source = resolve('.stress-cache', id, 'vault');
const links = JSON.parse(await readFile(join(dir, 'links.json'), 'utf8'));
const sorted = links.filter((link) => 'href' in link).sort((a, b) => a.path.localeCompare(b.path) || a.raw.localeCompare(b.raw));
const categories = {
  resolved: (link) => link.href && !link.section,
  missing: (link) => !link.href && link.target && !link.assetCandidate,
  labeled: (link) => link.label,
  alias: (link) => link.aliasCandidate,
  ambiguous: (link) => link.ambiguousCandidate,
  heading: (link) => link.section && !link.section.startsWith('^'),
  block: (link) => link.section?.startsWith('^'),
  deep: (link) => link.target.split('/').length >= 3,
};
const sample = Object.entries(categories).flatMap(([category, match]) => {
  const candidates = [...new Map(sorted.filter(match).map((link) => [`${link.path}\0${link.raw}`, link])).values()];
  return [...new Set([0, 0.5, 1].map((quantile) => candidates[Math.floor(quantile * (candidates.length - 1))]).filter(Boolean))]
    .map((link) => ({ category, ...link }));
});
const scratch = await mkdtemp(join(dir, 'obsidian-'));
const vault = join(scratch, 'vault');
const userData = join(scratch, 'profile');
const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: source, maxBuffer: 32 * 1024 * 1024 }).toString().split('\0').filter(Boolean);
// No third-party plugins or vault settings that could load them. Preserve note and attachment paths verbatim.
for (const path of tracked.filter((path) => !path.split('/').some((part) => part.startsWith('.')))) {
  const output = join(vault, path);
  await mkdir(dirname(output), { recursive: true });
  await copyFile(join(source, path), output, constants.COPYFILE_FICLONE);
}
await mkdir(userData, { recursive: true });
await writeFile(join(userData, 'obsidian.json'), JSON.stringify({ vaults: { stress: { path: vault, ts: Date.now(), open: true } } }));

const { chromium } = await import('../../packages/ui/node_modules/playwright/index.mjs');
const app = spawn(resolve(executable), [`--user-data-dir=${userData}`, '--remote-debugging-port=0', '--disable-gpu'], { stdio: 'inherit' });
const exit = once(app, 'exit');
let browser;
try {
  const activePort = join(userData, 'DevToolsActivePort');
  let port;
  for (let attempt = 0; attempt < 100 && !port; attempt += 1) {
    if (app.exitCode !== null) throw new Error(`Obsidian exited with ${app.exitCode}`);
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
  const result = await page.evaluate((examples) => {
    const { metadataCache, vault } = window.app;
    return {
      notes: vault.getMarkdownFiles().length,
      sample: examples.map((example) => {
        const target = example.target
          ? metadataCache.getFirstLinkpathDest(example.target, example.path)
          : vault.getAbstractFileByPath(example.path);
        const cache = target ? metadataCache.getFileCache(target) : null;
        const anchor = example.section?.startsWith('^')
          ? Boolean(cache?.blocks?.[example.section.slice(1)])
          : example.section ? Boolean(cache?.headings?.some(({ heading }) => heading.toLowerCase() === example.section.toLowerCase())) : null;
        return { ...example, obsidianTarget: target?.path ?? null, obsidianHasAnchor: anchor };
      }),
    };
  }, sample);
  await writeFile(join(dir, 'obsidian.json'), `${JSON.stringify(result, null, 2)}\n`);
  console.log(`${id}: checked ${result.sample.length} link samples with Obsidian (${result.notes} Markdown files).`);
} finally {
  try {
    await browser?.close();
  } finally {
    if (app.exitCode === null && app.signalCode === null) app.kill('SIGTERM');
    await exit;
  }
}
