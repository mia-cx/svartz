import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readReleasePackages } from './release-packages.mjs';

/** Theme metadata follows package versions. The v1 runtime contract remains independent. */
export function replaceThemeVersion(source, version) {
  assert.match(version, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
  const pattern = /^(\s*version: ')[^']+(',)$/gm;
  assert.equal([...source.matchAll(pattern)].length, 1, 'Expected one theme version');
  return source.replace(pattern, `$1${version}$2`);
}

/** Synchronize theme manifests after Changesets versions the fixed public group. */
export async function synchronizeReleaseVersion(root) {
  for (const { directory, version } of readReleasePackages(root)) {
    if (!directory.startsWith('themes/')) continue;
    const file = resolve(root, directory, 'src/lib/manifest.ts');
    const before = await readFile(file, 'utf8');
    const after = replaceThemeVersion(before, version);
    if (after !== before) await writeFile(file, after);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await synchronizeReleaseVersion(process.cwd());
}
