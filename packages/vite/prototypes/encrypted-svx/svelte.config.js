import adapter from '@sveltejs/adapter-static';
export default {
  kit: {
    adapter: adapter(),
    paths: { base: '/prototype' },
    csp: {
      mode: 'hash',
      directives: { 'default-src': ['self'], 'script-src': ['self', 'blob:'], 'style-src': ['self', 'blob:'], 'img-src': ['self', 'blob:'], 'object-src': ['none'], 'base-uri': ['self'] }
    }
  }
};
