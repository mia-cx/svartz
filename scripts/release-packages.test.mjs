import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { RELEASE_PACKAGES, readReleasePackages } from './release-packages.mjs';

const repo = fileURLToPath(new URL('../', import.meta.url));

const fixture = (mutate = () => {}) => {
  const root = mkdtempSync(join(tmpdir(), 'svartz-packages-'));
  for (const [name, directory] of RELEASE_PACKAGES) {
    const manifest = {
      name,
      version: '1.0.0',
      repository: { type: 'git', url: 'https://github.com/mia-cx/svartz.git', directory },
    };
    mutate(manifest);
    mkdirSync(join(root, directory), { recursive: true });
    writeFileSync(join(root, directory, 'package.json'), JSON.stringify(manifest));
  }
  return root;
};

test('release packages accept the real repository metadata', () => {
  const packages = readReleasePackages(repo);
  assert.equal(packages.length, RELEASE_PACKAGES.length);
});

test('release packages reject missing or wrong repository metadata', () => {
  assert.throws(() => readReleasePackages(fixture((manifest) => {
    delete manifest.repository;
  })), /repository\.url/);
  assert.throws(() => readReleasePackages(fixture((manifest) => {
    manifest.repository.url = 'https://github.com/mia-cx/other.git';
  })), /repository\.url/);
  assert.throws(() => readReleasePackages(fixture((manifest) => {
    manifest.repository.directory = 'packages/other';
  })), /repository\.directory/);
});

test('every internal dependency publishes before its dependent', () => {
  const order = new Map(RELEASE_PACKAGES.map(([name], index) => [name, index]));
  for (const [name, directory] of RELEASE_PACKAGES) {
    const manifest = JSON.parse(readFileSync(join(repo, directory, 'package.json'), 'utf8'));
    for (const group of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
      for (const dependency of Object.keys(manifest[group] ?? {})) {
        if (!order.has(dependency)) continue;
        assert.ok(order.get(dependency) < order.get(name),
          `${name} depends on ${dependency} but publishes earlier`);
      }
    }
  }
});
