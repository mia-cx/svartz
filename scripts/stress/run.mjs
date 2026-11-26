import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, open, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { vaults, vaultSource } from './vaults.mjs';
import { measureBrowser } from './browser.mjs';

const script = fileURLToPath(import.meta.url);
const root = fileURLToPath(new URL('../../', import.meta.url));
const cache = join(root, '.stress-cache');
const scope = ['--user', '--scope', '--quiet', '--expand-environment=no', '-p', 'MemoryMax=12G', '-p', 'MemorySwapMax=0'];
const git = (args, cwd = root) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
const save = (file, value) => writeFile(file, `${JSON.stringify(value, null, 2)}\n`);

async function checkout(vault, source, history) {
  if (!existsSync(join(source, '.git'))) {
    await mkdir(source, { recursive: true });
    git(['init', '--quiet', source]);
    git(['remote', 'add', 'origin', `https://github.com/${vault.repository}.git`], source);
  }
  const head = spawnSync('git', ['rev-parse', '--verify', 'HEAD'], { cwd: source, encoding: 'utf8' });
  if (head.status !== 0) {
    git(['fetch', '--quiet', ...(history ? [] : ['--depth=1']), 'origin', vault.commit], source);
    git(['checkout', '--quiet', '--detach', vault.commit], source);
  }
  if (git(['rev-parse', 'HEAD'], source).trim() !== vault.commit || git(['status', '--porcelain', '--ignored'], source).trim()) {
    throw new Error(`Unexpected commit or local changes in ${source}; move it aside and rerun.`);
  }
  const correctDepth = history
    ? git(['rev-parse', '--is-shallow-repository'], source).trim() === 'false'
    : git(['rev-list', '--count', 'HEAD'], source).trim() === '1';
  if (!correctDepth) throw new Error(`Unexpected Git history depth in ${source}; move it aside and rerun.`);
}

function sampledTreeRss(pid) {
  const rows = execFileSync('ps', ['-A', '-o', 'pid=,ppid=,rss='], { encoding: 'utf8' })
    .trim().split('\n').map((line) => line.trim().split(/\s+/).map(Number));
  const tree = new Set([pid]);
  while (rows.some(([child, parent]) => tree.has(parent) && !tree.has(child) && tree.add(child))) {
    // Repeat until all descendants have been found, regardless of the order ps uses.
  }
  return 1024 * rows.reduce((sum, [child, , rss]) => sum + (tree.has(child) ? rss : 0), 0);
}

// Run inside a fresh scope per build so memory.peak is not shared with the warm build or another vault.
async function measureBuild(config, id, mode, logPath, resultPath, scoped, retainKeys) {
  const log = await open(logPath, 'w');
  try {
    const cgroup = scoped && /^0::(.*)$/m.exec(readFileSync('/proc/self/cgroup', 'utf8'))?.[1];
    const peakPath = cgroup && join('/sys/fs/cgroup', cgroup, 'memory.peak');
    const memoryPath = peakPath && existsSync(peakPath) ? peakPath : undefined;
    const start = performance.now();
    const preload = retainKeys ? ['--import', fileURLToPath(new URL('./retain-version-keys.mjs', import.meta.url))] : [];
    const child = spawn(process.execPath, [...preload, join(root, 'packages/cli/dist/index.js'), 'build', '--config', config, '--vault', id], {
      cwd: dirname(config), stdio: ['ignore', log.fd, log.fd],
      env: retainKeys ? { ...process.env, STRESS_VERSION_CACHE: join(dirname(config), 'site/cache/versions') } : process.env,
    });
    let sampledPeak = 0;
    const timer = memoryPath ? undefined : setInterval(() => {
      sampledPeak = Math.max(sampledPeak, sampledTreeRss(child.pid));
    }, 200);
    try {
      const [exitCode, signal] = await once(child, 'exit');
      await save(resultPath, {
        mode, exitCode, signal, wallMs: Math.round(performance.now() - start),
        node: process.version, nodeOptions: process.env.NODE_OPTIONS ?? '', retainKeys, scoped,
        peakBytes: memoryPath ? Number(await readFile(memoryPath, 'utf8')) : sampledPeak,
        memoryMethod: memoryPath ? 'cgroup-v2 memory.peak (12 GiB, no swap)' : 'sampled process-tree RSS (200 ms)',
      });
    } finally {
      clearInterval(timer);
    }
  } finally {
    await log.close();
  }
}

async function buildPair(vault, path, dir, { workaround = false, history = false, retainKeys = false } = {}) {
  const build = join(dir, 'site');
  const config = join(dir, 'svartz.config.mjs');
  await rm(build, { recursive: true, force: true });
  await writeFile(config, `const config = ${JSON.stringify({
    version: '1.0.0',
    vaults: [{ id: vault.id, path, outDir: join(build, 'dist'), target: { type: 'static' } }],
  })};\nconst plugins = config.vaults[0].plugins = [];\n${history ? `
import { history } from ${JSON.stringify(new URL('../../packages/plugin-history/dist/index.js', import.meta.url).href)};
const versionNotes = new Set(${JSON.stringify(vault.versionNotes ?? [])});
plugins.push(history({ source: 'git' }), {
  id: 'stress:opt-in-history',
  parseFrontmatter: {
    options: { enforce: 'post', fatal: true },
    run({files}) {
      for (const file of files) if (versionNotes.has(file.path)) file.frontmatter = {...file.frontmatter, versions: true};
    },
  },
});
` : ''}${workaround ? `
plugins.push({
  id: 'stress:encode-redirects',
  indexContent: {
    options: { enforce: 'post', fatal: true },
    run({index}) {
      for (const [href, destination] of Object.entries(index.routes.redirects)) {
        if (/[^\\x00-\\x7f]/u.test(destination)) index.routes.redirects[href] = encodeURI(destination);
      }
    },
  },
});\n` : ''}\nexport default config;\n`);
  const scoped = spawnSync('systemd-run', [...scope, 'true'], { stdio: 'ignore' }).status === 0;
  const results = [];
  await rm(join(dir, 'warm.json'), { force: true });
  await rm(join(dir, 'warm.log'), { force: true });
  for (const mode of ['cold', 'warm']) {
    const logPath = join(dir, `${mode}.log`);
    const resultPath = join(dir, `${mode}.json`);
    await rm(resultPath, { force: true });
    const args = [script, '--measure-build', config, vault.id, mode, logPath, resultPath, String(scoped), String(retainKeys)];
    console.log(`${vault.id}: ${mode} build → ${logPath}`);
    const child = scoped
      ? spawn('systemd-run', [...scope, process.execPath, ...args], { stdio: 'inherit' })
      : spawn(process.execPath, args, { stdio: 'inherit' });
    const [status, signal] = await once(child, 'exit');
    if (status !== 0) throw new Error(`Build measurement worker stopped (${signal ?? status}); see ${logPath}`);
    const result = JSON.parse(await readFile(resultPath, 'utf8'));
    results.push(result);
    console.log(result);
    if (result.exitCode !== 0) break;
  }
  return results;
}

async function runHistoryControl() {
  const dir = join(cache, 'history-control');
  const path = join(dir, 'vault');
  const note = join(path, 'index.md');
  await mkdir(path, { recursive: true });
  if (!existsSync(join(path, '.git'))) {
    git(['init', '--quiet', path]);
    for (const revision of [1, 2, 3]) {
      await writeFile(note, `---\ntitle: History control\nversions: true\n---\n\nRevision ${revision}.\n`);
      git(['add', '--', 'index.md'], path);
      git(['-c', 'user.name=Stress control', '-c', 'user.email=stress@example.invalid', '-c', 'core.hooksPath=/dev/null', 'commit', '--quiet', '--no-gpg-sign', '-m', `Revision ${revision}`], path);
    }
  }
  if (git(['status', '--porcelain'], path).trim() || git(['rev-list', '--count', 'HEAD'], path).trim() !== '3') {
    throw new Error(`Unexpected history control contents in ${path}; move it aside and rerun.`);
  }
  const builds = await buildPair({ id: 'history-control' }, path, dir, { history: true });
  if (builds.some(({ exitCode }) => exitCode !== 0)) process.exitCode = 1;
}

async function main() {
  const args = process.argv.slice(2);
  const flags = ['--build-only', '--measure-only', '--encode-redirects', '--history', '--retain-version-keys'];
  const historyControl = args.length === 1 && args[0] === '--history-control';
  const history = args.includes('--history');
  const retainKeys = args.includes('--retain-version-keys');
  const selected = vaults.filter(({ id }) => !args.some((arg) => !arg.startsWith('--')) || args.includes(id));
  if (!historyControl && ((args.includes('--build-only') && args.includes('--measure-only')) ||
    (retainKeys && !history) || selected.some((vault) => history && !vault.versionNotes) ||
    args.some((arg) => !flags.includes(arg) && !vaults.some(({ id }) => id === arg)))) {
    throw new Error(`Usage: node scripts/stress/run.mjs [--history-control | [--build-only | --measure-only] [--encode-redirects] [--history [--retain-version-keys]] [${vaults.map(({ id }) => id).join('|')}]]`);
  }
  if (!existsSync(join(root, 'packages/cli/dist/index.js'))) throw new Error('Run pnpm install && pnpm build first.');
  if (historyControl) return runHistoryControl();
  for (const vault of selected) {
    const work = join(cache, vault.id);
    const workaround = args.includes('--encode-redirects');
    const heap = process.env.NODE_OPTIONS?.match(/--max-old-space-size=(\d+)/)?.[1];
    const profile = `${workaround ? 'encoded' : 'default'}${heap ? `-heap${heap}` : ''}${history ? '-history' : ''}${retainKeys ? '-retained' : ''}`;
    const dir = join(work, profile);
    const source = vaultSource(work, profile);
    await mkdir(dir, { recursive: true });
    await checkout(vault, source, history);
    if (!args.includes('--measure-only')) {
      for (const name of ['audit', 'links', 'browser', 'obsidian']) await rm(join(dir, `${name}.json`), { force: true });
      const builds = await buildPair(vault, source, dir, { workaround, history, retainKeys });
      if (builds.some(({ exitCode }) => exitCode !== 0)) process.exitCode = 1;
    }
    if (args.includes('--build-only')) continue;
    if (!existsSync(join(dir, 'cold.json'))) throw new Error(`No previous build result in ${dir}; run without --measure-only first.`);
    console.log(`${vault.id}: auditing links and artifacts`);
    const { audit } = await import('./audit.mjs');
    const site = join(dir, 'site');
    const { links, ...summary } = await audit(source, site);
    await save(join(dir, 'links.json'), links);
    await save(join(dir, 'audit.json'), summary);
    const lastBuildPath = ['warm', 'cold'].map((mode) => join(dir, `${mode}.json`)).find(existsSync);
    const { exitCode } = JSON.parse(await readFile(lastBuildPath, 'utf8'));
    if (exitCode !== 0 || !summary.samplePages?.length) continue;
    console.log(`${vault.id}: measuring Chromium on desktop and phone`);
    const browser = await measureBrowser(join(site, 'dist'), summary.samplePages.map(({ href }) => href), vault.queries, vault.inspect);
    await save(join(dir, 'browser.json'), browser);
  }
}

if (process.argv[2] === '--measure-build') {
  const [config, id, mode, log, result, scoped, retainKeys] = process.argv.slice(3);
  await measureBuild(config, id, mode, log, result, scoped === 'true', retainKeys === 'true');
} else {
  await main();
}
