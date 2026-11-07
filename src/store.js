// Local persistence. Cloud sync builds on top of this.
import { fresh, migrate } from './game.js';

export const KEY = 'sistema-v2';

export function loadLocal() {
  let d = null;
  try { d = JSON.parse(localStorage.getItem(KEY)); } catch (e) { /* missing or blocked */ }
  return migrate(d) || fresh();
}

export function saveLocal(S) {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* storage full or blocked */ }
}
