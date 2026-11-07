// Game rules. Pure logic over the state object: no DOM, no storage.
// Effects the interface should show are sent through the `ui` sink:
//   ui.notify({title, msg, sub, big, gold, alert, burst})
//   ui.float(text, cls, dx)
import { L } from './i18n.js';

export const STATE_VERSION = 2;
export const STATS = { str: L('Сила'), end: L('Стойкость'), int: L('Интеллект'), dis: L('Дисциплина'), agi: L('Ловкость'), cha: L('Харизма') };
export const TITLES = [[1, L('Новичок')], [3, L('Пробуждённый')], [6, L('Ученик')], [10, L('Упорный')], [15, L('Охотник за целями')], [25, L('Мастер себя')], [40, L('Легенда')]];
export const RANKS = [[1, 'E'], [5, 'D'], [10, 'C'], [18, 'B'], [28, 'A'], [40, 'S']];
export const DIFF = { easy: { n: L('Лёгкое'), xp: 30, g: 10 }, mid: { n: L('Среднее'), xp: 80, g: 25 }, hard: { n: L('Сложное'), xp: 150, g: 50 } };
export const DAYS = [[1, L('Пн')], [2, L('Вт')], [3, L('Ср')], [4, L('Чт')], [5, L('Пт')], [6, L('Сб')], [0, L('Вс')]];
export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
export const PENALTY = 20;        // HP lost per missed daily
export const PEN_FAIL = 30;       // HP lost when the penalty task itself is failed
export const MAX_MISSED = 7;      // cap for long absences
export const PEN_TASKS = [L('100 приседаний'), L('100 отжиманий (можно подходами)'), L('Планка 3 минуты суммарно'), L('Пробежка 3 км'), L('45 минут уборки'), L('1 час учёбы без телефона'), L('Холодный душ и 50 выпадов')];

const NOOP = { notify() {}, float() {} };
export const uid = () => Math.random().toString(36).slice(2, 9);
const pad = (n) => String(n).padStart(2, '0');
export const dayKey = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
export const keyDate = (k) => new Date(k + 'T00:00:00');
export const need = (level) => 100 + (level - 1) * 50;
export const pick = (table, level) => table.filter((t) => level >= t[0]).pop()[1];
export const goalsFor = (S, date) => S.goals.filter((g) => g.days.includes(date.getDay()));
export const dailyBonus = (S) => ({ xp: 50 + S.level * 10, g: 20 + S.level * 5 });

export function fresh(now = new Date()) {
  return {
    v: STATE_VERSION, name: L('Игрок'), level: 1, xp: 0, hp: 100, maxHp: 100, streak: 0, best: 0, total: 0, points: 0, gold: 0,
    stats: { str: 10, end: 10, int: 10, dis: 10, agi: 10, cha: 10 },
    skills: [{ id: uid(), n: L('Английский язык'), lv: 1, p: 0 }],
    goals: [
      { id: uid(), t: L('Отжимания'), max: 30, step: 10, unit: '', stat: 'str', days: ALL_DAYS.slice() },
      { id: uid(), t: L('Приседания'), max: 30, step: 10, unit: '', stat: 'end', days: ALL_DAYS.slice() },
      { id: uid(), t: L('Чтение'), max: 20, step: 5, unit: L(' мин'), stat: 'int', days: ALL_DAYS.slice() },
      { id: uid(), t: L('Английский'), max: 15, step: 5, unit: L(' мин'), stat: 'int', days: [1, 2, 3, 4, 5] },
    ],
    prog: {}, hit: {}, day: dayKey(now), claimed: false, penalty: null, sound: true,
    quests: [{ id: uid(), type: 'study', t: L('Выучить 20 новых английских слов'), diff: 'mid', stat: 'int', skill: null, done: false }],
    rewards: [{ id: uid(), t: L('Серия любимого сериала'), price: 150 }, { id: uid(), t: L('1 час игр'), price: 300 }, { id: uid(), t: L('Заказать любимую еду'), price: 800 }],
    log: [], welcomed: false, updated: 0,
  };
}

/** Bring a saved state up to date; returns null when it is not a usable state. */
export function migrate(d) {
  if (!d || d.v !== STATE_VERSION || !d.stats || !Array.isArray(d.goals)) return null;
  if (d.gold == null) d.gold = 0;
  if (!d.rewards) d.rewards = fresh().rewards;
  if (d.penalty === undefined) d.penalty = null;
  if (d.sound == null) d.sound = true;
  if (!d.updated) d.updated = 0;
  d.goals.forEach((g) => { if (!Array.isArray(g.days)) g.days = ALL_DAYS.slice(); });
  if (d.quests[0] && d.quests[0].skill === null && d.skills[0] && !d.log.length) d.quests[0].skill = d.skills[0].id;
  return d;
}

export function log(S, text, kind) {
  S.log.unshift({ ts: Date.now(), text, kind: kind || '' });
  if (S.log.length > 200) S.log.length = 200;
}

export function rewardText(S, xp, g) {
  return S.penalty ? L('Награда заблокирована: вы в штрафной зоне') : L('Награда: +') + xp + ' EXP · +' + g + L(' золота');
}

export function gainXp(S, n, ui = NOOP) {
  S.xp += n;
  while (S.xp >= need(S.level)) {
    S.xp -= need(S.level); S.level++; S.points += 3; S.hp = S.maxHp; S.gold += 50;
    log(S, L('Уровень повышен: ') + S.level, 'gold');
    ui.notify({ gold: true, burst: true, title: L('УРОВЕНЬ ПОВЫШЕН'), big: L('УР. ') + S.level, msg: L('Вы стали сильнее.'), sub: L('+3 свободных очка характеристик\n+50 золота\nHP полностью восстановлено') });
  }
}

/** Give EXP and gold, unless the player is in the Penalty Zone. Returns whether it was paid. */
export function award(S, xp, g, ui = NOOP) {
  if (S.penalty) { ui.float(L('ЗАБЛОКИРОВАНО'), 'r'); return false; }
  S.gold += g;
  ui.float('+' + xp + ' EXP', '', -30);
  ui.float('+' + g + ' ◈', 'g', 34);
  gainXp(S, xp, ui);
  return true;
}

export function hurt(S, n, ui = NOOP) {
  S.hp -= n;
  if (S.hp <= 0) {
    const lost = S.xp; S.xp = 0; S.hp = Math.round(S.maxHp / 2);
    log(S, L('HP закончились: потерян опыт уровня (') + lost + ' EXP)', 'bad');
    ui.notify({ alert: true, title: L('ВЫ ПОВЕРЖЕНЫ'), big: 'HP 0', msg: L('Лень победила в этот раз.'), sub: L('Потерян опыт текущего уровня: ') + lost + L(' EXP\nHP восстановлено до ') + S.hp });
  }
}

/** Count the days since S.day (exclusive of today) that had goals and were not completed. */
export function missedDays(S, now) {
  const today = dayKey(now);
  let missed = 0;
  const prev = keyDate(S.day);
  if (goalsFor(S, prev).length && !S.claimed) missed = 1;
  const d = new Date(prev); d.setDate(d.getDate() + 1);
  for (let i = 0; dayKey(d) !== today && i < MAX_MISSED; i++) {
    if (goalsFor(S, d).length) missed++;
    d.setDate(d.getDate() + 1);
  }
  return Math.min(missed, MAX_MISSED);
}

/** Move the state to a new day. Returns true when the day changed. */
export function rollover(S, now = new Date(), ui = NOOP, rand = Math.random) {
  const today = dayKey(now);
  if (S.day === today) return false;
  if (keyDate(S.day) > keyDate(today)) { S.day = today; return true; } // clock went backwards
  const failedPenalty = !!S.penalty;
  if (S.penalty) {
    log(S, L('Штраф «') + S.penalty.t + L('» не выполнен: −') + PEN_FAIL + ' HP', 'bad');
    ui.notify({ alert: true, title: L('ШТРАФ НЕ ВЫПОЛНЕН'), big: '−' + PEN_FAIL + ' HP', msg: L('Вы не прошли штрафную зону.'), sub: L('Система запомнит это.') });
    hurt(S, PEN_FAIL, ui); S.penalty = null;
  }
  const missed = missedDays(S, now);
  if (missed) {
    const was = S.streak; S.streak = 0;
    const t = PEN_TASKS[Math.floor(rand() * PEN_TASKS.length)];
    S.penalty = { t };
    log(S, L('Ежедневное задание провалено') + (missed > 1 ? ' (' + missed + L(' дн.)') : '') + ': −' + (PENALTY * missed) + L(' HP, штрафная зона'), 'bad');
    ui.notify({ alert: true, title: L('ШТРАФ'), big: '−' + (PENALTY * missed) + ' HP', msg: L('Ежедневное задание не выполнено') + (missed > 1 ? ' ' + missed + L(' дн. подряд') : '') + '.', sub: (was ? L('Серия в ') + was + L(' дн. прервана.\n') : '') + L('Вы перемещены в штрафную зону.\nЗадание: ') + t + L('\nДо выполнения опыт и золото не начисляются.') });
    hurt(S, PENALTY * missed, ui);
  } else if (!failedPenalty && S.hp < S.maxHp) { // a calm day heals 10 HP
    S.hp = Math.min(S.maxHp, S.hp + 10);
  }
  S.prog = {}; S.hit = {}; S.claimed = false; S.day = today;
  S.quests = S.quests.filter((q) => !q.done);
  const n = goalsFor(S, now).length;
  if (n) ui.notify({ title: L('УВЕДОМЛЕНИЕ'), msg: L('Новое ежедневное задание получено.'), sub: L('Целей на сегодня: ') + n + L('\nНевыполнение приведёт к штрафу.') });
  return true;
}

/** Pay the daily reward when every goal for today is done. Returns true when it was claimed now. */
export function checkDaily(S, now = new Date(), ui = NOOP) {
  const tg = goalsFor(S, now);
  if (S.claimed || !tg.length || !tg.every((g) => (S.prog[g.id] || 0) >= g.max)) return false;
  S.claimed = true; S.stats.dis++; S.streak++; S.best = Math.max(S.best, S.streak); S.total++;
  const b = dailyBonus(S);
  log(S, L('Ежедневное задание выполнено') + (S.penalty ? L(' (награда заблокирована)') : ': +' + b.xp + ' EXP, +' + b.g + L(' золота')), 'gold');
  ui.notify({ gold: true, burst: true, title: L('ЗАДАНИЕ ВЫПОЛНЕНО'), msg: L('Ежедневное задание выполнено.'), sub: rewardText(S, b.xp, b.g) + L('\nДисциплина +1\nСерия: ') + S.streak + L(' дн.') });
  award(S, b.xp, b.g, ui);
  return true;
}

/** Add one step to a goal. Returns 'done' when the goal was just completed. */
export function goalPlus(S, id, now = new Date(), ui = NOOP) {
  const g = S.goals.find((x) => x.id === id); if (!g) return null;
  const c = S.prog[g.id] || 0; if (c >= g.max) return null;
  S.prog[g.id] = Math.min(g.max, c + g.step);
  let res = 'step';
  if (S.prog[g.id] >= g.max && !S.hit[g.id]) {
    S.hit[g.id] = 1; S.stats[g.stat]++; res = 'done';
    award(S, 10, 5, ui);
    log(S, g.t + ': ' + g.max + g.unit + ' (' + STATS[g.stat] + ' +1)');
  }
  checkDaily(S, now, ui);
  return res;
}

export function goalMinus(S, id) {
  const g = S.goals.find((x) => x.id === id); if (!g) return;
  S.prog[g.id] = Math.max(0, (S.prog[g.id] || 0) - g.step);
}

export function completeQuest(S, id, ui = NOOP) {
  const q = S.quests.find((x) => x.id === id); if (!q || q.done) return false;
  q.done = true; S.stats[q.stat]++; S.total++;
  const D = DIFF[q.diff];
  let extra = '';
  const sk = q.skill && S.skills.find((s) => s.id === q.skill);
  if (sk) {
    sk.p += 25; extra = '\n' + sk.n + ' +25%';
    if (sk.p >= 100) { sk.p -= 100; sk.lv++; extra += L('\nНавык «') + sk.n + L('» достиг ур. ') + sk.lv; log(S, L('Навык «') + sk.n + L('»: уровень ') + sk.lv, 'gold'); }
  }
  log(S, L('Выполнено: ') + q.t + (S.penalty ? '' : ' (+' + D.xp + ' EXP, +' + D.g + L(' золота)')));
  ui.notify({ title: L('ЗАДАНИЕ ВЫПОЛНЕНО'), msg: q.t, sub: rewardText(S, D.xp, D.g) + '\n' + STATS[q.stat] + ' +1' + extra });
  award(S, D.xp, D.g, ui);
  return true;
}

export function buy(S, id, ui = NOOP) {
  const r = S.rewards.find((x) => x.id === id); if (!r || S.gold < r.price) return false;
  S.gold -= r.price;
  log(S, L('Куплено: ') + r.t + ' (−' + r.price + L(' золота)'), 'gold');
  ui.notify({ gold: true, title: L('НАГРАДА ПОЛУЧЕНА'), big: '−' + r.price, msg: r.t, sub: L('Вы это заслужили. Наслаждайтесь.\nОсталось золота: ') + S.gold });
  return true;
}

export function spendPoint(S, stat) {
  if (S.points <= 0 || !(stat in S.stats)) return false;
  S.points--; S.stats[stat]++;
  log(S, STATS[stat] + L(' +1 (очко)'));
  return true;
}

export function clearPenalty(S, ui = NOOP) {
  if (!S.penalty) return false;
  log(S, L('Штраф «') + S.penalty.t + L('» выполнен'), 'gold');
  S.penalty = null;
  ui.notify({ title: L('ШТРАФНАЯ ЗОНА ПРОЙДЕНА'), msg: L('Вы вернулись.'), sub: L('Опыт и золото снова начисляются.\nНе подводите Систему.') });
  return true;
}
