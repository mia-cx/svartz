import { defineConfig } from '@svartz/config';

export default defineConfig({
  version: '1.0.0',
  defaults: { theme: '@svartz/theme-minimal' },
  vaults: [{
    id: 'notes',
    path: 'vault',
    target: { type: 'host' },
    site: { title: __SVARTZ_SITE_NAME__ }
  }]
});
