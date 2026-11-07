// Progress views as HTML strings: calendar, goal chart, week, achievements, dungeons, stat effects.
import { L, F, LOC } from './i18n.js';
import * as G from './game.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const WEEKS = 17;

/** Status of a day: from history, or live for today. */
function dayState(S, d, todayKey) {
  const k = G.dayKey(d);
  if (k === todayKey) return S.claimed ? 'done' : G.goalsFor(S, d).length ? 'today' : 'rest';
  const h = S.hist[k];
  return h ? h.s : 'none';
}

export function calendarHtml(S, now = new Date()) {
  const todayKey = G.dayKey(now), start = G.weekStart(now);
  start.setDate(start.getDate() - (WEEKS - 1) * 7);
  const cnt = { done: 0, fail: 0, shield: 0 };
  let cells = '', months = '', lastM = -1;
  const d = new Date(start);
  for (let w = 0; w < WEEKS; w++) {
    const m = d.getMonth();
    months += `<span>${m !== lastM ? d.toLocaleDateString(LOC, { month: 'short' }).replace('.', '') : ''}</span>`; lastM = m;
    for (let r = 0; r < 7; r++) {
      const future = G.dayKey(d) > todayKey;
      const st = future ? 'future' : dayState(S, d, todayKey);
      if (cnt[st] != null) cnt[st]++;
      cells += `<i class="c-${st}${G.dayKey(d) === todayKey ? ' now' : ''}" title="${d.toLocaleDateString(LOC, { day: 'numeric', month: 'long' })}"></i>`;
      d.setDate(d.getDate() + 1);
    }
  }
  const rows = G.DAYS.map((x, i) => `<span>${i % 2 === 0 ? x[1] : ''}</span>`).join('');
  return `<div class="cal-wrap"><div class="cal-rows"><span></span>${rows}</div><div class="cal-main"><div class="cal-months" style="grid-template-columns:repeat(${WEEKS},1fr)">${months}</div><div class="cal" style="grid-template-columns:repeat(${WEEKS},1fr)">${cells}</div></div></div>
    <div class="legend"><span><i class="c-done"></i>${L('выполнено')}</span><span><i class="c-fail"></i>${L('провал')}</span><span><i class="c-shield"></i>${L('щит')}</span><span><i class="c-rest"></i>${L('отдых')}</span></div>
    <div class="cal-sum"><div><b>${cnt.done}</b><span>${L('выполнено')}</span></div><div><b>${cnt.fail}</b><span>${L('провалено')}</span></div><div><b>${S.best}</b><span>${L('рекорд серии')}</span></div></div>`;
}

export function goalChartHtml(S, goalId, now = new Date()) {
  if (!S.goals.length) return '<div class="empty">' + L('Добавьте цели, и здесь появится их история.') + '</div>';
  const g = S.goals.find((x) => x.id === goalId) || S.goals[0];
  const opts = S.goals.map((x) => `<option value="${x.id}" ${x === g ? 'selected' : ''}>${esc(x.t)}</option>`).join('');
  const todayKey = G.dayKey(now);
  let bars = '', done = 0, days = 0, sum = 0;
  const d = new Date(now); d.setDate(d.getDate() - 13);
  for (let i = 0; i < 14; i++) {
    const k = G.dayKey(d);
    let a = null, m = g.max;
    if (k === todayKey) { if (g.days.includes(d.getDay())) a = S.prog[g.id] || 0; }
    else { const h = S.hist[k]; if (h && h.p && h.p[g.id]) [a, m] = h.p[g.id]; }
    if (a != null) { days++; sum += a; if (a >= m) done++; }
    const hgt = a == null ? 0 : Math.max(4, Math.min(100, (a / m) * 100));
    bars += `<div class="gb${a != null && a >= m ? ' ok' : ''}${a == null ? ' none' : ''}" title="${a == null ? '' : a + '/' + m}"><i style="height:${hgt}%"></i><span>${d.getDate()}</span></div>`;
    d.setDate(d.getDate() + 1);
  }
  return `<div class="field"><select id="gs-pick" aria-label="${L('Цель')}">${opts}</select></div>
    <div class="gbars">${bars}</div>
    <div class="cal-sum"><div><b>${done}/${days}</b><span>${L('дней с нормой')}</span></div><div><b>${days ? Math.round(sum / days) : 0}</b><span>${L('в среднем')}${esc(g.unit)}</span></div><div><b>${S.tot[g.id] || 0}</b><span>${L('всего')}${esc(g.unit)}</span></div></div>
    <p class="hint">${L('Последние 14 дней. Высота столбика: доля дневной нормы.')}</p>`;
}

export function weekHtml(S, now = new Date()) {
  const ws = G.weekStart(now), w = G.weekSummary(S, ws);
  if (S.claimed) { w.done++; w.total++; } else if (G.goalsFor(S, now).length) w.pending = 1;
  const p = w.total ? Math.round((w.done / w.total) * 100) : null;
  const r = p == null ? '–' : G.weekRank(p)[1];
  const rep = S.report;
  return `<div class="week">
      <div class="wk-rank r-${r}"><b>${r}</b><span>${L('ранг сейчас')}</span></div>
      <div class="wk-info"><div>${F('Дней с выполненным заданием: {0} из {1}', w.done, w.total)}${w.pending ? ' · ' + L('сегодня в процессе') : ''}</div>
      <div>${F('Заданий за неделю: {0}', w.quests + (S.qd || 0))}</div>
      ${rep ? `<div class="dim">${F('Прошлый отчёт: ранг {0} ({1}%)', rep.rank, rep.pct)}</div>` : ''}</div></div>
    <p class="hint">${L('Отчёт приходит в понедельник. Ранг S: от 95% дней, A: 85%, B: 70%, C: 50%, D: 30%.')}</p>`;
}

export function achHtml(S) {
  const n = G.ACH.filter((a) => S.ach[a[0]]).length;
  const badge = ([id, name, desc, g]) => {
    const got = !!S.ach[id];
    return `<div class="badge${got ? ' got' : ''}${S.titleSel === id ? ' worn' : ''}"><b>${got ? '★' : '☆'} ${esc(name)}</b><span>${esc(desc)}</span><em>+${g}</em></div>`;
  };
  const got = G.ACH.filter((a) => S.ach[a[0]]), rest = G.ACH.filter((a) => !S.ach[a[0]]);
  return `<div class="ach-sum">${F('Получено: {0} из {1}', n, G.ACH.length)}</div>` +
    (got.length ? `<div class="ach">${got.map(badge).join('')}</div>` : `<div class="empty">${L('Первое достижение: выполнить ежедневное задание.')}</div>`) +
    (rest.length ? `<details class="other"><summary>${F('Ещё не получены: {0}', rest.length)}</summary><div class="ach">${rest.map(badge).join('')}</div></details>` : '');
}

export function effectsHtml(S) {
  const e = G.effects(S), s = G.STATS;
  const row = (k, text) => `<div><span>${s[k]}</span><b>${text}</b></div>`;
  return `<div class="fx-list">${row('end', F('макс. HP {0}', e.maxHp))}${row('dis', F('штраф −{0}%', e.pen))}${row('int', F('учёба +{0}% EXP', e.study))}${row('str', F('ежедневка +{0}% EXP', e.daily))}${row('agi', F('золото +{0}%', e.gold))}${row('cha', F('скидка {0}%', e.price))}</div>
    <p class="hint">${L('Каждое очко выше 10 даёт +1%. Предел: 50%, скидка до 30%.')}</p>`;
}

export function dungeonsHtml(S) {
  if (!S.dungeons.length) return '<div class="empty">' + L('Подземелье: большая цель из нескольких этапов. Последний этап: босс с крупной наградой.') + '</div>';
  return S.dungeons.map((d) => {
    const n = d.stages.filter((x) => x.done).length, D = G.DUNGEON[d.diff];
    const ready = d.stages.slice(0, -1).every((x) => x.done);
    return `<div class="dun${d.done ? ' done' : ''}">
      <span class="tag ${d.diff === 'epic' ? 'epic' : ''}">${L('ПОДЗЕМЕЛЬЕ')} · ${D.n.toUpperCase()}</span>
      <button class="qt" type="button" data-act="edit-dungeon" data-id="${d.id}">${esc(d.t)}</button>
      <div class="bar dg"><i style="width:${(n / d.stages.length) * 100}%"></i></div>
      <ol>${d.stages.map((st, i) => {
        const boss = i === d.stages.length - 1, locked = boss && !ready && !st.done;
        return `<li class="${st.done ? 'ok' : ''}${boss ? ' boss' : ''}"><button type="button" data-act="stage" data-id="${d.id}" data-i="${i}" ${st.done || d.done ? 'disabled' : ''} aria-label="${esc(st.t)}">${st.done ? '✓' : locked ? '🔒' : boss ? '☠' : ''}</button><span>${boss ? '<small>' + L('БОСС') + '</small> ' : ''}${esc(st.t)}</span></li>`;
      }).join('')}</ol>
      <div class="reward">${d.done ? L('Пройдено') : F('Этап: +{0} EXP · Босс: +{1} EXP · +{2} золота · {3} +2', G.STAGE.xp, D.xp, D.g, G.STATS[d.stat])}</div></div>`;
  }).join('');
}

export function shieldHtml(S) {
  const price = G.priceOf(S, G.SHIELD_PRICE), full = S.shields >= G.SHIELD_MAX;
  return `<div class="rw shield"><div class="t"><b>🛡 ${L('Щит серии')}</b><small>${F('Сам сработает при пропуске дня: серия и HP останутся. У вас: {0} из {1}', S.shields, G.SHIELD_MAX)}</small></div><span class="price">${price}</span><button class="btn" type="button" data-act="buy-shield" ${!full && S.gold >= price ? '' : 'disabled'}>${full ? L('Максимум') : L('Купить')}</button></div>`;
}
