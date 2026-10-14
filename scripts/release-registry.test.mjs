import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { alreadyPublished, registryManifest } from './release-registry.mjs';

const archive = Buffer.from('tested pnpm archive');
const manifest = { name: '@svartz/core', version: '1.0.0',
  dist: { integrity: `sha512-${createHash('sha512').update(archive).digest('base64')}` } };

test('identical archives are skipped; missing packages or versions are publishable', async () => {
  assert.equal(await alreadyPublished(manifest.name, manifest.version, archive, async (url) => {
    assert.equal(url, 'https://registry.npmjs.org/%40svartz%2Fcore/1.0.0');
    return Response.json(manifest);
  }), true);
  assert.equal(await alreadyPublished(manifest.name, manifest.version, archive,
    async () => new Response(null, { status: 404 })), false);
  await assert.rejects(alreadyPublished(manifest.name, manifest.version, Buffer.from('different'),
    async () => Response.json(manifest)), /differs/);
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
