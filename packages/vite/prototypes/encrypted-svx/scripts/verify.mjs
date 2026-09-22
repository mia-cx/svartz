import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, readdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';

const password = process.env.SVARTZ_PROTOTYPE_PASSWORD;
if (!password) throw new Error('Set SVARTZ_PROTOTYPE_PASSWORD to the build password');
const results = [];
const check = async (name, run) => {
  try { await run(); results.push({ name, pass: true }); console.log('PASS ' + name); }
  catch (error) { results.push({ name, pass: false, error: String(error) }); throw error; }
};
const secrets = ['SVX_SECRET_BODY_6e1d72', 'SVX_SECRET_CSS_982ab1', 'SVX_SECRET_COUNTER_9bb812', 'SVX_SECRET_DYNAMIC_bcad32', 'SVX_SECRET_ASSET_6aa84f', password];
const files = [];
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await walk(path); else files.push(path);
  }
}
await mkdir('evidence', { recursive: true });
await check('No protected markers, password, source maps, or SVX in static output', async () => {
  await walk('build');
  for (const file of files) {
    assert(!file.endsWith('.map') && !file.endsWith('.svx'), file);
    const contents = await readFile(file);
    for (const secret of secrets) assert(!contents.includes(Buffer.from(secret)), secret + ' leaked into ' + file);
  }
  const shell = await readFile('build/index.html', 'utf8');
  assert(shell.includes('Encrypted SVX prototype'));
  assert(shell.includes('content-security-policy'));
  assert(shell.includes('blob:'));
  assert(!shell.includes('unsafe-eval'));
  assert(!shell.includes('unsafe-inline'));
});
const server = await serve();
const strictServer = await serve(0, false);
const origin = 'http://127.0.0.1:' + server.address().port;
const strictOrigin = 'http://127.0.0.1:' + strictServer.address().port;
const profile = await mkdtemp(join(tmpdir(), 'svartz-prototype-chromium-'));
const child = spawn('/usr/bin/chromium', ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { stdio: 'ignore' });
let browser;
let context;
const runtimeErrors = [];
try {
  let port;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break; }
    catch (error) { if (error.code !== 'ENOENT') throw error; await delay(100); }
  }
  assert(port, 'Chromium CDP port did not appear');
  browser = await chromium.connectOverCDP('http://127.0.0.1:' + port);
  context = await browser.newContext();
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  page.on('pageerror', (error) => runtimeErrors.push(String(error)));
  const status = (text) => page.waitForFunction((value) => document.querySelector('[role=status]')?.textContent === value, text);
  const submit = async (value) => {
    await page.getByLabel('Password').fill(value);
    await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  };
  await check('Locked static shell hydrates with no protected content or assets', async () => {
    await page.goto(origin + '/prototype/');
    await status('Locked');
    await page.waitForTimeout(150);
    assert(!(await page.content()).includes(secrets[0]));
    assert.equal(await page.locator('[data-protected-style]').count(), 0);
    assert.equal(await page.locator('img').count(), 0);
    const missing = await fetch(origin + '/prototype/private/Note.svx');
    assert.equal(missing.status, 404);
    const plainChunk = await fetch(origin + '/prototype/protected.js');
    assert.equal(plainChunk.status, 404);
    await page.screenshot({ path: 'evidence/locked.png' });
  });
  await check('Wrong password reveals nothing and mounts no component', async () => {
    await submit('incorrect');
    await status('Incorrect password or damaged content');
    assert.equal(await page.locator('[data-protected-mounted]').count(), 0);
    assert.equal(await page.locator('[data-protected-style]').count(), 0);
  });
  await check('Correct password decrypts and imports interactive SVX with scoped CSS and image', async () => {
    await submit(password);
    await status('Unlocked');
    await page.getByText('Session group available: yes', { exact: true }).waitFor();
    await page.getByRole('heading', { name: secrets[0] }).waitFor();
    await page.getByRole('button', { name: secrets[2] + ': 0', exact: true }).click();
    await page.getByRole('button', { name: secrets[2] + ': 1', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Load protected detail' }).click();
    await page.getByText(secrets[3], { exact: true }).waitFor();
    await page.waitForFunction(() => document.querySelector('img')?.naturalWidth === 180);
    assert.equal(await page.locator('img').getAttribute('src').then((url) => url.startsWith('blob:')), true);
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.secret-label')).borderTopWidth === '7px');
    assert.equal(await page.locator('.secret-label').evaluate((node) => getComputedStyle(node, '::after').content), '"' + secrets[1] + '"');
    assert.equal(await page.locator('html').getAttribute('data-protected-mounted'), 'yes');
    await page.screenshot({ path: 'evidence/unlocked.png' });
  });
  await check('SvelteKit navigation unmounts protected runtime and removes its styles', async () => {
    await page.getByRole('link', { name: 'Public page', exact: true }).click();
    await page.getByRole('heading', { name: 'Public page', exact: true }).waitFor();
    await page.waitForFunction(() => !document.documentElement.dataset.protectedMounted);
    assert.equal(await page.locator('[data-protected-style]').count(), 0);
    assert(!(await page.content()).includes(secrets[0]));
    await page.getByRole('link', { name: 'Locked note' }).click();
    await status('Locked');
    await submit('');
    await status('Unlocked');
    await page.getByRole('heading', { name: secrets[0] }).waitFor();
  });
  await check('Relock clears the session key and removes rendered content', async () => {
    await page.getByRole('button', { name: 'Lock', exact: true }).click();
    await status('Locked');
    await page.getByText('Session group available: no', { exact: true }).waitFor();
    assert.equal(await page.locator('[data-protected-style]').count(), 0);
    assert(!(await page.content()).includes(secrets[0]));
    await submit('');
    await status('Incorrect password or damaged content');
  });
  await check('Modified ciphertext fails authentication before executing code', async () => {
    await page.route('**/protected/note.json', async (route) => {
      const envelope = await (await route.fetch()).json();
      const bytes = Buffer.from(envelope.ciphertext, 'base64');
      bytes[bytes.length - 1] ^= 1;
      envelope.ciphertext = bytes.toString('base64');
      await route.fulfill({ json: envelope });
    });
    await submit(password);
    await status('Incorrect password or damaged content');
    assert.equal(await page.locator('[data-protected-style]').count(), 0);
    assert.equal(await page.locator('[data-protected-mounted]').count(), 0);
    await page.unroute('**/protected/note.json');
  });
  await check('Supported CSP emits no uncaught errors', async () => assert.deepEqual(runtimeErrors, []));
  await check('CSP without blob script permission blocks the encrypted component', async () => {
    await page.goto(strictOrigin + '/prototype/');
    await status('Locked');
    await submit(password);
    await page.waitForFunction(() => document.querySelector('[role=status]')?.textContent?.includes('Failed to fetch dynamically imported module'));
    assert.equal(await page.locator('[data-protected-mounted]').count(), 0);
    assert.equal(await page.locator('[data-protected-style]').count(), 0);
  });
  await writeFile('evidence/browser.json', JSON.stringify({ browser: browser.version(), basePath: '/prototype/', staticFiles: files.length, checks: results }, null, 2) + '\n');
} catch (error) {
  await writeFile('evidence/browser.json', JSON.stringify({ checks: results, error: String(error) }, null, 2) + '\n');
  throw error;
} finally {
  await context?.close();
  await browser?.close();
  child.kill('SIGTERM');
  await new Promise((resolve) => server.close(resolve));
  await new Promise((resolve) => strictServer.close(resolve));
  await delay(250);
  await rm(profile, { recursive: true, force: true });
}
