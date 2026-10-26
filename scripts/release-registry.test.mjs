import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { alreadyPublished, registryManifest } from './release-registry.mjs';

const archive = Buffer.from('tested pnpm archive');
const manifest = { name: '@svartz/core', version: '1.0.0',
  dist: { integrity: `sha512-${createHash('sha512').update(archive).digest('base64')}`,
    tarball: 'https://registry.npmjs.org/@svartz/core/-/core-1.0.0.tgz' } };

test('identical archives are skipped; missing packages or versions are publishable', async () => {
  assert.equal(await alreadyPublished(manifest.name, manifest.version, archive, async (url) => {
    assert.equal(url, 'https://registry.npmjs.org/%40svartz%2Fcore/1.0.0');
    return Response.json(manifest);
  }), true);
  assert.equal(await alreadyPublished(manifest.name, manifest.version, archive,
    async () => new Response(null, { status: 404 })), false);
});

/** A gzipped PAX package archive, as pnpm packs one; `links` become symlinks. */
function packArchive(packageJson, files = { 'index.js': 'export {};\n' }, links = {}) {
  const root = mkdtempSync(join(tmpdir(), 'svartz-registry-'));
  try {
    mkdirSync(join(root, 'package'));
    writeFileSync(join(root, 'package/package.json'), JSON.stringify(packageJson, null, 2));
    for (const [path, text] of Object.entries(files)) writeFileSync(join(root, 'package', path), text);
    for (const [path, target] of Object.entries(links)) symlinkSync(target, join(root, 'package', path));
    return execFileSync('tar', ['--format=pax', '-czf', '-', '-C', root, 'package']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/** The registry serving `published` as `@svartz/theme-api-docs@1.1.0`. */
const registryFor = (published) => async (url) => url.endsWith('.tgz')
  ? new Response(published)
  : Response.json({ name: '@svartz/theme-api-docs', version: '1.1.0', dist: {
    integrity: `sha512-${createHash('sha512').update(published).digest('base64')}`,
    tarball: 'https://registry.npmjs.org/@svartz/theme-api-docs/-/theme-api-docs-1.1.0.tgz',
  } });

const themeManifest = (dependencies, exports = { '.': { svelte: './index.js', default: './index.js' } }) =>
  ({ name: '@svartz/theme-api-docs', version: '1.1.0', exports, dependencies });

test('a retry skips a published archive whose only change is dependency order', async () => {
  const published = packArchive(themeManifest({ '@svartz/ui': '1.1.0', '@svartz/core': '1.1.0' }));
  const tested = packArchive(themeManifest({ '@svartz/core': '1.1.0', '@svartz/ui': '1.1.0' }));
  assert.equal(await alreadyPublished('@svartz/theme-api-docs', '1.1.0', tested, registryFor(published)), true);
});

test('a retry rejects published archives with other differences', async () => {
  const dependencies = { '@svartz/core': '1.1.0', '@svartz/ui': '1.1.0' };
  const tested = packArchive(themeManifest(dependencies));
  for (const published of [
    packArchive(themeManifest(dependencies), { 'index.js': 'export const changed = true;\n' }),
    packArchive(themeManifest({ ...dependencies, '@svartz/ui': '1.0.1' })),
    packArchive(themeManifest(dependencies, { '.': { default: './index.js', svelte: './index.js' } })),
  ]) {
    await assert.rejects(alreadyPublished('@svartz/theme-api-docs', '1.1.0', tested, registryFor(published)), /differs/);
  }
  const corrupted = registryFor(tested);
  await assert.rejects(alreadyPublished('@svartz/theme-api-docs', '1.1.0', packArchive(themeManifest({})),
    async (url) => url.endsWith('.tgz') ? new Response('truncated') : corrupted(url)), /registry integrity/);
});

test('a retry compares long file names in full and rejects links', async () => {
  const [first, second] = [`${'a'.repeat(120)}.js`, `${'z'.repeat(120)}.js`];
  const manifest = themeManifest({});
  const tested = packArchive(manifest, { [first]: 'export const a = 1;\n', [second]: 'export const z = 1;\n' });
  for (const [published, error] of [
    [packArchive(manifest, { [first]: 'export const a = 2;\n', [second]: 'export const z = 1;\n' }), /differs/],
    [packArchive(manifest, { [first]: 'export const a = 1;\n' }, { [second]: first }), /Unsupported archive entry/],
  ]) {
    await assert.rejects(alreadyPublished('@svartz/theme-api-docs', '1.1.0', tested, registryFor(published)), error);
  }
});

test('registry errors, wrong identities, and missing integrity fail closed', async () => {
  for (const status of [401, 403, 429, 503]) {
    await assert.rejects(registryManifest(manifest.name, manifest.version,
      async () => new Response(null, { status })), new RegExp(`HTTP ${status}`));
  }
  await assert.rejects(registryManifest(manifest.name, manifest.version,
    async () => { throw new Error('network down'); }), /network down/);
  for (const response of [{ ...manifest, name: 'svartz' }, { ...manifest, version: '1.0.1' },
    { ...manifest, dist: {} }]) {
    await assert.rejects(alreadyPublished(manifest.name, manifest.version, archive,
      async () => Response.json(response)));
  }
});
