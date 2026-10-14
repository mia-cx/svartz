import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** A missing version is publishable. Authentication, network, and server failures are errors. */
export async function registryManifest(name, version, request = fetch) {
  const response = await request(`https://registry.npmjs.org/${encodeURIComponent(name)}/${encodeURIComponent(version)}`);
  if (response.status === 404) return null;
  assert.ok(response.ok, `Registry lookup failed with HTTP ${response.status}.`);
  const manifest = await response.json();
  assert.equal(manifest.name, name);
  assert.equal(manifest.version, version);
  return manifest;
}

/** A retry skips publication only when npm serves the exact tested pnpm archive. */
export async function alreadyPublished(name, version, tarball, request = fetch) {
  const manifest = await registryManifest(name, version, request);
  if (!manifest) return false;
  const integrity = `sha512-${createHash('sha512').update(tarball).digest('base64')}`;
  assert.equal(manifest.dist?.integrity, integrity, 'Published version differs from the tested tarball.');
  return true;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const archive = resolve(process.argv[2]);
  const { name, version } = JSON.parse(execFileSync('tar', ['-xOf', archive, 'package/package.json'], { encoding: 'utf8' }));
  console.log(`exists=${await alreadyPublished(name, version, readFileSync(archive))}`);
}
