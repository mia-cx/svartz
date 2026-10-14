import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { replaceThemeVersion, synchronizeReleaseVersion } from './release-version.mjs';
import { readReleasePackages, RELEASE_PACKAGES } from './release-packages.mjs';
import { changelogSection } from './changelog-section.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

test('theme package versions change without changing the v1 contract', () => {
  const source = "  version: '1.0.0',\n  contractVersion: '1.0.0',\n";
  assert.equal(replaceThemeVersion(source, '1.1.0'), "  version: '1.1.0',\n  contractVersion: '1.0.0',\n");
  assert.throws(() => replaceThemeVersion('', '1.1.0'));
  assert.throws(() => replaceThemeVersion(source + source, '1.1.0'));
  assert.throws(() => replaceThemeVersion(source, '1.1.0-rc.1'));
});

for (const target of ['@svartz/core', '@svartz/theme-wiki']) {
  test(`real Changesets CLI bumps the whole fixed group for ${target} and ignores private workspaces`, async (t) => {
    const fixture = await mkdtemp(join(tmpdir(), 'svartz-version-test-'));
    t.after(() => rm(fixture, { recursive: true, force: true }));
    for (const file of ['package.json', 'pnpm-workspace.yaml', '.changeset/config.json',
      'apps/web/package.json', 'packages/reference/package.json',
      ...RELEASE_PACKAGES.map(([, directory]) => `${directory}/package.json`),
      ...RELEASE_PACKAGES.filter(([, directory]) => directory.startsWith('themes/'))
        .map(([, directory]) => `${directory}/src/lib/manifest.ts`)]) {
      await mkdir(dirname(join(fixture, file)), { recursive: true });
      await cp(join(root, file), join(fixture, file));
    }
    const run = (file, args) => execFileSync(file, args, { cwd: fixture, encoding: 'utf8' });
    run('git', ['init', '-b', 'sveltekit-rewrite']);
    run('git', ['add', '.']);
    run('git', ['-c', 'user.name=Release test', '-c', 'user.email=release@example.test',
      '-c', 'commit.gpgsign=false', 'commit', '-m', 'fixture']);
    const privateBefore = await readFile(join(fixture, 'apps/web/package.json'), 'utf8');
    await writeFile(join(fixture, '.changeset/test.md'), `---\n"${target}": patch\n---\n\nRelease fixture.\n`);
    const cli = join(root, 'node_modules/@changesets/cli/bin.js');
    run(process.execPath, [cli, 'version']);
    await synchronizeReleaseVersion(fixture);
    const current = readReleasePackages(fixture);
    const before = readReleasePackages(root)[0].version;
    const expected = before.split('.').map((part, i) => i === 2 ? String(Number(part) + 1) : part).join('.');
    assert.ok(current.every(({ version }) => version === expected));
    assert.equal(await readFile(join(fixture, 'apps/web/package.json'), 'utf8'), privateBefore);
    for (const { directory } of current) {
      assert.ok(changelogSection(await readFile(join(fixture, directory, 'CHANGELOG.md'), 'utf8'), expected));
      const manifest = JSON.parse(await readFile(join(fixture, directory, 'package.json'), 'utf8'));
      for (const range of Object.values(manifest.dependencies ?? {})) {
        if (range.startsWith('workspace:')) assert.ok(['workspace:^', 'workspace:*'].includes(range));
      }
      if (directory.startsWith('themes/')) {
        const source = await readFile(join(fixture, directory, 'src/lib/manifest.ts'), 'utf8');
        assert.ok(source.includes(`version: '${expected}'`));
        assert.ok(source.includes("contractVersion: '1.0.0'"));
      }
    }
    run('git', ['add', '.']);
    run('git', ['-c', 'user.name=Release test', '-c', 'user.email=release@example.test',
      '-c', 'commit.gpgsign=false', 'commit', '-m', 'release']);
    run(process.execPath, [cli, 'status', '--output', join(fixture, 'status.json')]);
    assert.deepEqual(JSON.parse(await readFile(join(fixture, 'status.json'), 'utf8')).releases, []);
    const sha = run('git', ['rev-parse', 'HEAD']).trim();
    const releasePr = {
      merged_at: '2026-10-14T00:00:00Z', merge_commit_sha: sha,
      base: { ref: 'sveltekit-rewrite', repo: { full_name: 'mia-cx/svartz' } },
      head: { ref: 'changeset-release/sveltekit-rewrite', repo: { full_name: 'mia-cx/svartz' } },
    };
    // A dispatch sees newer pending notes. Resolve its input SHA before reading release metadata.
    await writeFile(join(fixture, '.changeset/later.md'), '---\n"svartz": patch\n---\n\nLater change.\n');
    run('git', ['add', '.']);
    run('git', ['-c', 'user.name=Release test', '-c', 'user.email=release@example.test',
      '-c', 'commit.gpgsign=false', 'commit', '-m', 'later work']);
    const runnerSha = run('git', ['rev-parse', 'HEAD']).trim();
    run('git', ['update-ref', 'refs/remotes/origin/sveltekit-rewrite', runnerSha]);
    run('git', ['checkout', '--detach', runnerSha]);
    run('git', ['branch', '-D', 'sveltekit-rewrite']);
    const workflow = await readFile(join(root, '.github/workflows/release.yml'), 'utf8');
    const resolveStep = workflow.match(
      /name: Resolve the release commit\n[\s\S]*? {8}run: \|\n((?: {10}[^\n]*(?:\n|$)|\n)*)/
    )[1].replace(/^ {10}/gm, '');
    const output = join(fixture, 'github-output');
    execFileSync('bash', ['-euo', 'pipefail', '-c', resolveStep], {
      cwd: fixture, env: { ...process.env, RETRY_SHA: sha, GITHUB_SHA: runnerSha, GITHUB_OUTPUT: output },
    });
    assert.equal(run('git', ['rev-parse', 'HEAD']).trim(), sha);
    assert.equal(await readFile(output, 'utf8'), `sha=${sha}\n`);
    const planCode = [
      `import { planCurrentRelease } from ${JSON.stringify(new URL('./release-plan.mjs', import.meta.url).href)};`,
      'globalThis.fetch = async () => new Response(null, { status: 404 });',
      `console.log(JSON.stringify(await planCurrentRelease([${JSON.stringify(releasePr)}], { retry: true, sha: ${JSON.stringify(sha)} })));`,
    ].join('\n');
    const plan = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', planCode], {
      cwd: fixture, encoding: 'utf8', env: { ...process.env, GITHUB_REPOSITORY: 'mia-cx/svartz' },
    }));
    assert.equal(plan.release, true);
    assert.equal(plan.pending, false);
    assert.deepEqual(plan.packages, RELEASE_PACKAGES.map(([name]) => name));
  });
}
