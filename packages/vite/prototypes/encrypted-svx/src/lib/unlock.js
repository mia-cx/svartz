// Throwaway loader: one isolated bundle. No normal import of protected sources.
let sessionKey;
const bytes = (value) => Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
export const hasSession = () => Boolean(sessionKey);
export const resetSession = () => { sessionKey = undefined; };

export async function unlock(url, password, target) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Protected payload unavailable');
  const envelope = await response.json();
  let key = sessionKey;
  if (password || !key) {
    const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
    key = await crypto.subtle.deriveKey({
      name: 'PBKDF2', salt: bytes(envelope.salt), iterations: envelope.iterations, hash: 'SHA-256'
    }, material, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  }
  const plaintext = await crypto.subtle.decrypt({
    name: 'AES-GCM', iv: bytes(envelope.iv), additionalData: new TextEncoder().encode(envelope.id)
  }, key, bytes(envelope.ciphertext));
  const payload = JSON.parse(new TextDecoder().decode(plaintext));
  sessionKey = key;

  const urls = [];
  let instance;
  let module;
  const styles = document.createElement('link');
  const blob = (value, type) => {
    const url = URL.createObjectURL(new Blob([value], { type }));
    urls.push(url);
    return url;
  };
  const cleanup = async () => {
    if (instance) await module.dispose(instance);
    styles.remove();
    urls.forEach((url) => URL.revokeObjectURL(url));
  };
  try {
    let source = payload.js;
    let css = payload.css;
    for (const asset of payload.assets) {
      const assetUrl = blob(bytes(asset.data), asset.type);
      source = source.replaceAll(asset.token, assetUrl);
      css = css.replaceAll(asset.token, assetUrl);
    }
    styles.rel = 'stylesheet';
    styles.dataset.protectedStyle = '';
    styles.href = blob(css, 'text/css');
    document.head.append(styles);
    module = await import(/* @vite-ignore */ blob(source, 'text/javascript'));
    instance = module.render(target);
    return cleanup;
  } catch (error) {
    await cleanup();
    throw error;
  }
}
