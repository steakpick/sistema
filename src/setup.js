// First-launch setup: name, goal packs, intensity, rewards. Also reused to add packs later.
import { L, F } from './i18n.js';
import * as G from './game.js';
import { sfx, haptic } from './sound.js';
import { RM, typeText } from './fx.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const amount = (max, unit) => (max === 1 && !unit ? '✓' : max + unit);

/**
 * Show the setup screen.
 * add: false for a new player (all steps), true to add packs to an existing player.
 * onDone(choice) gets {name, packs, mode, rewards}; onSignIn() is called from the "already have progress" link.
 */
export function openSetup({ S, add = false, onDone, onSignIn, onCancel }) {
  const root = $('setup');
  const steps = add ? ['packs', 'mode'] : ['intro', 'packs', 'mode', 'rewards', 'confirm'];
  const c = { name: S.name, packs: [], mode: S.mode || 'normal', rewards: [1, 3, 5] };
  const has = (p) => p.goals.every((g) => S.goals.some((x) => x.t === g[0]));
  let i = 0;

  const preview = (mode) => {
    const k = G.MODES[mode].k;
    return G.PACKS.filter((p) => c.packs.includes(p.id)).flatMap((p) => p.goals).slice(0, 3)
      .map(([t, max, step, unit]) => esc(t) + ' ' + amount(G.scaleGoal(max, step, k).max, unit)).join(' · ');
  };
  const goalsCount = () => G.PACKS.filter((p) => c.packs.includes(p.id)).reduce((n, p) => n + p.goals.length, 0);

  const views = {
    intro: () => `<div class="win-title">${L('ОБНАРУЖЕН НОВЫЙ ИГРОК')}</div>
      <p class="su-msg" id="su-type"></p>
      <div class="field"><label for="su-name">${L('Как вас называть?')}</label><input id="su-name" maxlength="24" autocomplete="nickname" value="${esc(c.name === L('Игрок') ? '' : c.name)}" placeholder="${L('Имя игрока')}"></div>
      <button class="btn big" type="button" data-su="next">${L('НАЧАТЬ')}</button>
      <button class="su-link" type="button" data-su="signin">${L('Уже есть прогресс в облаке? Войти')}</button>`,
    packs: () => `<div class="win-title">${L('НАПРАВЛЕНИЯ РОСТА')}</div>
      <p class="hint">${add ? L('Выберите, что добавить. Ваш прогресс останется.') : L('Что вы хотите развивать? Можно выбрать несколько.')}</p>
      <div class="su-grid">${G.PACKS.map((p) => {
        const done = add && has(p);
        return `<button type="button" class="su-card" data-pack="${p.id}" aria-pressed="${c.packs.includes(p.id)}" ${done ? 'disabled' : ''}>
          <span class="su-ic" aria-hidden="true">${p.icon}\uFE0E</span><b>${esc(p.n)}</b><small>${done ? L('Уже есть') : esc(p.d)}</small>
          <em>${p.goals.map((g) => esc(g[0])).join(' · ')}</em></button>`;
      }).join('')}</div>
      <div class="err" id="su-err"></div>
      ${nav(L('ДАЛЕЕ'))}`,
    mode: () => `<div class="win-title">${L('РЕЖИМ')}</div>
      <p class="hint">${F('Целей в день: {0}. Насколько жёстко начинаем?', goalsCount())}</p>
      <div class="su-list">${Object.keys(G.MODES).map((m) => `<button type="button" class="su-card wide" data-mode="${m}" aria-pressed="${c.mode === m}">
        <b>${G.MODES[m].n}</b><small>${G.MODES[m].d}</small><em>${preview(m)}</em></button>`).join('')}</div>
      <p class="hint">${L('Количество в каждой цели потом можно поменять.')}</p>
      ${nav(add ? L('ДОБАВИТЬ') : L('ДАЛЕЕ'))}`,
    rewards: () => `<div class="win-title">${L('НАГРАДЫ')}</div>
      <p class="hint">${L('Золото за задания тратится на настоящие награды. Отметьте, чем будете себя радовать.')}</p>
      <div class="su-list">${G.REWARD_PRESETS.map(([t, p], k) => `<button type="button" class="su-rw" data-rw="${k}" aria-pressed="${c.rewards.includes(k)}"><span>${esc(t)}</span><b>${p}</b></button>`).join('')}</div>
      <p class="hint">${L('Свои награды можно добавить в Магазине.')}</p>
      ${nav(L('ДАЛЕЕ'))}`,
    confirm: () => {
      const T = G.applySetup(G.fresh(), c);
      return `<div class="win-title">${L('УСЛОВИЯ СИСТЕМЫ')}</div>
      <p class="su-msg">${T.name === L('Игрок') ? L('Ваше ежедневное задание:') : F('Игрок {0}, ваше ежедневное задание:', '<b>' + esc(T.name) + '</b>')}</p>
      <div class="su-sum">${T.goals.map((g) => `<div><span>${esc(g.t)}${g.days.length < 7 ? ' <small>' + G.DAYS.filter((d) => g.days.includes(d[0])).map((d) => d[1]).join(' ') + '</small>' : ''}</span><b>${amount(g.max, g.unit)}</b></div>`).join('')}</div>
      <p class="hint left">${F('Наград в магазине: {0}. Заданий: {1}. Навыков: {2}.', T.rewards.length, T.quests.length, T.skills.length)}</p>
      <p class="su-warn">${F('Невыполнение ежедневного задания: −{0} HP и штрафная зона. Сегодня пробный день: штрафа не будет.', G.PENALTY)}</p>
      ${nav(L('ПРИНЯТЬ'))}`;
    },
  };
  function nav(next) {
    return `<div class="actions"><button class="btn sm" type="button" data-su="back">${i === 0 && add ? L('Отмена') : L('Назад')}</button><button class="btn" type="button" data-su="next">${next}</button></div>`;
  }
  function show(dir = 1) {
    const step = steps[i];
    root.innerHTML = `<div class="su-in"><div class="su-steps" aria-hidden="true">${steps.map((_, k) => `<i class="${k <= i ? 'on' : ''}"></i>`).join('')}</div>
      <div class="win su-win ${dir < 0 ? 'back' : ''}">${views[step]()}</div></div>`;
    root.scrollTop = 0;
    if (step === 'intro') {
      typeText($('su-type'), L('Система выбрала вас. Ответьте на несколько вопросов, и она подготовит ваши ежедневные задания.'));
    }
  }
  function close(cb) {
    const done = () => { root.hidden = true; root.innerHTML = ''; root.classList.remove('out'); cb && cb(); };
    if (RM) return done();
    root.classList.add('out'); setTimeout(done, 380);
  }

  root.onclick = (e) => {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    const step = steps[i];
    if (b.dataset.pack) {
      const id = b.dataset.pack; c.packs = c.packs.includes(id) ? c.packs.filter((x) => x !== id) : [...c.packs, id];
      b.setAttribute('aria-pressed', c.packs.includes(id)); $('su-err').textContent = ''; sfx('tap'); haptic(); return;
    }
    if (b.dataset.mode) { c.mode = b.dataset.mode; root.querySelectorAll('[data-mode]').forEach((x) => x.setAttribute('aria-pressed', x === b)); sfx('tap'); haptic(); return; }
    if (b.dataset.rw) {
      const k = +b.dataset.rw; c.rewards = c.rewards.includes(k) ? c.rewards.filter((x) => x !== k) : [...c.rewards, k].sort((a, z) => a - z);
      b.setAttribute('aria-pressed', c.rewards.includes(k)); sfx('tap'); haptic(); return;
    }
    const a = b.dataset.su;
    if (a === 'signin') { c.name = ($('su-name').value.trim() || c.name); close(() => onSignIn && onSignIn(c)); return; }
    if (a === 'back') { if (i === 0) { close(onCancel); return; } i--; sfx('tap'); show(-1); return; }
    if (a !== 'next') return;
    if (step === 'intro') c.name = $('su-name').value.trim() || L('Игрок');
    if (step === 'packs' && !c.packs.length) { $('su-err').textContent = L('Выберите хотя бы одно направление.'); return; }
    if (i === steps.length - 1) { sfx('gold'); haptic(); close(() => onDone(c)); return; }
    i++; sfx('tap'); haptic(); show(1);
  };
  root.onsubmit = (e) => e.preventDefault();
  root.onkeydown = (e) => { if (e.key === 'Enter' && e.target.id === 'su-name') { e.preventDefault(); root.querySelector('[data-su=next]').click(); } };
  root.hidden = false;
  show(1);
}
