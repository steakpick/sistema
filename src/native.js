// Bridge to the iOS app (Capacitor). On the website every function here does nothing.
// Saves are kept twice in the app: in WebKit's localStorage and in iOS app storage (UserDefaults
// through the Preferences plugin), so a save survives even if iOS clears the web view's data.
const cap = globalThis.Capacitor;
export const isNative = !!(cap && cap.isNativePlatform && cap.isNativePlatform());

const OURS = (k) => typeof k === 'string' && k.startsWith('sistema');
const call = (plugin, method, opts = {}) => cap.nativePromise(plugin, method, opts);

/** Before the app starts: restore missing keys from iOS storage, then mirror every write there. */
export async function restore() {
  if (!isNative) return;
  try {
    const { keys = [] } = await call('Preferences', 'keys');
    for (const k of keys.filter(OURS)) {
      if (localStorage.getItem(k) != null) continue;
      const { value } = await call('Preferences', 'get', { key: k });
      if (value != null) localStorage.setItem(k, value);
    }
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (OURS(k) && !keys.includes(k)) await call('Preferences', 'set', { key: k, value: localStorage.getItem(k) });
    }
  } catch (e) { /* plugin missing: localStorage alone still works */ }

  const P = Storage.prototype, set = P.setItem, remove = P.removeItem;
  P.setItem = function (k, v) {
    set.call(this, k, v);
    if (this === localStorage && OURS(k)) call('Preferences', 'set', { key: k, value: String(v) }).catch(() => {});
  };
  P.removeItem = function (k) {
    remove.call(this, k);
    if (this === localStorage && OURS(k)) call('Preferences', 'remove', { key: k }).catch(() => {});
  };
}

/** Light tap of the Taptic Engine. Returns false on the website. */
export function nativeHaptic() {
  if (!isNative) return false;
  call('Haptics', 'impact', { style: 'LIGHT' }).catch(() => {});
  return true;
}

/** Keep the screen on while a timer runs. Returns false on the website. */
export function nativeKeepAwake(on) {
  if (!isNative) return false;
  call('KeepAwake', on ? 'keepAwake' : 'allowSleep').catch(() => {});
  return true;
}
