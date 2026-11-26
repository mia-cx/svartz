import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { extname, resolve, sep } from 'node:path';
import { createGzip } from 'node:zlib';

const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.pdf': 'application/pdf',
};

async function serve(dist) {
  const server = createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const file = resolve(dist, `.${pathname}${pathname.endsWith('/') ? 'index.html' : ''}`);
      if (!file.startsWith(dist + sep) || !(await stat(file)).isFile()) throw new Error('Not a file');
      const type = types[extname(file)] ?? 'application/octet-stream';
      const compress = /^(text\/|application\/json)/.test(type) && req.headers['accept-encoding']?.includes('gzip');
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store', ...(compress && { 'Content-Encoding': 'gzip' }) });
      const stream = createReadStream(file);
      stream.on('error', (error) => res.destroy(error));
      (compress ? stream.pipe(createGzip()) : stream).pipe(res);
    } catch {
      res.writeHead(404).end();
    }
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server;
}

// Browser-side clocks only: do not include Playwright RPC or locator polling in the interaction measurements.
function installProbes() {
  const record = window.stress = {};
  const paint = (key, start) => requestAnimationFrame(() => requestAnimationFrame(() => {
    record[key] = performance.now() - start;
  }));
  document.addEventListener('input', (event) => {
    if (!event.target.matches('[aria-label="Search notes"]')) return;
    const start = performance.now();
    const input = event.target.value;
    const observer = new MutationObserver(() => {
      const result = document.querySelector('#sv-search-results [role="option"], .sv-search-empty');
      if (!result) return;
      observer.disconnect();
      record.search = { input, domMs: performance.now() - start, hits: document.querySelectorAll('#sv-search-results [role="option"]').length };
    });
    observer.observe(event.target.closest('dialog'), { childList: true, subtree: true, characterData: true });
  }, true);
  document.addEventListener('click', (event) => {
    if (event.target.closest('[aria-label="Open the full graph"]')) record.graphStart = performance.now();
  }, true);
  const onMotion = (event) => {
    if (!event.target.matches('.graph-canvas-full') || record.motionStart !== undefined) return;
    record.motionStart = performance.now();
    record.initialZoom = event.target.__zoom?.toString();
  };
  for (const kind of ['wheel', 'touchmove']) document.addEventListener(kind, onMotion, { capture: true, passive: true });
  const clear = CanvasRenderingContext2D.prototype.clearRect;
  CanvasRenderingContext2D.prototype.clearRect = function (...args) {
    if (this.canvas.matches('.graph-canvas-full')) {
      if (record.graphStart !== undefined && record.firstDrawMs === undefined) {
        record.firstDrawMs = performance.now() - record.graphStart;
        paint('graphFrameMs', record.graphStart);
      }
      if (record.motionStart !== undefined && record.motionDrawMs === undefined &&
        this.canvas.__zoom?.toString() !== record.initialZoom) {
        record.motionDrawMs = performance.now() - record.motionStart;
        paint('motionFrameMs', record.motionStart);
      }
    }
    return clear.apply(this, args);
  };
}

async function pinch(cdp, { x, y, width, height }) {
  const points = (gap) => [-gap, gap].map((offset, id) => ({ x: Math.round(x + width / 2 + offset), y: Math.round(y + height / 2), id }));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(25) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(60) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

export async function measureBrowser(dist, hrefs, queries, inspect = []) {
  const { chromium, devices } = await import('../../packages/ui/node_modules/playwright/index.mjs');
  const server = await serve(dist);
  const origin = `http://127.0.0.1:${server.address().port}`;
  const runs = [];
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.STRESS_CHROMIUM });
    for (const [device, options] of Object.entries({ desktop: { viewport: { width: 1440, height: 900 } }, phone: devices['Pixel 7'] })) {
      for (const href of hrefs) {
        const context = await browser.newContext({ ...options, serviceWorkers: 'block' });
        await context.route('**/*', (route) => route.request().url().startsWith(`${origin}/`) ? route.continue() : route.abort());
        const run = { device, href, errors: [], search: [] };
        runs.push(run);
        try {
          const page = await context.newPage();
          page.setDefaultTimeout(8000);
          const cdp = await context.newCDPSession(page);
          await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
          page.on('pageerror', (error) => run.errors.push(error.message));
          page.on('response', (response) => {
            if (response.status() >= 400) run.errors.push(`${response.status()} ${new URL(response.url()).pathname}`);
          });
          await page.addInitScript(installProbes);
          await page.goto(`${origin}${href}`, { waitUntil: 'networkidle', timeout: 30000 });
          run.resources = await page.evaluate(() => [...performance.getEntriesByType('navigation'), ...performance.getEntriesByType('resource')]
            .filter((entry) => new URL(entry.name).origin === location.origin)
            .map(({ name, initiatorType, encodedBodySize, decodedBodySize, transferSize }) => ({
              path: new URL(name).pathname, initiatorType, encodedBodySize, decodedBodySize, transferSize,
            })));
          run.images = await page.locator('main img').evaluateAll((images) => images.map((img) => ({
            src: img.getAttribute('src'), loaded: img.complete && img.naturalWidth > 0,
          })));
          const search = page.getByRole('button', { name: 'Search', exact: true });
          for (const query of queries) {
            await search.click();
            const box = page.getByRole('combobox', { name: 'Search notes' });
            await page.evaluate(() => { delete window.stress.search; });
            await box.fill(query);
            try {
              await page.waitForFunction((value) => window.stress.search?.input === value, query, { timeout: 3000 });
              run.search.push(await page.evaluate(() => window.stress.search));
            } catch (error) {
              run.errors.push(`Search ${query}: ${error.message}`);
            }
            await box.press('Escape');
            await box.waitFor({ state: 'hidden' });
          }
          await page.getByRole('button', { name: 'Open the full graph' }).click();
          await page.waitForFunction(() => window.stress.graphFrameMs !== undefined);
          const canvas = page.locator('.graph-canvas-full');
          const bounds = await canvas.boundingBox();
          if (device === 'phone') await pinch(cdp, bounds);
          else {
            await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
            await page.mouse.wheel(0, -150);
          }
          try {
            await page.waitForFunction(() => window.stress.motionFrameMs !== undefined, undefined, { timeout: 3000 });
          } finally {
            run.graph = await page.evaluate(() => window.stress);
          }
        } catch (error) {
          run.errors.push(error.message);
        } finally {
          await context.close();
        }
      }
    }
    const inspected = [];
    const context = await browser.newContext({ serviceWorkers: 'block' });
    await context.route('**/*', (route) => route.request().url().startsWith(`${origin}/`) ? route.continue() : route.abort());
    for (const href of inspect) {
      const page = await context.newPage();
      try {
        const cdp = await context.newCDPSession(page);
        await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
        const response = await page.goto(`${origin}${href}`, { waitUntil: 'networkidle' });
        inspected.push({ href, status: response.status(), ...await page.locator('main').evaluate((main) => ({
          links: [...main.querySelectorAll('a, .svartz-unresolved-link')].map((a) => ({
            href: a.getAttribute('href'), label: a.textContent, disabled: a.getAttribute('aria-disabled') === 'true',
          })),
          headings: [...main.querySelectorAll('h2[id], h3[id]')].map((h) => h.id),
          images: [...main.querySelectorAll('img')].map((img) => ({ src: img.getAttribute('src'), loaded: img.complete && img.naturalWidth > 0 })),
        })) });
      } catch (error) {
        inspected.push({ href, error: error.message });
      } finally {
        await page.close();
      }
    }
    await context.close();
    return { browser: browser.version(), runs, inspected };
  } finally {
    await browser?.close();
    await new Promise((done) => server.close(done));
  }
}
