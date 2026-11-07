// Synthesised System sounds and the iOS haptic tick. No audio files.
let ac = null;
let enabled = () => true;

export function setSoundCheck(fn) { enabled = fn; }

function audio() {
  if (!enabled()) return null;
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === 'suspended') ac.resume();
  } catch (e) { return null; }
  return ac;
}

function tone(f, t0, dur, type, vol, f2) {
  const t = ac.currentTime + t0, o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + dur + 0.05);
}

export function sfx(kind) {
  if (!audio()) return;
  try {
    if (kind === 'gold') { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.08, 0.5, 'triangle', 0.13)); tone(2093, 0.42, 0.6, 'sine', 0.05); }
    else if (kind === 'alert') { tone(220, 0, 0.35, 'sawtooth', 0.07, 140); tone(220, 0.4, 0.5, 'sawtooth', 0.07, 110); tone(55, 0, 0.9, 'sine', 0.2); }
    else if (kind === 'buy') { tone(1319, 0, 0.12, 'square', 0.04); tone(1760, 0.09, 0.3, 'triangle', 0.08); }
    else if (kind === 'tap') { tone(1800, 0, 0.04, 'sine', 0.04); }
    else { tone(880, 0, 0.3, 'sine', 0.12); tone(1320, 0.07, 0.45, 'sine', 0.09); tone(2640, 0.07, 0.2, 'sine', 0.02); }
  } catch (e) { /* audio unavailable */ }
}

/** iOS 18 Safari gives a haptic tick when a switch checkbox toggles inside a user gesture. */
export function haptic() {
  try { document.getElementById('hap').click(); } catch (e) { /* ignore */ }
}

/** iOS only lets audio start from a touch: play a silent buffer on the first ones. */
export function installUnlock() {
  const unlock = () => {
    const a = audio(); if (!a) return;
    try { const b = a.createBuffer(1, 1, 22050), src = a.createBufferSource(); src.buffer = b; src.connect(a.destination); src.start(0); } catch (e) { /* ignore */ }
  };
  ['touchend', 'click', 'keydown'].forEach((ev) => document.addEventListener(ev, unlock, { capture: true, passive: true }));
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && ac && ac.state !== 'running') try { ac.resume(); } catch (e) { /* ignore */ }
  });
}
