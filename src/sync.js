// Cloud save through Supabase: email code sign-in (no password) and one row per player.
// Talks to the Supabase REST endpoints directly, so the app needs no extra library.
export const SUPABASE_URL = 'https://qwvhvzyhwpdspzcfdmrj.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_hv7B4M7uH3KsN-OpS1q4Yg_0LlQ50qr'; // publishable: safe in the app, data is protected by row level security

const AUTH_KEY = 'sistema-auth';
const META_KEY = 'sistema-sync';

const read = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
const write = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } };

let session = read(AUTH_KEY);
let meta = read(META_KEY) || { syncedAt: null, lastOk: null };

export const user = () => (session && session.user) || null;
export const syncMeta = () => meta;
const setMeta = (m) => { meta = Object.assign({}, meta, m); write(META_KEY, meta); };

export class SyncError extends Error {
  constructor(code, message) { super(message || code); this.code = code; }
}

async function call(path, { method = 'GET', body, auth = false, headers = {} } = {}) {
  const h = { apikey: SUPABASE_KEY, 'Content-Type': 'application/json', ...headers };
  if (auth) {
    await ensureFresh();
    if (!session) throw new SyncError('signed_out');
    h.Authorization = 'Bearer ' + session.access_token;
  }
  let res;
  try {
    res = await fetch(SUPABASE_URL + path, { method, headers: h, body: body == null ? undefined : JSON.stringify(body), keepalive: method !== 'GET' });
  } catch (e) { throw new SyncError('offline'); }
  const text = await res.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
  if (!res.ok) {
    const code = (data && (data.error_code || data.code || data.error)) || ('http_' + res.status);
    if (res.status === 401 && auth) { /* token rejected */ }
    throw new SyncError(res.status === 429 ? 'rate_limit' : String(code), data && (data.msg || data.message || data.error_description));
  }
  return data;
}

function keep(s) {
  session = {
    access_token: s.access_token,
    refresh_token: s.refresh_token,
    expires_at: s.expires_at || Math.floor(Date.now() / 1000) + (s.expires_in || 3600),
    user: { id: s.user.id, email: s.user.email },
  };
  write(AUTH_KEY, session);
}

let refreshing = null;
async function ensureFresh() {
  if (!session) return;
  if (session.expires_at - 60 > Date.now() / 1000) return;
  refreshing = refreshing || call('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: session.refresh_token } })
    .then(keep)
    .catch((e) => { if (e.code !== 'offline') signOutLocal(); throw e; })
    .finally(() => { refreshing = null; });
  return refreshing;
}

/** Send a sign-in code to this email. New emails get an account automatically. */
export function requestCode(email) {
  return call('/auth/v1/otp', { method: 'POST', body: { email, create_user: true } });
}

/** Check the code from the email and keep the session. */
export async function verifyCode(email, token) {
  let s;
  try { s = await call('/auth/v1/verify', { method: 'POST', body: { type: 'email', email, token } }); }
  catch (e) {
    if (e.code === 'offline' || e.code === 'rate_limit') throw e;
    s = await call('/auth/v1/verify', { method: 'POST', body: { type: 'signup', email, token } }); // first sign-up code
  }
  keep(s);
  setMeta({ syncedAt: null, lastOk: null });
  return user();
}

function signOutLocal() { session = null; write(AUTH_KEY, null); setMeta({ syncedAt: null, lastOk: null }); }

export async function signOut() {
  try { if (session) await call('/auth/v1/logout', { method: 'POST', auth: true }); } catch (e) { /* sign out locally anyway */ }
  signOutLocal();
}

/** The cloud save, or null when there is none yet. */
export async function pull() {
  const u = user(); if (!u) throw new SyncError('signed_out');
  const rows = await call('/rest/v1/saves?select=data,updated_at&user_id=eq.' + encodeURIComponent(u.id), { auth: true });
  return rows && rows[0] ? rows[0].data : null;
}

export async function push(S) {
  const u = user(); if (!u) throw new SyncError('signed_out');
  await call('/rest/v1/saves?on_conflict=user_id', {
    method: 'POST', auth: true,
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: { user_id: u.id, data: S, updated_at: new Date(S.updated || Date.now()).toISOString() },
  });
  setMeta({ syncedAt: S.updated, lastOk: Date.now() });
}

/** A brand-new local state that holds nothing worth keeping. */
export const isPristine = (S) => S.level === 1 && S.xp === 0 && S.gold === 0 && S.total === 0;

/**
 * Decide what to do with the local state and the cloud save.
 * Returns one of: 'push' (cloud is missing or older), 'pull' (take the cloud), 'ask' (both changed, first link on this device), 'same'.
 */
export function plan(local, remote, syncedAt) {
  if (!remote) return 'push';
  const r = remote.updated || 0, l = local.updated || 0;
  if (r === l) return 'same';
  if (syncedAt == null) return isPristine(local) ? 'pull' : (isPristine(remote) ? 'push' : 'ask');
  const localChanged = l > syncedAt, remoteChanged = r > syncedAt;
  if (remoteChanged && localChanged) return r > l ? 'pull' : 'push'; // both changed: the newest wins
  if (remoteChanged) return 'pull';
  if (localChanged) return 'push';
  return 'same';
}
