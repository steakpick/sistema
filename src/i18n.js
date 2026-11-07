// Interface language. Russian strings are the source; English is looked up by them.
import EN from './en.js';

const LANG_KEY = 'sistema-lang';

function detect() {
  try {
    const saved = globalThis.localStorage && localStorage.getItem(LANG_KEY);
    if (saved === 'ru' || saved === 'en') return saved;
  } catch (e) { /* storage blocked */ }
  const nav = (globalThis.navigator && navigator.language) || 'ru';
  return /^(ru|uk|be|kk)/i.test(nav) ? 'ru' : 'en';
}

export const LANG = detect();
export const LOC = LANG === 'en' ? 'en-GB' : 'ru-RU';

/** Translate a Russian source string. */
export const L = (s) => (LANG === 'en' && EN[s] != null ? EN[s] : s);

/** Translate and fill {0}, {1}… placeholders. */
export const F = (s, ...args) => L(s).replace(/\{(\d)\}/g, (m, i) => args[+i]);

export function setLang(lang) {
  try { localStorage.setItem(LANG_KEY, lang); } catch (e) { /* ignore */ }
}

/** Translate the static markup once on start. */
export function translateDom(root) {
  if (LANG !== 'en') return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = w.nextNode())) {
    const t = n.nodeValue.trim();
    if (t && EN[t] != null) n.nodeValue = n.nodeValue.replace(t, EN[t]);
  }
  root.querySelectorAll('[aria-label],[placeholder]').forEach((el) => {
    for (const a of ['aria-label', 'placeholder']) {
      const v = el.getAttribute(a);
      if (v && EN[v] != null) el.setAttribute(a, EN[v]);
    }
  });
}
