import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { alreadyPublished } from './release-registry.mjs';
import { readReleasePackages } from './release-packages.mjs';

const run = (file, args, cwd = process.cwd()) =>
  execFileSync(file, args, { cwd, stdio: 'inherit' });

/** Publish in dependency order; identical versions are safe to retry, different archives fail closed. */
export async function publishArchives(packages, { pack, published, publish }) {
  for (const pkg of packages) {
    const archive = await pack(pkg);
    if (await published(pkg, archive)) {
      console.log(`Skipping identical ${pkg.name}@${pkg.version}`);
      continue;
    }
    await publish(pkg, archive);
  }
}

/** Pack with pnpm so workspace ranges resolve, then publish those exact files with npm. */
export async function publishRelease(names, { bootstrap = false } = {}) {
  const root = process.cwd();
  const packages = readReleasePackages(root);
  assert.ok(Array.isArray(names) && names.length > 0, 'Expected a non-empty package list');
  assert.equal(new Set(names).size, names.length, 'Duplicate package names');
  for (const name of names) assert.ok(packages.some((pkg) => pkg.name === name), `Unknown package ${name}`);
  if (bootstrap) {
    assert.ok(packages.every(({ version }) => version === '1.0.0'), 'Bootstrap is only for 1.0.0');
    run('pnpm', ['release:check']);
  }
  const temporary = await mkdtemp(join(tmpdir(), 'svartz-publish-'));
  try {
    await publishArchives(packages.filter(({ name }) => names.includes(name)), {
      pack: async ({ directory, name, version }) => {
        const output = execFileSync('pnpm', ['pack', '--json', '--pack-destination', temporary], {
          cwd: join(root, directory), encoding: 'utf8', maxBuffer: 10 * 1024 * 1024,
        });
        process.stdout.write(output);
        const start = output.lastIndexOf('\n{\n  "name"');
        const report = JSON.parse(output.slice(start + 1));
        assert.equal(report.name, name);
        assert.equal(report.version, version);
        const archive = resolve(root, directory, report.filename);
        const manifest = JSON.parse(execFileSync('tar', ['-xOf', archive, 'package/package.json'], { encoding: 'utf8' }));
        assert.equal(manifest.name, name);
        assert.equal(manifest.version, version);
        for (const group of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
          for (const range of Object.values(manifest[group] ?? {})) {
            assert.ok(!range.startsWith('workspace:'), 'Archive contains an unresolved workspace range');
          }
        }
        return archive;
      },
      published: async ({ name, version }, archive) => alreadyPublished(name, version, await readFile(archive)),
      publish: async (_pkg, archive) => run('npm', [
        'publish', archive, '--access', 'public',
        ...bootstrap ? [] : ['--provenance'],
        '--ignore-scripts',
      ]),
    });
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const bootstrap = process.argv[2] === 'bootstrap';
  assert.ok(bootstrap || process.argv[2] === 'publish', 'Expected bootstrap or publish');
  const names = bootstrap
    ? readReleasePackages().map(({ name }) => name)
    : JSON.parse(process.env.SVARTZ_RELEASE_PACKAGES);
  await publishRelease(names, { bootstrap });
}
