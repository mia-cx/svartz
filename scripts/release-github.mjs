import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { changelogSection } from './changelog-section.mjs';
import { readReleasePackages } from './release-packages.mjs';

/** Existing lightweight or annotated tags must point to this exact release commit. */
export function tagExistsAt(remoteRefs, tag, sha) {
  const refs = new Map(remoteRefs.trim().split('\n').filter(Boolean).map((line) => {
    const [target, ref] = line.split(/\s+/);
    return [ref, target];
  }));
  const target = refs.get(`refs/tags/${tag}^{}`) ?? refs.get(`refs/tags/${tag}`);
  if (!target) return false;
  assert.equal(target, sha, `Tag ${tag} exists at another commit`);
  return true;
}

/** Combine only the selected version sections; historical notes stay out of the GitHub release. */
export async function releaseNotes(packages, root = process.cwd()) {
  return (await Promise.all(packages.map(async ({ name, directory, version }) =>
    `# ${name}@${version}\n\n${changelogSection(await readFile(join(root, directory, 'CHANGELOG.md'), 'utf8'), version)}`
  ))).join('\n\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const sha = process.env.SVARTZ_RELEASE_SHA;
  assert.match(sha ?? '', /^[a-f0-9]{40}$/);
  assert.equal(process.env.GITHUB_REPOSITORY, 'mia-cx/svartz');
  const packages = readReleasePackages();
  const names = JSON.parse(process.env.SVARTZ_RELEASE_PACKAGES);
  assert.ok(Array.isArray(names) && names.length > 0);
  for (const name of names) assert.ok(packages.some((pkg) => pkg.name === name), `Unknown package ${name}`);
  const selected = packages.filter(({ name }) => names.includes(name));
  // Read all notes and remote tags before creating any tags.
  const notes = await releaseNotes(selected);
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
  const remoteRefs = git('ls-remote', '--tags', 'origin');
  const tags = selected.map(({ name, version }) => `${name}@${version}`);
  const absent = tags.filter((tag) => !tagExistsAt(remoteRefs, tag, sha));
  const releases = JSON.parse(execFileSync('gh', ['api',
    `repos/${process.env.GITHUB_REPOSITORY}/releases?per_page=100`, '--paginate', '--slurp',
  ], { encoding: 'utf8' })).flat();
  for (const tag of absent) {
    // Checkout fetched tags may include an unpushed tag from a previous attempt.
    const local = git('tag', '--list', tag);
    if (local) assert.equal(git('rev-list', '-n', '1', tag), sha);
    else git('tag', tag, sha);
  }
  if (absent.length) git('push', '--atomic', 'origin', ...absent.map((tag) => `refs/tags/${tag}`));
  const version = packages[0].version;
  const tag = `svartz@${version}`;
  // A partial bootstrap may select only missing dependencies, but the release still needs its CLI tag.
  assert.ok(tags.includes(tag) || tagExistsAt(remoteRefs, tag, sha), 'The CLI release tag is missing');
  if (!releases.some((release) => release.tag_name === tag)) {
    const temporary = await mkdtemp(join(tmpdir(), 'svartz-release-notes-'));
    try {
      const file = join(temporary, 'notes.md');
      await writeFile(file, notes + '\n');
      execFileSync('gh', ['release', 'create', tag, '--verify-tag', '--target', sha,
        '--title', `Svartz ${version}`, '--notes-file', file, '--latest'], { stdio: 'inherit' });
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  }
}
