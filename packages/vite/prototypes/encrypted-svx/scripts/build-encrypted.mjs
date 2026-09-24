import { build } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { mdsvex } from 'mdsvex';
import { randomBytes, webcrypto } from 'node:crypto';
import { readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const password = process.env.SVARTZ_PROTOTYPE_PASSWORD;
if (!password) throw new Error('Set SVARTZ_PROTOTYPE_PASSWORD before building');
const assetToken = 'svartz-protected-asset:diagram';
const mode = process.env.SVARTZ_PROTOTYPE_RUNTIME ?? 'shared';
if (!['shared', 'isolated'].includes(mode)) throw new Error('Unknown runtime mode');
const bridgedExports = {
  svelte: Object.keys(await import('svelte')),
  'svelte/internal/client': Object.keys(await import('svelte/internal/client')),
  'svelte/store': Object.keys(await import('svelte/store')),
  '$app/state': ['page', 'navigating', 'updated'],
  '$app/navigation': ['goto', 'afterNavigate'],
  '$app/paths': ['base', 'assets'],
  '$lib/host-context.js': ['getHostContext', 'setHostContext']
};
const sideEffects = new Set(['svelte/internal/disclose-version', 'svelte/internal/flags/legacy']);
const result = await build({
  configFile: false,
  plugins: [
    {
      name: 'prototype-host-runtime-bridge',
      enforce: 'pre',
      resolveId(id) {
        if (mode === 'isolated' && id === './Note.svx') return resolve('private/Control.svx');
        if (mode !== 'shared') return;
        if (id in bridgedExports || sideEffects.has(id)) return '\0host-bridge:' + id;
        if (id.startsWith('$app/') || id.startsWith('$env/') || id.startsWith('svelte/')) {
          throw new Error('Unclassified protected runtime import: ' + id);
        }
      },
      load(id) {
        if (!id.startsWith('\0host-bridge:')) return;
        const name = id.slice('\0host-bridge:'.length);
        if (sideEffects.has(name)) return 'export {};';
        return 'const host = globalThis.__svartzPrototypeHost[' + JSON.stringify(name) + '];\n' +
          bridgedExports[name].map((key, index) => `const value${index} = host[${JSON.stringify(key)}]; export { value${index} as ${key} };`).join('\n');
      }
    },
    {
      name: 'prototype-protected-attachment',
      enforce: 'pre',
      resolveId(id) { if (id.endsWith('diagram.svg?url')) return '\0protected-diagram'; },
      load(id) { if (id === '\0protected-diagram') return 'export default ' + JSON.stringify(assetToken); }
    },
    svelte({ configFile: false, extensions: ['.svelte', '.svx'], preprocess: mdsvex({ extensions: ['.svx'] }) })
  ],
  build: {
    write: false, sourcemap: false, minify: true,
    lib: { entry: resolve('private/entry.js'), formats: ['es'], fileName: 'protected' },
    rollupOptions: { output: { inlineDynamicImports: true } }
  }
});
const output = (Array.isArray(result) ? result : [result]).flatMap((bundle) => bundle.output);
const chunks = output.filter((file) => file.type === 'chunk');
if (chunks.length !== 1 || chunks[0].imports.length || chunks[0].dynamicImports.length)
  throw new Error('Prototype requires one self-contained protected module');
const unexpected = output.filter((file) => file.type === 'asset' && !file.fileName.endsWith('.css'));
if (unexpected.length) throw new Error('Unclassified protected assets');
const payload = JSON.stringify({
  js: chunks[0].code,
  css: output.filter((file) => file.type === 'asset').map((file) => file.source).join('\n'),
  assets: [{ token: assetToken, type: 'image/svg+xml', data: (await readFile('private/diagram.svg')).toString('base64') }]
});
const salt = randomBytes(16);
const iv = randomBytes(12);
const iterations = 600000;
const id = 'svartz-prototype:note:v1';
const material = await webcrypto.subtle.importKey('raw', Buffer.from(password), 'PBKDF2', false, ['deriveKey']);
const key = await webcrypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, material,
  { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
const ciphertext = await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: Buffer.from(id) }, key, Buffer.from(payload));
await rm('static/protected', { recursive: true, force: true });
await mkdir('static/protected', { recursive: true });
await writeFile('static/protected/note.json', JSON.stringify({
  id, iterations, salt: salt.toString('base64'), iv: iv.toString('base64'), ciphertext: Buffer.from(ciphertext).toString('base64')
}));
console.log(JSON.stringify({ protectedModuleBytes: chunks[0].code.length, payloadBytes: Buffer.byteLength(payload), encryptedBytes: ciphertext.byteLength }));
await mkdir('evidence', { recursive: true });
await writeFile('evidence/build-' + mode + '.json', JSON.stringify({ mode, protectedModuleBytes: chunks[0].code.length, payloadBytes: Buffer.byteLength(payload), encryptedBytes: ciphertext.byteLength }, null, 2) + '\n');
