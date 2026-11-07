// Visual effects: floating rewards, particles, flashes, shake, number bumps, typing.
export const RM = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

let origin = null; // where the last tapped button is, for floating rewards
document.addEventListener('click', (e) => {
  const r = e.target.closest('button');
  if (r) { const b = r.getBoundingClientRect(); origin = { x: b.left + b.width / 2, y: b.top }; }
}, true);

export function floatText(text, cls, dx) {
  if (!origin) return;
  const el = document.createElement('div');
  el.className = 'float ' + (cls || '');
  el.textContent = text;
  el.style.left = Math.min(innerWidth - 40, Math.max(40, origin.x + (dx || 0))) + 'px';
  el.style.top = (origin.y - 18) + 'px';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1200);
}

export function burst(colors, n = 70) {
  if (RM) return;
  const c = document.createElement('canvas'), x = c.getContext('2d'), dpr = Math.min(2, devicePixelRatio || 1);
  c.className = 'fx'; c.width = innerWidth * dpr; c.height = innerHeight * dpr;
  document.body.appendChild(c); x.scale(dpr, dpr);
  const cx = innerWidth / 2, cy = innerHeight * 0.42, P = [];
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = 2 + Math.random() * 7;
    P.push({ x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 2, r: 1 + Math.random() * 2.5, c: colors[i % colors.length] });
  }
  const t0 = performance.now();
  (function frame(t) {
    const k = (t - t0) / 1300;
    x.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of P) {
      p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.vx *= 0.985;
      x.globalAlpha = Math.max(0, 1 - k); x.fillStyle = p.c; x.shadowColor = p.c; x.shadowBlur = 8;
      x.fillRect(p.x, p.y, p.r, p.r * 2.2);
    }
    if (k < 1) requestAnimationFrame(frame); else c.remove();
  })(t0);
}

export function flash(color) {
  if (RM) return;
  const d = document.createElement('div');
  d.className = 'flashfx';
  d.style.background = 'radial-gradient(circle at 50% 42%,' + color + ',transparent 70%)';
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 750);
}

export function shake() {
  if (RM) return;
  const r = document.documentElement;
  r.classList.remove('shake'); void document.body.offsetWidth; r.classList.add('shake');
  setTimeout(() => r.classList.remove('shake'), 550);
}

const prev = {};
/** Set a number and make it bounce when it changed. */
export function setNum(el, key, v) {
  if (!el) return;
  const old = prev[key];
  el.textContent = v;
  if (old !== undefined && old !== v) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  prev[key] = v;
}
/** True when a remembered value changed since the last call (for numbers rendered as HTML). */
export function changed(key, v) {
  const c = prev[key] !== undefined && prev[key] !== v;
  prev[key] = v;
  return c;
}

let typer = null;
export function typeText(el, text) {
  clearInterval(typer);
  if (RM || text.length < 4) { el.textContent = text; return; }
  let i = 0; el.textContent = ''; el.classList.add('typing');
  typer = setInterval(() => {
    i += 2; el.textContent = text.slice(0, i);
    if (i >= text.length) { clearInterval(typer); el.classList.remove('typing'); }
  }, 22);
}
