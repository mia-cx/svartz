// Benchmark-only preload: keep both Vite passes' keys to measure actual cache hits.
// The runner still deletes the whole profile's generated site before its cold build.
import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { basename, dirname } from 'node:path';

const folder = process.env.STRESS_VERSION_CACHE;
if (folder) {
  const rm = fs.rm;
  fs.rm = async (path, options) => {
    if (typeof path === 'string' && dirname(path) === folder && /^[a-f\d]{64}\.json$/.test(basename(path))) return;
    return rm(path, options);
  };
  syncBuiltinESMExports();
}
