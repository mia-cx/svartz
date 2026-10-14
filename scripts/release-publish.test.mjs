import assert from 'node:assert/strict';
import test from 'node:test';
import { publishArchives, requireCleanReleaseCheckout } from './release-publish.mjs';
import { RELEASE_PACKAGES, readReleasePackages } from './release-packages.mjs';

test('publication is sequential, dependencies precede the CLI, and retries skip identical versions', async () => {
  const packages = readReleasePackages();
  const events = [];
  await publishArchives(packages, {
    pack: async ({ name }) => { events.push(`pack:${name}`); return `${name}.tgz`; },
    published: async ({ name }) => { events.push(`check:${name}`); return name === '@svartz/core'; },
    publish: async ({ name }, archive) => {
      assert.equal(archive, `${name}.tgz`);
      events.push(`publish:${name}`);
    },
  });
  assert.equal(events.includes('publish:@svartz/core'), false);
  assert.equal(events.at(-1), 'publish:svartz');
  for (const [name] of RELEASE_PACKAGES.slice(1)) {
    const index = events.indexOf(`pack:${name}`);
    assert.equal(events[index + 1], `check:${name}`);
    assert.equal(events[index + 2], `publish:${name}`);
  }
});

test('a failed registry or publish step stops before dependents', async () => {
  for (const failAt of ['published', 'publish']) {
    const events = [];
    await assert.rejects(publishArchives(readReleasePackages(), {
      pack: async ({ name }) => { events.push(name); return 'archive'; },
      published: async () => { if (failAt === 'published') throw new Error('registry mismatch'); return false; },
      publish: async () => { throw new Error('publish failed'); },
    }), /registry mismatch|publish failed/);
    assert.deepEqual(events, ['@svartz/core']);
  }
});

test('bootstrap requires a clean checkout on the merged base head', () => {
  const sha = 'a'.repeat(40);
  const git = (status, head = sha, remote = sha) => (...args) => {
    if (args[0] === 'status') return status;
    if (args[0] === 'rev-parse') return args[1] === 'HEAD' ? head : remote;
    return '';
  };
  requireCleanReleaseCheckout(git(''));
  assert.throws(() => requireCleanReleaseCheckout(git(' M packages/core/src/index.ts')),
    /clean working tree/);
  assert.throws(() => requireCleanReleaseCheckout(git('', sha, 'b'.repeat(40))),
    /origin\/sveltekit-rewrite/);
});
