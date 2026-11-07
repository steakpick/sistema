// Interface: rendering, forms, tabs, notifications, boot screen.
import { LANG, LOC, L, F, setLang, translateDom } from './i18n.js';
import * as G from './game.js';
import { loadLocal, saveLocal, KEY } from './store.js';
import { sfx, haptic, installUnlock, setSoundCheck } from './sound.js';
import { RM, floatText, burst, flash, shake, setNum, changed, typeText } from './fx.js';
import * as Sync from './sync.js';
import { openSetup } from './setup.js';
import * as P from './progress.js';

const { STATS, TITLES, RANKS, DIFF, DAYS, ALL_DAYS, PENALTY } = G;
const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, '0');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

document.documentElement.lang = LANG;
document.title = L('Система развития');
translateDom(document.body);

let S = loadLocal();
const snapshot = () => JSON.stringify(Object.assign({}, S, { updated: 0 }));
let lastJson = snapshot();
/** Save locally; when something really changed, stamp the time and queue a cloud upload. */
const save = () => {
  const j = snapshot();
  if (j === lastJson) return;
  lastJson = j; S.updated = Date.now(); saveLocal(S); schedulePush();
};
/** Replace the whole state (cloud download, backup restore) without stamping it as a new change. */
function adopt(d) { S = d; lastJson = snapshot(); saveLocal(S); render(); }
const today = () => G.goalsFor(S, new Date());
setSoundCheck(() => S.sound);
installUnlock();

/* ---------- notifications ---------- */
const queue = [];
let showing = false, booting = true;
function notify(o) { queue.push(o); if (!showing && !booting) nextNote(); }
function nextNote() {
  const o = queue.shift();
  if (!o) { $('overlay').hidden = true; showing = false; return; }
  showing = true;
  const w = $('note');
  w.className = 'win' + (o.gold ? ' gold' : '') + (o.alert ? ' alert' : '');
  $('n-title').textContent = o.title || L('УВЕДОМЛЕНИЕ');
  $('n-big').hidden = !o.big; $('n-big').textContent = o.big || '';
  typeText($('n-msg'), o.msg || ''); $('n-sub').textContent = o.sub || '';
  $('overlay').hidden = false;
  w.style.animation = 'none'; void w.offsetWidth; w.style.animation = '';
  sfx(o.alert ? 'alert' : o.gold ? 'gold' : 'note'); haptic();
  if (o.alert) { shake(); flash('rgba(255,84,112,.45)'); }
  if (o.burst) { burst(['#ffd27a', '#fff2c4', '#62d0ff'], 90); flash('rgba(255,210,122,.4)'); }
  $('n-ok').focus();
}
$('n-ok').onclick = nextNote;

const ui = {
  notify,
  float(text, cls, dx) { if (cls === 'g') setTimeout(() => floatText(text, cls, dx), 120); else floatText(text, cls, dx); },
};

/* ---------- render ---------- */
const justDone = new Set();
function goalRow(g, active) {
  const c = active ? (S.prog[g.id] || 0) : 0, done = c >= g.max;
  const days = g.days.length === 7 ? '' : ' <small>' + DAYS.filter((x) => g.days.includes(x[0])).map((x) => x[1]).join(' ') + '</small>';
  const fl = justDone.has(g.id); justDone.delete(g.id);
  return `<div class="goal${done ? ' done' : ''}${active ? '' : ' off'}${fl ? ' flash' : ''}"><button class="t" type="button" data-act="edit-goal" data-id="${g.id}">${esc(g.t)}${days}</button>` +
    (active
      ? `<span class="n">${c}/${g.max}${esc(g.unit)}</span>${isMin(g) && !done ? `<button class="btn sm tmr${S.timer && S.timer.id === g.id ? ' on' : ''}" data-act="timer" data-id="${g.id}" type="button" aria-label="${F('Таймер: {0}', esc(g.t))}">⏱</button>` : ''}<button class="btn sm" data-act="goal-minus" data-id="${g.id}" type="button" aria-label="${F('Отменить: {0}', esc(g.t))}" ${c ? '' : 'disabled'}>−</button><button class="btn ok" data-act="goal-plus" data-id="${g.id}" type="button" ${done ? 'disabled' : ''}>${done ? '✓' : '+' + g.step}</button>`
      : `<span class="n">${g.max}${esc(g.unit)}</span>`) + '</div>';
}
const isMin = (g) => /^(мин|min)\.?$/i.test(String(g.unit).trim());
const empty = (t) => '<div class="empty">' + L(t) + '</div>';

let gsGoal = null;
function render() {
  const d = new Date();
  G.applyStats(S); G.checkAch(S, ui);
  $('day').textContent = d.toLocaleDateString(LOC, { weekday: 'short', day: 'numeric', month: 'short' });
  setNum($('lvl'), 'lvl', S.level); $('name').textContent = S.name;
  $('title').innerHTML = `<button class="lnk" type="button" data-act="pick-title">${esc(G.titleOf(S))} ▾</button>`; $('rank').textContent = G.pick(RANKS, S.level);
  setNum($('gold'), 'gold', S.gold); setNum($('shop-gold'), 'shop-gold', S.gold);
  $('xpbar').style.width = (S.xp / G.need(S.level) * 100) + '%'; $('xptxt').textContent = S.xp + '/' + G.need(S.level);
  $('hpbar').style.width = Math.max(0, S.hp / S.maxHp * 100) + '%'; $('hptxt').textContent = S.hp + '/' + S.maxHp;
  $('hpbar').parentNode.classList.toggle('low', S.hp / S.maxHp < 0.3);
  setNum($('streak'), 'streak', S.streak); setNum($('best'), 'best', S.best); setNum($('total'), 'total', S.total);
  setNum($('pts'), 'pts', S.points);
  $('shield-ind').hidden = !S.shields; $('shield-ind').textContent = '🛡'.repeat(S.shields);
  $('fxl').innerHTML = P.effectsHtml(S);
  $('ach').innerHTML = P.achHtml(S);
  $('stats').innerHTML = Object.keys(STATS).map((k) => `<div class="stat"><span class="name">${STATS[k]}</span><span class="val${changed('st-' + k, S.stats[k]) ? ' bump' : ''}">${S.stats[k]}</span><button class="plus" data-act="stat" data-id="${k}" type="button" aria-label="${F('Добавить очко: {0}', STATS[k])}" ${S.points ? '' : 'hidden'}>+</button></div>`).join('');
  $('skills').innerHTML = S.skills.length ? S.skills.map((s) => `<button class="skill" type="button" data-act="edit-skill" data-id="${s.id}"><div class="row"><span>${esc(s.n)}</span><span>${F('ур. {0} · {1}%', s.lv, s.p)}</span></div><div class="bar sk"><i style="width:${s.p}%"></i></div></button>`).join('') : empty('Навыков пока нет. Добавьте то, что изучаете.');

  $('pen').hidden = $('pen-banner').hidden = !S.penalty;
  if (S.penalty) $('pen-task').textContent = S.penalty.t;

  const tg = today(), other = S.goals.filter((g) => !tg.includes(g)), rest = !tg.length;
  $('goals').innerHTML = tg.length ? tg.map((g) => goalRow(g, true)).join('') : empty('На сегодня целей нет. Отдыхайте: штрафа не будет.');
  $('other-wrap').hidden = !other.length;
  $('other-sum').textContent = L('В другие дни: ') + other.length;
  $('other').innerHTML = other.map((g) => goalRow(g, false)).join('');
  const dw = $('daily'); dw.classList.toggle('alert', !S.claimed && !rest); dw.classList.toggle('cleared', S.claimed || rest);
  $('daily-sub').textContent = rest ? L('День отдыха') : L('Выполните все цели до конца дня');
  $('warn').textContent = rest ? L('✓ Сегодня без обязательных целей') : S.claimed ? L('✓ Выполнено. Награда получена') : S.grace === S.day ? L('Пробный день: штрафа не будет') : L('⚠ Невыполнение: −') + PENALTY + L(' HP и штрафная зона');

  const open = S.quests.filter((q) => !q.done), done = S.quests.filter((q) => q.done);
  $('quests').innerHTML = S.quests.length ? [...open, ...done].map((q) => {
    const sk = q.skill && S.skills.find((s) => s.id === q.skill), D = G.gains(S, DIFF[q.diff].xp, DIFF[q.diff].g, q.type === 'study' ? 'study' : undefined);
    return `<div class="quest${q.done ? ' done' : ''}"><span class="tag ${q.type === 'study' ? 'study' : ''}">${q.type === 'study' ? L('УЧЁБА') : L('РАЗОВОЕ')} · ${DIFF[q.diff].n.toUpperCase()}</span><div class="top"><button class="qt" type="button" data-act="edit-quest" data-id="${q.id}">${esc(q.t)}</button><button class="btn ok" data-act="quest-done" data-id="${q.id}" type="button" ${q.done ? 'disabled' : ''}>${q.done ? '✓' : L('Готово')}</button></div><div class="reward">+${D.xp} EXP · +${D.g} ${L('золота')} · ${STATS[q.stat]} +1${sk ? ' · ' + esc(sk.n) + ' +25%' : ''}</div></div>`;
  }).join('') : empty('Заданий нет. Добавьте учёбу или разовое дело.');
  $('dungeons').innerHTML = P.dungeonsHtml(S);
  $('timer').hidden = !S.timer;
  $('qdot').hidden = !(S.penalty || (!S.claimed && tg.length));

  $('shield-card').innerHTML = P.shieldHtml(S);
  $('rewards').innerHTML = S.rewards.length ? S.rewards.map((r) => { const p = G.priceOf(S, r.price); return `<div class="rw"><button class="t" type="button" data-act="edit-reward" data-id="${r.id}">${esc(r.t)}</button><span class="price">${p < r.price ? '<s>' + r.price + '</s> ' : ''}${p}</span><button class="btn" type="button" data-act="buy" data-id="${r.id}" ${S.gold >= p ? '' : 'disabled'}>${L('Купить')}</button></div>`; }).join('') : empty('Добавьте награды, ради которых стоит стараться.');

  let html = '', last = '';
  for (const e of S.log.slice(0, 80)) {
    const t = new Date(e.ts), dk = t.toLocaleDateString(LOC, { day: 'numeric', month: 'long' });
    if (dk !== last) { html += `<div class="log-day">${dk.toUpperCase()}</div>`; last = dk; }
    html += `<div class="log-item ${e.kind}"><time>${pad(t.getHours())}:${pad(t.getMinutes())}</time><span>${esc(e.text)}</span></div>`;
  }
  $('week').innerHTML = P.weekHtml(S, d);
  $('cal').innerHTML = P.calendarHtml(S, d);
  $('gstat').innerHTML = P.goalChartHtml(S, gsGoal, d);
  $('log').innerHTML = html || empty('Здесь появится история ваших действий.');
  save();
}

/* ---------- sheets (forms) ---------- */
let sheetSubmit = null;
const sheetActions = {};
function openSheet(html, onSubmit) {
  const sh = $('sheet');
  sh.classList.remove('closing'); $('sheet-bg').classList.remove('closing'); sh.style.transform = '';
  sh.innerHTML = '<div class="grab" aria-hidden="true"></div>' + html;
  sheetSubmit = onSubmit; $('sheet-bg').hidden = false; sh.scrollTop = 0;
  document.documentElement.classList.add('locked');
  const f = sh.querySelector('input:not([type=hidden])');
  if (f && !f.value) setTimeout(() => f.focus(), 50);
}
function closeSheet() {
  if ($('sheet-bg').hidden) return;
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  sheetSubmit = null; document.documentElement.classList.remove('locked');
  if (!S.welcomed) setTimeout(startSetup, 260);
  if (RM) { $('sheet-bg').hidden = true; $('sheet').innerHTML = ''; return; }
  $('sheet').classList.add('closing'); $('sheet-bg').classList.add('closing');
  setTimeout(() => {
    $('sheet-bg').hidden = true; $('sheet-bg').classList.remove('closing');
    $('sheet').classList.remove('closing'); $('sheet').innerHTML = ''; $('sheet').style.transform = '';
  }, 230);
}
(function swipeToClose() {
  const sh = $('sheet'); let y0 = null, dy = 0;
  sh.addEventListener('touchstart', (e) => { if (sh.scrollTop > 0 || e.target.closest('input,select,textarea')) { y0 = null; return; } y0 = e.touches[0].clientY; dy = 0; sh.style.transition = 'none'; }, { passive: true });
  sh.addEventListener('touchmove', (e) => { if (y0 === null) return; dy = e.touches[0].clientY - y0; if (dy > 0) sh.style.transform = 'translateY(' + dy + 'px)'; }, { passive: true });
  sh.addEventListener('touchend', () => { if (y0 === null) return; sh.style.transition = ''; y0 = null; if (dy > 110) closeSheet(); else sh.style.transform = ''; }, { passive: true });
})();
$('sheet-bg').addEventListener('click', (e) => { if (e.target.id === 'sheet-bg') closeSheet(); });
$('sheet').addEventListener('submit', (e) => { e.preventDefault(); if (sheetSubmit) sheetSubmit(new FormData(e.target), e.target); });
$('sheet').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.seg) { const g = b.closest('.seg'); g.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', x === b)); if (g.nextElementSibling) g.nextElementSibling.value = b.dataset.seg; }
  if (b.dataset.day !== undefined) b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') !== 'true');
  if (b.dataset.close !== undefined) closeSheet();
  if (b.dataset.confirm !== undefined) {
    if (b.dataset.armed) { b.dataset.armed = ''; sheetActions[b.dataset.confirm](); }
    else { b.dataset.armed = '1'; b.textContent = b.dataset.ask || L('Точно? Нажмите ещё раз'); }
  }
});
const statOpts = (sel) => Object.keys(STATS).map((k) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${STATS[k]}</option>`).join('');
const seg = (name, opts, val, attrs = '') => `<div class="seg" ${attrs}>${opts.map(([v, l]) => `<button type="button" data-seg="${v}" aria-pressed="${v === val}">${l}</button>`).join('')}</div><input type="hidden" name="${name}" value="${val}">`;
const actions = (del) => `<div class="err" id="f-err"></div><div class="actions">${del ? `<button class="btn danger" type="button" data-confirm="del" data-ask="${L('Удалить? Нажмите ещё раз')}">${L('Удалить')}</button>` : `<button class="btn sm" type="button" data-close>${L('Отмена')}</button>`}<button class="btn" type="submit">${L('Сохранить')}</button></div>`;
function err(m) { const e = $('f-err'); if (e) e.textContent = m; }

function goalSheet(g) {
  const ed = !!g; g = g || { t: '', max: 10, step: 5, unit: '', stat: 'str', days: ALL_DAYS.slice() };
  openSheet(`<h2>${ed ? L('ЦЕЛЬ') : L('НОВАЯ ЕЖЕДНЕВНАЯ ЦЕЛЬ')}</h2><form class="form">
    <div class="field"><label for="g-t">${L('Название')}</label><input id="g-t" name="t" maxlength="40" value="${esc(g.t)}" placeholder="${L('Например: Планка')}"></div>
    <div class="row2"><div class="field"><label for="g-max">${L('Сколько в день')}</label><input id="g-max" name="max" type="number" inputmode="numeric" min="1" max="9999" value="${g.max}"></div>
    <div class="field"><label for="g-step">${L('Шаг кнопки')}</label><input id="g-step" name="step" type="number" inputmode="numeric" min="1" max="9999" value="${g.step}"></div></div>
    <div class="row2"><div class="field"><label for="g-unit">${L('Единица')}</label><input id="g-unit" name="unit" maxlength="10" value="${esc(g.unit.trim())}" placeholder="${L('раз, мин, км')}"></div>
    <div class="field"><label for="g-stat">${L('Развивает')}</label><select id="g-stat" name="stat">${statOpts(g.stat)}</select></div></div>
    <div class="field"><span class="lab">${L('Дни недели')}</span><div class="days" id="g-days">${DAYS.map(([v, l]) => `<button type="button" data-day="${v}" aria-pressed="${g.days.includes(v)}">${l}</button>`).join('')}</div></div>
    ${actions(ed)}</form>`, (fd) => {
    const t = fd.get('t').trim(), max = Math.floor(+fd.get('max')), step = Math.floor(+fd.get('step'));
    const days = [...$('g-days').querySelectorAll('[aria-pressed=true]')].map((b) => +b.dataset.day);
    if (!t) return err(L('Введите название.'));
    if (!(max > 0)) return err(L('Укажите, сколько нужно сделать за день.'));
    if (!days.length) return err(L('Выберите хотя бы один день.'));
    const u = fd.get('unit').trim();
    const data = { t, max, step: Math.min(Math.max(1, step || 1), max), unit: u ? ' ' + u : '', stat: fd.get('stat'), days };
    if (ed) Object.assign(g, data); else { S.goals.push(Object.assign({ id: G.uid() }, data)); G.log(S, L('Новая ежедневная цель: ') + t); }
    closeSheet(); G.checkDaily(S, new Date(), ui); render();
  });
  sheetActions.del = () => { S.goals = S.goals.filter((x) => x !== g); if (S.timer && S.timer.id === g.id) S.timer = null; closeSheet(); G.checkDaily(S, new Date(), ui); render(); };
}
function questSheet(q) {
  const ed = !!q; q = q || { t: '', type: 'study', diff: 'mid', stat: 'int', skill: '' };
  const skOpts = '<option value="">' + L('Нет') + '</option>' + S.skills.map((s) => `<option value="${s.id}" ${s.id === q.skill ? 'selected' : ''}>${esc(s.n)}</option>`).join('');
  openSheet(`<h2>${ed ? L('ЗАДАНИЕ') : L('НОВОЕ ЗАДАНИЕ')}</h2><form class="form">
    <div class="field"><label for="q-t">${L('Что нужно сделать')}</label><input id="q-t" name="t" maxlength="80" value="${esc(q.t)}" placeholder="${L('Например: Прочитать главу по физике')}"></div>
    <div class="field"><span class="lab">${L('Тип')}</span>${seg('type', [['study', L('Учёба')], ['once', L('Разовое')]], q.type, 'style="grid-template-columns:1fr 1fr"')}</div>
    <div class="field"><span class="lab">${L('Сложность (опыт · золото)')}</span>${seg('diff', Object.keys(DIFF).map((k) => [k, DIFF[k].n + '<br><small>' + DIFF[k].xp + ' · ' + DIFF[k].g + '</small>']), q.diff)}</div>
    <div class="row2"><div class="field"><label for="q-stat">${L('Развивает')}</label><select id="q-stat" name="stat">${statOpts(q.stat)}</select></div>
    <div class="field"><label for="q-sk">${L('Навык')}</label><select id="q-sk" name="skill">${skOpts}</select></div></div>
    ${actions(ed)}</form>`, (fd) => {
    const t = fd.get('t').trim(); if (!t) return err(L('Опишите задание.'));
    const data = { t, type: fd.get('type'), diff: fd.get('diff'), stat: fd.get('stat'), skill: fd.get('skill') || null };
    if (ed) Object.assign(q, data); else { S.quests.unshift(Object.assign({ id: G.uid(), done: false }, data)); G.log(S, L('Новое задание: ') + t); }
    closeSheet(); render();
  });
  sheetActions.del = () => { S.quests = S.quests.filter((x) => x !== q); closeSheet(); render(); };
}
function skillSheet(s) {
  const ed = !!s; s = s || { n: '' };
  openSheet(`<h2>${ed ? L('НАВЫК') : L('НОВЫЙ НАВЫК')}</h2><form class="form">
    <div class="field"><label for="s-n">${L('Название')}</label><input id="s-n" name="n" maxlength="40" value="${esc(s.n)}" placeholder="${L('Например: Гитара')}"></div>
    <p class="hint">${ed ? F('Уровень {0}, прогресс {1}%. Навык растёт на 25% за каждое связанное задание.', s.lv, s.p) : L('Связывайте с навыком учебные задания: каждое даёт +25% прогресса.')}</p>
    ${actions(ed)}</form>`, (fd) => {
    const n = fd.get('n').trim(); if (!n) return err(L('Введите название.'));
    if (ed) s.n = n; else { S.skills.push({ id: G.uid(), n, lv: 1, p: 0 }); G.log(S, L('Новый навык: ') + n); }
    closeSheet(); render();
  });
  sheetActions.del = () => { S.skills = S.skills.filter((x) => x !== s); S.quests.forEach((q) => { if (q.skill === s.id) q.skill = null; }); closeSheet(); render(); };
}
function rewardSheet(r) {
  const ed = !!r; r = r || { t: '', price: 200 };
  openSheet(`<h2>${ed ? L('НАГРАДА') : L('НОВАЯ НАГРАДА')}</h2><form class="form">
    <div class="field"><label for="r-t">${L('Чем себя порадовать')}</label><input id="r-t" name="t" maxlength="50" value="${esc(r.t)}" placeholder="${L('Например: Поход в кино')}"></div>
    <div class="field"><label for="r-p">${L('Цена в золоте')}</label><input id="r-p" name="price" type="number" inputmode="numeric" min="1" max="99999" value="${r.price}"></div>
    <p class="hint">${F('Для ориентира: среднее задание даёт 25 золота, выполненный день около {0}.', G.dailyBonus(S).g + S.goals.length * 5)}</p>
    ${actions(ed)}</form>`, (fd) => {
    const t = fd.get('t').trim(), price = Math.floor(+fd.get('price'));
    if (!t) return err(L('Введите название.'));
    if (!(price > 0)) return err(L('Укажите цену.'));
    if (ed) Object.assign(r, { t, price }); else S.rewards.push({ id: G.uid(), t, price });
    closeSheet(); render();
  });
  sheetActions.del = () => { S.rewards = S.rewards.filter((x) => x !== r); closeSheet(); render(); };
}
function dungeonSheet(d) {
  const ed = !!d; d = d || { t: '', diff: 'normal', stat: 'int', stages: [] };
  const lines = d.stages.map((x) => x.t).join('\n');
  openSheet(`<h2>${ed ? L('ПОДЗЕМЕЛЬЕ') : L('НОВОЕ ПОДЗЕМЕЛЬЕ')}</h2><form class="form">
    <div class="field"><label for="d-t">${L('Большая цель')}</label><input id="d-t" name="t" maxlength="60" value="${esc(d.t)}" placeholder="${L('Например: Сдать экзамен по английскому')}"></div>
    <div class="field"><label for="d-st">${L('Этапы, по одному в строке. Последний: босс')}</label><textarea id="d-st" name="st" class="plain" placeholder="${L('Выучить 500 слов\nПройти 3 пробных теста\nСдать экзамен')}" ${ed && d.stages.some((x) => x.done) ? 'readonly' : ''}>${esc(lines)}</textarea></div>
    <div class="field"><span class="lab">${L('Сложность (награда за босса)')}</span>${seg('diff', Object.keys(G.DUNGEON).map((k) => [k, G.DUNGEON[k].n + '<br><small>' + G.DUNGEON[k].xp + ' EXP · ' + G.DUNGEON[k].g + '</small>']), d.diff, 'style="grid-template-columns:1fr 1fr"')}</div>
    <div class="field"><label for="d-stat">${L('Развивает (+2 за босса)')}</label><select id="d-stat" name="stat">${statOpts(d.stat)}</select></div>
    ${actions(ed)}</form>`, (fd) => {
    const t = fd.get('t').trim(), st = fd.get('st').split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 12);
    if (!t) return err(L('Введите название.'));
    if (st.length < 2) return err(L('Нужно хотя бы два этапа: путь и босс.'));
    if (ed) {
      Object.assign(d, { t, diff: fd.get('diff'), stat: fd.get('stat') });
      if (!d.stages.some((x) => x.done)) d.stages = st.map((x) => ({ t: x, done: false }));
    } else G.addDungeon(S, { t, stages: st, diff: fd.get('diff'), stat: fd.get('stat') });
    closeSheet(); render();
  });
  sheetActions.del = () => { S.dungeons = S.dungeons.filter((x) => x !== d); closeSheet(); render(); };
}
function titleSheet() {
  const got = G.ACH.filter((a) => S.ach[a[0]]);
  openSheet(`<h2>${L('ТИТУЛ')}</h2><div class="form">
    <p class="hint">${got.length ? L('Выберите титул из полученных достижений.') : L('Титулы открываются за достижения. Пока доступен титул по уровню.')}</p>
    <div class="titles"><button type="button" class="su-rw" data-title="" aria-pressed="${!S.titleSel}"><span>${esc(G.pick(TITLES, S.level))}</span><b class="nb">${L('по уровню')}</b></button>
    ${got.map((a) => `<button type="button" class="su-rw" data-title="${a[0]}" aria-pressed="${S.titleSel === a[0]}"><span>${esc(a[1])}</span><b class="nb">★</b></button>`).join('')}</div>
    <button class="btn sm" type="button" data-close>${L('Закрыть')}</button></div>`, null);
  $('sheet').querySelectorAll('[data-title]').forEach((b) => { b.onclick = () => { S.titleSel = b.dataset.title || null; sfx('tap'); haptic(); closeSheet(); render(); }; });
}
function settingsSheet() {
  openSheet(`<h2>${L('НАСТРОЙКИ')}</h2><form class="form">
    <div class="field"><label for="st-n">${L('Имя игрока')}</label><input id="st-n" name="name" maxlength="24" value="${esc(S.name)}"></div>
    <div class="actions"><button class="btn" type="submit">${L('Сохранить имя')}</button></div>
    <div class="field"><span class="lab">${L('Язык / Language')}</span>${seg('lang', [['ru', 'Русский'], ['en', 'English']], LANG, 'id="lang" style="grid-template-columns:1fr 1fr"')}</div>
    <div class="field"><span class="lab">${L('Звуки Системы')}</span>${seg('snd', [['1', L('Включены')], ['0', L('Выключены')]], S.sound ? '1' : '0', 'id="snd" style="grid-template-columns:1fr 1fr"')}</div>
    <button class="btn ghost" type="button" id="st-packs">${L('+ Добавить готовые цели')}</button>
    <div class="sep"></div>
    <div class="field" id="cloud-box">${cloudHtml()}</div>
    <div class="sep"></div>
    <div class="field"><label for="st-bk">${L('Резервная копия')}</label><textarea id="st-bk" name="bk" spellcheck="false" placeholder="${L('Вставьте сюда копию, чтобы восстановить прогресс')}"></textarea></div>
    <div class="actions"><button class="btn sm" type="button" id="bk-copy">${L('Скопировать копию')}</button><button class="btn sm" type="button" id="bk-load">${L('Восстановить')}</button></div>
    <div class="err" id="f-err"></div>
    <div class="sep"></div>
    <button class="btn danger" type="button" data-confirm="wipe" data-ask="${L('Всё будет удалено. Нажмите ещё раз')}">${L('Начать заново')}</button>
    <button class="btn sm" type="button" data-close>${L('Закрыть')}</button></form>`, (fd) => {
    const n = fd.get('name').trim(); if (n) { S.name = n; render(); err(L('Имя сохранено.')); }
  });
  $('lang').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b || b.dataset.seg === LANG) return; setLang(b.dataset.seg); save(); location.reload(); });
  wireCloud();
  $('st-packs').onclick = () => { closeSheet(); setTimeout(addPacksFlow, 240); };
  $('snd').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; S.sound = b.dataset.seg === '1'; save(); if (S.sound) sfx('note'); });
  $('bk-copy').onclick = async () => {
    const ta = $('st-bk'); ta.value = JSON.stringify(S);
    try { await navigator.clipboard.writeText(ta.value); err(L('Скопировано. Сохраните текст в Заметках.')); }
    catch (e) { ta.select(); err(L('Текст выделен: скопируйте его вручную.')); }
  };
  $('bk-load').onclick = () => {
    let d = null;
    try { d = G.migrate(JSON.parse($('st-bk').value)); } catch (e) { d = null; }
    if (!d) return err(L('Не получилось: вставьте полный текст копии.'));
    S = d; closeSheet(); render(); notify({ title: L('УВЕДОМЛЕНИЕ'), msg: L('Прогресс восстановлен.') });
  };
  sheetActions.wipe = () => { S = G.fresh(); G.log(S, L('Начат новый путь')); render(); tab('status'); closeSheet(); };
}

/* ---------- first launch ---------- */
function startSetup() {
  if (S.welcomed || !$('setup').hidden || booting) return;
  openSetup({
    S,
    onDone(c) {
      G.applySetup(S, c); render(); tab('quests', true);
      notify({ gold: true, burst: true, title: L('СИСТЕМА АКТИВИРОВАНА'), msg: F('Добро пожаловать, {0}.', S.name), sub: L('Выполняйте ежедневное задание, чтобы не попасть в штрафную зону.\nЗа задания вы получаете опыт и золото.\nЗадания, цели, награды и навыки можно менять под себя.') });
    },
    onSignIn(c) { if (c.name && c.name !== L('Игрок')) S.name = c.name; render(); settingsSheet(); setTimeout(() => { const e = $('cl-email'); if (e) { e.scrollIntoView({ block: 'center' }); e.focus(); } }, 320); },
  });
}
function addPacksFlow() {
  openSetup({
    S, add: true,
    onDone(c) {
      const n = G.addPacks(S, c.packs, c.mode); G.log(S, F('Добавлены готовые цели: {0}', n));
      G.checkDaily(S, new Date(), ui); render(); tab('quests', true);
      notify({ title: L('УВЕДОМЛЕНИЕ'), msg: F('Добавлено целей: {0}.', n), sub: L('Их можно изменить, нажав на название.') });
    },
  });
}

/* ---------- cloud ---------- */
let pushTimer = null, cloudState = '', syncing = null, lastPull = 0;
function setCloud(state) {
  cloudState = state;
  const c = $('cloud'); c.hidden = !Sync.user(); c.className = 'cloud ' + state;
  c.title = state === 'err' ? L('Нет связи с облаком: сохранится позже') : L('Сохранено в облаке');
  const st = $('cl-status'); if (st) st.textContent = cloudStatusText();
}
function cloudStatusText() {
  const m = Sync.syncMeta();
  if (cloudState === 'err') return L('Нет связи с облаком: изменения сохранятся, когда появится интернет.');
  if (cloudState === 'busy') return L('Синхронизация…');
  return m.lastOk ? L('Сохранено в облаке в ') + new Date(m.lastOk).toLocaleTimeString(LOC, { hour: '2-digit', minute: '2-digit' }) : '';
}
function schedulePush() {
  if (!Sync.user()) return;
  clearTimeout(pushTimer); pushTimer = setTimeout(pushNow, 1500);
}
async function pushNow() {
  clearTimeout(pushTimer); pushTimer = null;
  if (!Sync.user()) return;
  try { setCloud('busy'); await Sync.push(S); setCloud('ok'); }
  catch (e) { if (e.code === 'signed_out') setCloud(''); else setCloud('err'); }
}
const summary = (d) => F('ур. {0} · {1} EXP · {2} золота · заданий: {3}', d.level, d.xp, d.gold, d.total);
/** Compare this device with the cloud and bring both in line. */
function syncNow(firstLink) {
  if (!Sync.user()) return Promise.resolve();
  if (syncing) return syncing;
  syncing = (async () => {
    setCloud('busy');
    try {
      const remoteRaw = await Sync.pull();
      const remote = remoteRaw && G.migrate(remoteRaw);
      lastPull = Date.now();
      const plan = Sync.plan(S, remote, Sync.syncMeta().syncedAt);
      if (plan === 'pull') {
        adopt(remote); await Sync.push(S);
        if (firstLink) notify({ title: L('ОБЛАКО'), msg: L('Прогресс загружен из облака.'), sub: summary(S) });
      } else if (plan === 'push') { await Sync.push(S); }
      else if (plan === 'ask') { askWhichSave(remote); }
      else { await Sync.push(S); }
      setCloud('ok');
    } catch (e) { setCloud(e.code === 'signed_out' ? '' : 'err'); }
    finally { syncing = null; }
  })();
  return syncing;
}
function askWhichSave(remote) {
  openSheet(`<h2>${L('КАКОЙ ПРОГРЕСС ОСТАВИТЬ?')}</h2><div class="form">
    <p class="hint">${L('В облаке уже есть прогресс, и на этом телефоне тоже. Выберите, какой оставить. Второй будет заменён.')}</p>
    <button class="btn big" type="button" id="keep-cloud">${L('ОБЛАКО')}<br><small>${summary(remote)}</small></button>
    <button class="btn big" type="button" id="keep-local">${L('ЭТОТ ТЕЛЕФОН')}<br><small>${summary(S)}</small></button></div>`, null);
  $('keep-cloud').onclick = async () => { adopt(remote); closeSheet(); try { await Sync.push(S); setCloud('ok'); } catch (e) { setCloud('err'); } };
  $('keep-local').onclick = async () => { closeSheet(); await pushNow(); };
}
function cloudHtml() {
  const u = Sync.user();
  if (u) return `<span class="lab">${L('Облачное сохранение')}</span>
    <p class="hint left">${L('Вход выполнен: ')}<b>${esc(u.email)}</b><br><span id="cl-status">${cloudStatusText()}</span></p>
    <div class="actions"><button class="btn sm" type="button" id="cl-sync">${L('Синхронизировать')}</button><button class="btn sm" type="button" id="cl-out">${L('Выйти')}</button></div>`;
  return `<label for="cl-email">${L('Облачное сохранение')}</label>
    <p class="hint left">${L('Войдите, и прогресс не пропадёт при удалении приложения или смене телефона. Первый раз нажмите «Создать аккаунт».')}</p>
    <input id="cl-email" type="email" inputmode="email" autocomplete="username" autocapitalize="off" spellcheck="false" placeholder="you@example.com">
    <input id="cl-pass" type="password" autocomplete="current-password" minlength="6" placeholder="${L('Пароль (не меньше 6 символов)')}">
    <div class="actions"><button class="btn sm" type="button" id="cl-new">${L('Создать аккаунт')}</button><button class="btn" type="button" id="cl-in">${L('Войти')}</button></div>
    <div class="err" id="cl-err"></div>`;
}
function cloudError(e) {
  const c = e && e.code;
  if (c === 'offline') return L('Нет связи с интернетом.');
  if (c === 'rate_limit' || c === 'over_request_rate_limit') return L('Слишком много попыток подряд. Подождите немного и попробуйте снова.');
  if (c === 'invalid_credentials') return L('Неверная почта или пароль.');
  if (c === 'user_already_exists' || c === 'email_exists') return L('Такой аккаунт уже есть. Нажмите «Войти».');
  if (c === 'weak_password') return L('Пароль слишком простой: нужно не меньше 6 символов.');
  if (c === 'email_not_confirmed') return L('Подтвердите почту: откройте письмо от Supabase, нажмите ссылку, затем «Войти».');
  if (c === 'email_address_invalid' || c === 'validation_failed') return L('Проверьте адрес почты.');
  return L('Не получилось: ') + (e && (e.message || c));
}
function wireCloud() {
  const box = $('cloud-box'); if (!box) return;
  const rewire = () => { box.innerHTML = cloudHtml(); wireCloud(); };
  if (Sync.user()) {
    $('cl-sync').onclick = () => syncNow().then(() => { const st = $('cl-status'); if (st) st.textContent = cloudStatusText(); });
    $('cl-out').onclick = async () => { await Sync.signOut(); setCloud(''); rewire(); };
    return;
  }
  const errEl = $('cl-err'), email = () => $('cl-email').value.trim(), pass = () => $('cl-pass').value;
  const go = async (fn, btn) => {
    errEl.textContent = '';
    if (!/^\S+@\S+\.\S+$/.test(email())) { errEl.textContent = L('Проверьте адрес почты.'); return; }
    if (pass().length < 6) { errEl.textContent = L('Пароль слишком простой: нужно не меньше 6 символов.'); return; }
    btn.disabled = true;
    try {
      await fn(email(), pass());
      G.log(S, L('Облачное сохранение подключено'), 'gold');
      rewire(); await syncNow(true);
      const st = $('cl-status'); if (st) st.textContent = cloudStatusText();
    } catch (e) { errEl.textContent = cloudError(e); btn.disabled = false; }
  };
  $('cl-in').onclick = () => go(Sync.signIn, $('cl-in'));
  $('cl-new').onclick = () => go(Sync.signUp, $('cl-new'));
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { if (pushTimer) pushNow(); }
  else if (Date.now() - lastPull > 30000) syncNow();
});
addEventListener('online', () => syncNow());

/* ---------- timer for goals in minutes ---------- */
let wake = null;
async function keepAwake(on) {
  try {
    if (on && !wake && navigator.wakeLock && !document.hidden) { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); }
    else if (!on && wake) { const w = wake; wake = null; await w.release(); }
  } catch (e) { /* not supported or refused */ }
}
const elapsed = (T) => T.acc + (T.run ? Date.now() - T.t0 : 0);
function startTimer(id) {
  if (S.timer && S.timer.id === id) { tab('quests'); document.querySelector('.app').scrollTop = 0; return; }
  S.timer = { id, base: S.prog[id] || 0, acc: 0, t0: Date.now(), run: true };
  sfx('note'); haptic(); keepAwake(true); render(); timerTick();
  document.querySelector('.app').scrollTo({ top: 0, behavior: RM ? 'auto' : 'smooth' });
}
function timerTick() {
  const T = S.timer; if (!T) return;
  const g = S.goals.find((x) => x.id === T.id);
  if (!g) { S.timer = null; keepAwake(false); render(); return; }
  const el = elapsed(T), want = Math.min(g.max, T.base + Math.floor(el / 60000));
  if (want > (S.prog[g.id] || 0)) { if (G.goalSet(S, g.id, want, new Date(), ui) === 'done') justDone.add(g.id); render(); }
  if ((S.prog[g.id] || 0) >= g.max) {
    S.timer = null; keepAwake(false); render();
    notify({ title: L('ТАЙМЕР'), msg: F('Время вышло: {0}.', g.t), sub: L('Цель засчитана.') });
    return;
  }
  const total = Math.max(1, (g.max - T.base) * 60000), left = Math.max(0, total - el), sec = Math.ceil(left / 1000);
  $('tm-name').textContent = g.t + ' · ' + (S.prog[g.id] || 0) + '/' + g.max + g.unit;
  $('tm-clock').textContent = pad(Math.floor(sec / 60)) + ':' + pad(sec % 60);
  $('tm-clock').classList.toggle('paused', !T.run);
  $('tm-bar').style.width = Math.min(100, (el / total) * 100) + '%';
  $('tm-pause').textContent = T.run ? L('Пауза') : L('Продолжить');
}
$('tm-pause').onclick = () => {
  const T = S.timer; if (!T) return;
  if (T.run) { T.acc = elapsed(T); T.run = false; keepAwake(false); } else { T.t0 = Date.now(); T.run = true; keepAwake(true); }
  sfx('tap'); haptic(); save(); timerTick();
};
$('tm-stop').onclick = () => {
  const b = $('tm-stop');
  if (!b.dataset.armed) { b.dataset.armed = '1'; b.textContent = L('Точно?'); setTimeout(() => { b.dataset.armed = ''; b.textContent = L('Стоп'); }, 2500); return; }
  b.dataset.armed = ''; b.textContent = L('Стоп');
  S.timer = null; keepAwake(false); render();
};
document.addEventListener('visibilitychange', () => { if (!document.hidden && S.timer && S.timer.run) { keepAwake(true); timerTick(); } });
$('gstat').addEventListener('change', (e) => { if (e.target.id === 'gs-pick') { gsGoal = e.target.value; render(); } });

/* ---------- actions ---------- */
document.querySelector('.app').addEventListener('click', (e) => {
  const go = e.target.closest('[data-goto]'); if (go) { tab(go.dataset.goto); return; }
  const b = e.target.closest('[data-act]'); if (!b) return;
  const id = b.dataset.id, a = b.dataset.act;
  if (a === 'stat') { if (G.spendPoint(S, id)) { sfx('tap'); haptic(); render(); } }
  else if (a === 'goal-plus') { sfx('tap'); haptic(); if (G.goalPlus(S, id, new Date(), ui) === 'done') justDone.add(id); render(); }
  else if (a === 'goal-minus') { G.goalMinus(S, id); render(); }
  else if (a === 'quest-done') { if (G.completeQuest(S, id, ui)) render(); }
  else if (a === 'buy') { if (G.buy(S, id, ui)) { sfx('buy'); haptic(); render(); } }
  else if (a === 'edit-goal') goalSheet(S.goals.find((x) => x.id === id));
  else if (a === 'new-goal') goalSheet();
  else if (a === 'edit-quest') questSheet(S.quests.find((x) => x.id === id));
  else if (a === 'new-quest') questSheet();
  else if (a === 'edit-skill') skillSheet(S.skills.find((x) => x.id === id));
  else if (a === 'new-skill') skillSheet();
  else if (a === 'edit-reward') rewardSheet(S.rewards.find((x) => x.id === id));
  else if (a === 'new-reward') rewardSheet();
  else if (a === 'timer') startTimer(id);
  else if (a === 'pick-title') titleSheet();
  else if (a === 'new-dungeon') dungeonSheet();
  else if (a === 'edit-dungeon') dungeonSheet(S.dungeons.find((x) => x.id === id));
  else if (a === 'buy-shield') { if (G.buyShield(S, ui)) { sfx('buy'); haptic(); render(); } }
  else if (a === 'stage') {
    if (!b.dataset.armed) {
      b.dataset.armed = '1'; b.classList.add('armed'); b.textContent = '?'; sfx('tap');
      setTimeout(() => { if (b.isConnected && b.dataset.armed) { b.dataset.armed = ''; b.classList.remove('armed'); render(); } }, 2500);
      return;
    }
    const r = G.clearStage(S, id, +b.dataset.i, ui);
    if (r === 'locked') { floatText(L('Сначала пройдите все этапы'), 'r'); shake(); render(); return; }
    if (r) { sfx(r === 'boss' ? 'gold' : 'tap'); haptic(); render(); }
  }
});
$('pen-done').addEventListener('click', (e) => {
  const b = e.currentTarget;
  if (!b.dataset.armed) { b.dataset.armed = '1'; b.textContent = L('ЧЕСТНО ВЫПОЛНЕНО? НАЖМИТЕ ЕЩЁ РАЗ'); return; }
  b.dataset.armed = ''; b.textContent = L('ШТРАФ ВЫПОЛНЕН');
  G.clearPenalty(S, ui); render();
});
$('gear').onclick = settingsSheet;

/* ---------- tabs ---------- */
const TABS = ['status', 'quests', 'shop', 'log'];
let curTab = 'status';
function tab(which, instant) {
  const isNew = which !== curTab; curTab = which;
  for (const v of TABS) {
    const el = $('v-' + v); el.hidden = v !== which;
    if (v === which && isNew && !instant) { el.classList.remove('enter'); void el.offsetWidth; el.classList.add('enter'); }
  }
  $('tab-ind').style.transform = 'translateX(' + (TABS.indexOf(which) * 100) + '%)';
  if (isNew && !instant) { sfx('tap'); haptic(); }
  document.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-selected', t.dataset.tab === which));
  document.querySelector('.app').scrollTop = 0;
  try { sessionStorage.setItem(KEY + '-tab', which); } catch (e) { /* ignore */ }
}
document.querySelectorAll('.tab').forEach((t) => { t.onclick = () => tab(t.dataset.tab); });
try { const t = sessionStorage.getItem(KEY + '-tab'); if (TABS.includes(t)) tab(t, true); } catch (e) { /* ignore */ }
(function swipeTabs() {
  let x0 = null, y0 = 0, t0 = 0;
  const app = document.querySelector('.app');
  app.addEventListener('touchstart', (e) => {
    if (e.touches.length > 1 || e.target.closest('input,select,textarea,details,.sheet')) { x0 = null; return; }
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; t0 = Date.now();
  }, { passive: true });
  app.addEventListener('touchend', (e) => {
    if (x0 === null) return;
    const t = e.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0; x0 = null;
    if (Date.now() - t0 > 600 || Math.abs(dx) < 70 || Math.abs(dy) > Math.abs(dx) * 0.6) return;
    if (!$('sheet-bg').hidden || !$('overlay').hidden) return;
    const i = TABS.indexOf(curTab) + (dx < 0 ? 1 : -1);
    if (i >= 0 && i < TABS.length) tab(TABS[i]);
  }, { passive: true });
})();

/* ---------- clock + start ---------- */
function tick() {
  if (G.rollover(S, new Date(), ui)) render();
  const n = new Date(), m = new Date(n); m.setHours(24, 0, 0, 0);
  let s = Math.floor((m - n) / 1000); const h = Math.floor(s / 3600); s %= 3600;
  const txt = pad(h) + ':' + pad(Math.floor(s / 60)) + ':' + pad(s % 60);
  $('clock').textContent = txt; $('pen-clock').textContent = txt;
  if (S.timer) timerTick();
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
render(); tick(); setInterval(tick, 1000);
(function boot() {
  const b = $('boot');
  const done = () => {
    if (!booting) return; booting = false;
    b.classList.add('out'); setTimeout(() => { b.hidden = true; }, 460);
    $('v-' + curTab).classList.add('enter');
    if (queue.length && !showing) setTimeout(nextNote, 250);
    setTimeout(startSetup, 200);
  };
  if (RM) { b.hidden = true; booting = false; if (queue.length) nextNote(); startSetup(); return; }
  b.hidden = false;
  const lines = [L('Синхронизация данных…'), L('Проверка состояния игрока…'), (S.welcomed ? L('Добро пожаловать, ') + S.name + '.' : L('Обнаружен новый игрок…'))];
  lines.forEach((l, i) => setTimeout(() => { $('boot-line').textContent = l; }, i * 330));
  b.addEventListener('click', done); setTimeout(done, 1150);
})();

setCloud(''); if (Sync.user()) setTimeout(() => syncNow(), 1500);

// expose for debugging and tests
window.__sistema = { get state() { return S; }, set state(v) { S = v; render(); }, render };
