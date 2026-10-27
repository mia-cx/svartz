import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const BASE_BRANCH = 'sveltekit-rewrite';
/**
 * The major version Svartz releases ship on. Raising it is the deliberate step
 * a major release takes: changesets may declare `major` only to reach this line.
 */
export const RELEASE_LINE = 2;
/** The major version a package version is on. */
export const majorOf = (version) => Number(version.split('.')[0]);
// Dependencies first. The CLI must never point at packages that have not been published.
export const RELEASE_PACKAGES = [
  ['@svartz/core', 'packages/core'],
  ['@svartz/plugins', 'packages/plugins'],
  ['@svartz/config', 'packages/config'],
  ['@svartz/ui', 'packages/ui'],
  ['@svartz/theme-minimal', 'themes/minimal'],
  ['@svartz/theme-wiki', 'themes/wiki'],
  ['@svartz/theme-blog', 'themes/blog'],
  ['@svartz/theme-docs', 'themes/docs'],
  ['@svartz/theme-api-docs', 'themes/api-docs'],
  ['@svartz/theme-mcp-docs', 'themes/mcp-docs'],
  ['@svartz/vite', 'packages/vite'],
  ['svartz', 'packages/cli'],
];

/** Read the fixed release group and reject private packages or mismatched versions. */
export function readReleasePackages(root = process.cwd()) {
  const packages = RELEASE_PACKAGES.map(([name, directory]) => {
    const manifest = JSON.parse(readFileSync(join(root, directory, 'package.json'), 'utf8'));
    assert.equal(manifest.name, name);
    assert.ok(!manifest.private, `${name} must be public`);
    // npm provenance names repository.url; directory keeps it honest per package.
    assert.equal(manifest.repository?.url, 'https://github.com/mia-cx/svartz.git', `${name} repository.url`);
    assert.equal(manifest.repository?.directory, directory, `${name} repository.directory`);
    assert.match(manifest.version, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
    assert.ok(majorOf(manifest.version) <= RELEASE_LINE, `${name} must stay on ${RELEASE_LINE}.x or below`);
    return { name, directory, version: manifest.version };
  });
  assert.equal(new Set(packages.map(({ version }) => version)).size, 1, 'Public versions must match');
  return packages;
}
