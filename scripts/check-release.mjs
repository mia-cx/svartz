import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
const licenseText = await readFile(path.join(root, 'LICENSE'), 'utf8');
const packages = [
  ['@svartz/core', 'packages/core', ['dist/index.js', 'dist/index.d.ts']],
  ['@svartz/plugins', 'packages/plugins', ['dist/index.js', 'dist/index.d.ts']],
  ['@svartz/config', 'packages/config', ['dist/index.js', 'dist/index.d.ts']],
  ['@svartz/ui', 'packages/ui', ['dist/index.js', 'dist/runtime/index.js', 'dist/stores.d.ts']],
  ['@svartz/theme-minimal', 'themes/minimal', ['dist/index.js', 'dist/runtime.js', 'dist/theme.css']],
  ['@svartz/vite', 'packages/vite', ['dist/index.js', 'dist/host.js', 'dist/discovery.js', 'types/virtual-modules.d.ts']],
  ['svartz', 'packages/cli', ['dist/index.js', 'template/vault/index.md', 'template/gitignore']],
];

async function command(file, args, cwd) {
  try {
    const { stdout, stderr } = await exec(file, args, { cwd, maxBuffer: 10 * 1024 * 1024 });
    if (process.env.SVARTZ_RELEASE_VERBOSE) process.stdout.write(stdout + stderr);
    return stdout;
  } catch (error) {
    const detail = error.stderr?.slice(-3000) || error.stdout?.slice(-3000) || error.message;
    throw new Error(`${file} ${args.join(' ')} failed in ${cwd}:\n${detail}`, { cause: error });
  }
}

async function write(rootDir, name, contents) {
  const destination = path.join(rootDir, name);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, contents);
}

async function localDependencies(project, archives) {
  const manifestPath = path.join(project, 'package.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  for (const group of ['dependencies', 'devDependencies']) {
    for (const name of Object.keys(manifest[group] ?? {})) {
      if (archives.has(name)) manifest[group][name] = `file:${archives.get(name)}`;
    }
  }
  // The registry has no v1 packages yet, so pin transitive Svartz packages locally too.
  manifest.devDependencies ??= {};
  for (const [name, archive] of archives) {
    if (!manifest.dependencies?.[name]) manifest.devDependencies[name] = `file:${archive}`;
  }
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

async function freePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function checkDev(project, pathname, expected) {
  const port = await freePort();
  const child = spawn(path.join(project, 'node_modules/.bin/svartz'),
    ['dev', '--vault', 'notes', '--host', '127.0.0.1', '--port', String(port)],
    { cwd: project, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  let lastResponse = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  child.on('error', (error) => { output += String(error); });
  try {
    for (let attempt = 0; attempt < 120; attempt++) {
      if (child.exitCode !== null) throw new Error(`Dev server exited: ${output}`);
      try {
        const response = await fetch(`http://127.0.0.1:${port}${pathname}`, { signal: AbortSignal.timeout(2000) });
        const body = await response.text();
        if (response.ok && body.includes(expected)) return;
        lastResponse = `${response.status} ${body.slice(0, 500)}`;
      } catch { /* Vite is still starting. */ }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error(`Dev server did not serve ${expected}. Last response: ${lastResponse}. Server: ${output}`);
  } finally {
    if (child.pid) {
      try {
        if (process.platform === 'win32') child.kill('SIGTERM');
        else process.kill(-child.pid, 'SIGTERM');
      } catch (error) {
        if (error.code !== 'ESRCH') throw error;
      }
    }
    if (child.exitCode === null) await Promise.race([once(child, 'exit'), new Promise((resolve) => setTimeout(resolve, 2000))]);
  }
}

async function checkFresh(project, launcher, archives) {
  await mkdir(project);
  await command(path.join(launcher, 'node_modules/.bin/svartz'), ['init', '--no-install', '--no-git'], project);
  await localDependencies(project, archives);
  await command('npm', ['install', '--no-audit', '--no-fund'], project);
  await command('node', ['--input-type=module', '-e', [
    "import { citations, hardLineBreaks, oxHugoFlavoredMarkdown, roamFlavoredMarkdown } from '@svartz/plugins';",
    "import minimalTheme from '@svartz/theme-minimal';",
    'for (const plugin of [citations(), hardLineBreaks(), oxHugoFlavoredMarkdown(), roamFlavoredMarkdown()]) {',
    "  if (!plugin.id) throw new Error('Packed optional plugin export is invalid');",
    '}',
    "if (minimalTheme().version !== '1.0.0') throw new Error('Packed minimal theme has a stale manifest version');",
  ].join('\n')], project);
  await command('npm', ['run', 'build'], project);
  const html = await readFile(path.join(project, '.svartz/vaults/notes/dist/index.html'), 'utf8');
  assert.match(html, /Svartz/);
  await checkDev(project, '/', 'Svartz');
  console.log('Packed fresh project: install, static build, and dev passed.');
}

async function checkHost(project, launcher, archives) {
  await mkdir(project);
  await write(project, 'package.json', JSON.stringify({
    name: 'svartz-release-host', private: true, type: 'module',
    scripts: { build: 'vite build' },
    devDependencies: {
      '@sveltejs/adapter-static': '^3.0.10',
      '@sveltejs/kit': '^2.63.0',
      '@sveltejs/vite-plugin-svelte': '^7.0.0',
      svelte: '^5.56.0', 'svelte-check': '^4.4.2', typescript: '^5.9.3', vite: '^8.0.0',
    },
  }, null, 2));
  await write(project, 'vite.config.ts', "import { sveltekit } from '@sveltejs/kit/vite';\nimport { defineConfig } from 'vite';\nexport default defineConfig({ plugins: [sveltekit()] });\n");
  await write(project, 'svelte.config.js', "import adapter from '@sveltejs/adapter-static';\nexport default { kit: { adapter: adapter() } };\n");
  await write(project, 'tsconfig.json', JSON.stringify({
    extends: './.svelte-kit/tsconfig.json',
    compilerOptions: { allowJs: true, checkJs: true, moduleResolution: 'bundler', skipLibCheck: true, strict: true },
  }, null, 2));
  await write(project, 'src/app.html', '<!doctype html><html lang="en"><head>%sveltekit.head%</head><body>%sveltekit.body%</body></html>');
  await write(project, 'src/routes/+layout.ts', 'export const prerender = true;\n');
  await write(project, 'src/routes/+page.svelte', '<h1>Portfolio home</h1>\n');
  await command(path.join(launcher, 'node_modules/.bin/svartz'), ['init', '--no-install'], project);
  await localDependencies(project, archives);
  const configPath = path.join(project, 'svartz.config.ts');
  const config = await readFile(configPath, 'utf8');
  await writeFile(configPath, config
    .replace("target: { type: 'host' },", "target: { type: 'host' },\n    mountPath: 'notes',")
    .replace(/site: \{ title: ([^}]+) \}/,
      "site: { title: $1, url: 'https://example.test' }"));
  await write(project, 'src/routes/check/+page.svelte', "<script lang=\"ts\">import { index } from 'virtual:svartz/artifacts';</script><p>Published notes: {index.entries.length}</p>\n");
  await write(project, 'check-types.ts', [
    '/// <reference types="@svartz/vite/virtual-modules" />',
    "import { prepareHostVault } from 'virtual:svartz/host';",
    "import { ready } from 'virtual:svartz/theme';",
    'const prepared: Promise<void> = ready;',
    "void Promise.all([prepared, prepareHostVault('/notes/')]);",
  ].join('\n'));
  await write(project, 'src/routes/rss.xml/+server.ts', [
    "import { vaults } from 'virtual:svartz/host';",
    "import { renderHostRss } from '@svartz/vite/discovery';",
    'export const prerender = true;',
    "export const GET = () => new Response(renderHostRss(vaults, ['notes'], { title: 'Portfolio', url: 'https://example.test' }), { headers: { 'content-type': 'application/rss+xml' } });",
  ].join('\n'));
  await command('npm', ['install', '--no-audit', '--no-fund'], project);
  await command('node', ['--input-type=module', '-e', [
    "import { createRequire } from 'node:module';",
    "const require = createRequire(import.meta.resolve('svartz'));",
    "const version = require('vite/package.json').version;",
    "if (!version.startsWith('8.')) throw new Error(`Packed CLI loaded Vite ${version}, expected Vite 8`);",
  ].join('\n')], project);
  await command(path.join(project, 'node_modules/.bin/tsc'),
    ['--noEmit', '--skipLibCheck', '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'es2022', 'vite.config.ts', 'svartz.config.ts', 'check-types.ts'], project);
  await command('npm', ['run', 'svartz:build'], project);
  await command(path.join(project, 'node_modules/.bin/svelte-check'), ['--tsconfig', './tsconfig.json'], project);
  const sourcesPath = path.join(project, '.svartz/vaults/notes/tailwind-sources.css');
  const tailwindSources = await readFile(sourcesPath, 'utf8');
  const sourceGlobs = [...tailwindSources.matchAll(/@source "([^"]+)"/g)].map((match) => match[1]);
  assert.equal(sourceGlobs.length, 2, 'Packed host must scan only the theme and UI package');
  for (const sourceGlob of sourceGlobs) {
    assert(sourceGlob.includes('/dist/'), `Packed package source must use dist: ${sourceGlob}`);
    await stat(path.resolve(path.dirname(sourcesPath), sourceGlob.split('/**/')[0]));
  }
  assert.match(await readFile(path.join(project, 'src/routes/+page.svelte'), 'utf8'), /Portfolio home/);
  assert.match(await readFile(path.join(project, 'build/check.html'), 'utf8'), /Published notes: 1/);
  assert.match(await readFile(path.join(project, 'build/notes.html'), 'utf8'), /Welcome/);
  assert.match(await readFile(path.join(project, 'build/rss.xml'), 'utf8'), /https:\/\/example\.test\//);
  await checkDev(project, '/', 'Portfolio home');
  await checkDev(project, '/notes/', 'Welcome');
  console.log('Packed Vite 8 host: integration, types, static build, and dev passed.');
}

const temporary = await mkdtemp(path.join(os.tmpdir(), 'svartz-release-'));
try {
  const archives = new Map();
  for (const [name, directory, required] of packages) {
    const manifest = JSON.parse(await readFile(path.join(root, directory, 'package.json'), 'utf8'));
    assert.equal(manifest.version, '1.0.0', `${name} version`);
    assert.equal(manifest.publishConfig?.access, 'public', `${name} visibility`);
    assert.equal(manifest.license, 'SEE LICENSE IN LICENSE', `${name} license metadata`);
    assert.equal(await readFile(path.join(root, directory, 'LICENSE'), 'utf8'), licenseText, `${name} license text`);
    const output = await command('pnpm', ['pack', '--json', '--pack-destination', temporary], path.join(root, directory));
    // The UI and theme prepack scripts print before pnpm's JSON report.
    const reportStart = output.lastIndexOf('\n{\n  "name"');
    const packed = JSON.parse(output.slice(reportStart + 1));
    const files = new Set(packed.files.map((file) => file.path));
    assert(files.has('LICENSE'), `${name} archive is missing LICENSE`);
    for (const file of required) assert(files.has(file), `${name} is missing ${file}`);
    for (const entry of Object.values(manifest.exports ?? {})) {
      for (const target of typeof entry === 'string' ? [entry] : Object.values(entry)) {
        assert(files.has(target.replace(/^\.\//, '')), `${name} export ${target} is missing`);
      }
    }
    for (const target of [manifest.main, manifest.types, ...Object.values(manifest.bin ?? {})]) {
      if (target) assert(files.has(target.replace(/^\.\//, '')), `${name} entry ${target} is missing`);
    }
    assert([...files].every((file) => !/^(src|tests|test|\.svelte-kit)\//.test(file)), `${name} includes development files`);
    const archive = packed.filename;
    assert.equal(await command('tar', ['-xOf', archive, 'package/LICENSE'], root), licenseText,
      `${name} archive license text`);
    const published = JSON.parse(await command('tar', ['-xOf', archive, 'package/package.json'], root));
    for (const [dependency, range] of Object.entries(manifest.dependencies ?? {})) {
      if (!dependency.startsWith('@svartz/')) continue;
      assert(range.startsWith('workspace:'), `${name} has an unexpected ${dependency} source range`);
      assert.match(published.dependencies[dependency], /^\^?1\.0\.0$/, `${name} did not resolve ${dependency}`);
    }
    archives.set(name, archive);
  }
  console.log('Seven public archives: runtime files and package boundaries passed.');

  const launcher = path.join(temporary, 'launcher');
  await mkdir(launcher);
  await write(launcher, 'package.json', '{"name":"svartz-release-launcher","private":true,"type":"module"}\n');
  await command('npm', ['install', '--no-audit', '--no-fund', ...archives.values()], launcher);
  await checkFresh(path.join(temporary, 'fresh'), launcher, archives);
  await checkHost(path.join(temporary, 'host'), launcher, archives);
} finally {
  if (!process.env.SVARTZ_RELEASE_KEEP_TEMP) await rm(temporary, { recursive: true, force: true });
  else console.log(`Release fixtures: ${temporary}`);
}
