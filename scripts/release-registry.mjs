import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
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

const integrityOf = (bytes) => `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
const DEPENDENCY_GROUPS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];
/**
 * Files in a gzipped tarball, by path. System tar resolves PAX and GNU long names;
 * links and other special entries fail, since npm packages never contain them.
 */
function archiveFiles(tarball) {
  const root = mkdtempSync(join(tmpdir(), 'svartz-archive-'));
  try {
    execFileSync('tar', ['-xzf', '-', '-C', root], { input: tarball, stdio: ['pipe', 'ignore', 'pipe'] });
    const files = new Map();
    for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
      const path = relative(root, join(entry.parentPath, entry.name));
      if (entry.isDirectory()) continue;
      assert.ok(entry.isFile(), `Unsupported archive entry ${path}`);
      files.set(path, readFileSync(join(root, path)));
    }
    return files;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/**
 * pnpm 9 rewrites `workspace:` ranges in parallel and writes each dependency as it resolves,
 * so two packs of one commit can list dependencies in different orders. Only that order is ignored.
 */
function comparable(path, bytes) {
  if (path !== 'package/package.json') return bytes.toString('base64');
  const manifest = JSON.parse(bytes.toString('utf8'));
  for (const group of DEPENDENCY_GROUPS.filter((group) => manifest[group])) {
    manifest[group] = Object.fromEntries(Object.entries(manifest[group]).sort(([a], [b]) => (a < b ? -1 : 1)));
  }
  return JSON.stringify(manifest);
}

/** True when both archives hold the same files with the same bytes, apart from dependency order. */
function sameArchiveContents(left, right) {
  const [a, b] = [archiveFiles(left), archiveFiles(right)];
  return a.size === b.size &&
    [...a].every(([path, bytes]) => b.has(path) && comparable(path, bytes) === comparable(path, b.get(path)));
}

/** A retry skips publication only when npm serves the tested pnpm archive's contents. */
export async function alreadyPublished(name, version, tarball, request = fetch) {
  const manifest = await registryManifest(name, version, request);
  if (!manifest) return false;
  assert.ok(manifest.dist?.integrity && manifest.dist.tarball, 'Registry manifest lacks dist integrity.');
  if (manifest.dist.integrity === integrityOf(tarball)) return true;
  const response = await request(manifest.dist.tarball);
  assert.ok(response.ok, `Tarball download failed with HTTP ${response.status}.`);
  const published = Buffer.from(await response.arrayBuffer());
  assert.equal(integrityOf(published), manifest.dist.integrity, 'Downloaded tarball does not match its registry integrity.');
  assert.ok(sameArchiveContents(published, tarball), 'Published version differs from the tested tarball.');
  return true;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const archive = resolve(process.argv[2]);
  const { name, version } = JSON.parse(execFileSync('tar', ['-xOf', archive, 'package/package.json'], { encoding: 'utf8' }));
  console.log(`exists=${await alreadyPublished(name, version, readFileSync(archive))}`);
}
