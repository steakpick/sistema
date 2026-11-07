// Game rules. Pure logic over the state object: no DOM, no storage.
// Effects the interface should show are sent through the `ui` sink:
//   ui.notify({title, msg, sub, big, gold, alert, burst})
//   ui.float(text, cls, dx)
import { L, F } from './i18n.js';

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
export const SHIELD_PRICE = 300;  // streak shield in the shop
export const SHIELD_MAX = 2;
export const HIST_MAX = 400;      // days of history kept
export const DUNGEON = { normal: { n: L('Обычное'), xp: 300, g: 120 }, epic: { n: L('Эпическое'), xp: 600, g: 250 } };
export const STAGE = { xp: 40, g: 15 };
export const WEEK_RANKS = [[95, 'S', 150], [85, 'A', 100], [70, 'B', 60], [50, 'C', 30], [30, 'D', 10], [0, 'E', 0]];
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

const newCnt = () => ({ days: 0, quests: 0, goals: 0, pens: 0, buys: 0, dungeons: 0, weekS: 0 });

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
    hist: {}, cnt: newCnt(), tot: {}, ach: {}, titleSel: null, shields: 0, dungeons: [], timer: null, qd: 0, report: null,
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
  for (const [k, v] of [['hist', {}], ['tot', {}], ['ach', {}], ['dungeons', []], ['shields', 0], ['qd', 0]]) if (d[k] == null) d[k] = v;
  d.cnt = Object.assign(newCnt(), d.cnt);
  if (d.titleSel === undefined) d.titleSel = null;
  if (d.timer === undefined) d.timer = null;
  if (d.report === undefined) d.report = null;
  d.goals.forEach((g) => { if (!Array.isArray(g.days)) g.days = ALL_DAYS.slice(); });
  if (d.quests[0] && d.quests[0].skill === null && d.skills[0] && !d.log.length) d.quests[0].skill = d.skills[0].id;
  return d;
}

/* ---------- stat effects: every point above 10 adds 1% ---------- */
const over = (S, k) => Math.max(0, (S.stats[k] || 10) - 10);
export function effects(S) {
  return {
    maxHp: 100 + 2 * over(S, 'end'),          // Resilience: +2 max HP
    pen: Math.min(50, over(S, 'dis')),         // Discipline: % less HP lost to penalties
    study: Math.min(50, over(S, 'int')),       // Intellect: % more EXP for study quests and dungeons
    daily: Math.min(50, over(S, 'str')),       // Strength: % more EXP for the daily quest
    gold: Math.min(50, over(S, 'agi')),        // Agility: % more gold
    price: Math.min(30, over(S, 'cha')),       // Charisma: % off shop prices
  };
}
export const pct = (n, p) => Math.round(n * (1 + p / 100));
/** EXP and gold after stat bonuses. kind: 'daily' | 'study' | undefined */
export function gains(S, xp, g, kind) {
  const e = effects(S);
  return { xp: pct(xp, kind === 'daily' ? e.daily : kind === 'study' ? e.study : 0), g: pct(g, e.gold) };
}
export const penaltyHp = (S, base) => Math.max(1, Math.round(base * (1 - effects(S).pen / 100)));
export const priceOf = (S, price) => Math.max(1, Math.round(price * (1 - effects(S).price / 100)));
/** Keep max HP in step with Resilience. */
export function applyStats(S) {
  const m = effects(S).maxHp;
  if (S.maxHp === m) return false;
  if (m > S.maxHp) S.hp += m - S.maxHp;
  S.maxHp = m; S.hp = Math.min(S.hp, m);
  return true;
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
  if (goalsFor(S, prev).length && !S.claimed && S.grace !== S.day) missed = 1; // the setup day is a free trial
  const d = new Date(prev); d.setDate(d.getDate() + 1);
  for (let i = 0; dayKey(d) !== today && i < MAX_MISSED; i++) {
    if (goalsFor(S, d).length) missed++;
    d.setDate(d.getDate() + 1);
  }
  return Math.min(missed, MAX_MISSED);
}

export const weekStart = (d) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };

/** Move the state to a new day. Returns true when the day changed. */
export function rollover(S, now = new Date(), ui = NOOP, rand = Math.random) {
  const today = dayKey(now);
  if (S.day === today) return false;
  if (keyDate(S.day) > keyDate(today)) { S.day = today; return true; } // clock went backwards
  const prevKey = S.day, prev = keyDate(prevKey);
  const failedPenalty = !!S.penalty;
  if (S.penalty) {
    const n = penaltyHp(S, PEN_FAIL);
    log(S, L('Штраф «') + S.penalty.t + L('» не выполнен: −') + n + ' HP', 'bad');
    ui.notify({ alert: true, title: L('ШТРАФ НЕ ВЫПОЛНЕН'), big: '−' + n + ' HP', msg: L('Вы не прошли штрафную зону.'), sub: L('Система запомнит это.') });
    hurt(S, n, ui); S.penalty = null;
  }
  // write down what happened on every day since the last visit
  const missedKeys = [];
  const prevGoals = goalsFor(S, prev), p = {};
  for (const g of prevGoals) p[g.id] = [S.prog[g.id] || 0, g.max];
  const st = S.claimed ? 'done' : !prevGoals.length ? 'rest' : S.grace === prevKey ? 'grace' : 'fail';
  if (st === 'fail') missedKeys.push(prevKey);
  S.hist[prevKey] = { s: st, p, q: S.qd || 0 };
  const d = new Date(prev); d.setDate(d.getDate() + 1);
  for (let i = 0; dayKey(d) !== today && i < 60; i++) {
    const k = dayKey(d);
    if (goalsFor(S, d).length) { missedKeys.push(k); S.hist[k] = { s: 'fail' }; } else S.hist[k] = { s: 'rest' };
    d.setDate(d.getDate() + 1);
  }
  let shielded = 0;
  while (S.shields > 0 && missedKeys.length) { S.hist[missedKeys.pop()].s = 'shield'; S.shields--; shielded++; }
  if (shielded) {
    log(S, F('Щит серии поглотил пропуск: {0} дн.', shielded), 'gold');
    ui.notify({ gold: true, title: L('ЩИТ СЕРИИ'), big: '🛡', msg: F('Щит поглотил пропуск: {0} дн.', shielded), sub: L('Серия и HP сохранены.') + '\n' + F('Щитов осталось: {0}', S.shields) });
  }
  const missed = Math.min(missedKeys.length, MAX_MISSED);
  if (missed) {
    const was = S.streak; S.streak = 0;
    const t = PEN_TASKS[Math.floor(rand() * PEN_TASKS.length)];
    const n = penaltyHp(S, PENALTY * missed);
    S.penalty = { t };
    log(S, L('Ежедневное задание провалено') + (missed > 1 ? ' (' + missed + L(' дн.)') : '') + ': −' + n + L(' HP, штрафная зона'), 'bad');
    ui.notify({ alert: true, title: L('ШТРАФ'), big: '−' + n + ' HP', msg: L('Ежедневное задание не выполнено') + (missed > 1 ? ' ' + missed + L(' дн. подряд') : '') + '.', sub: (was ? L('Серия в ') + was + L(' дн. прервана.\n') : '') + L('Вы перемещены в штрафную зону.\nЗадание: ') + t + L('\nДо выполнения опыт и золото не начисляются.') });
    hurt(S, n, ui);
  } else if (!failedPenalty && S.hp < S.maxHp) { // a calm day heals 10 HP
    S.hp = Math.min(S.maxHp, S.hp + 10);
  }
  const keys = Object.keys(S.hist);
  if (keys.length > HIST_MAX) keys.sort().slice(0, keys.length - HIST_MAX).forEach((k) => delete S.hist[k]);
  S.prog = {}; S.hit = {}; S.claimed = false; S.day = today; S.qd = 0; S.timer = null;
  S.quests = S.quests.filter((q) => !q.done);
  if (dayKey(weekStart(prev)) !== dayKey(weekStart(now))) weeklyReport(S, weekStart(prev), ui);
  const n = goalsFor(S, now).length;
  if (n) ui.notify({ title: L('УВЕДОМЛЕНИЕ'), msg: L('Новое ежедневное задание получено.'), sub: L('Целей на сегодня: ') + n + L('\nНевыполнение приведёт к штрафу.') });
  return true;
}

/** Days with goals in the week starting at `start`, from the history. */
export function weekSummary(S, start) {
  let done = 0, total = 0, quests = 0, shield = 0;
  const d = new Date(start);
  for (let i = 0; i < 7; i++) {
    const h = S.hist[dayKey(d)];
    if (h) {
      if (h.s === 'done') { done++; total++; } else if (h.s === 'fail') total++; else if (h.s === 'shield') shield++;
      quests += h.q || 0;
    }
    d.setDate(d.getDate() + 1);
  }
  return { done, total, quests, shield, pct: total ? Math.round((done / total) * 100) : null };
}
export const weekRank = (p) => WEEK_RANKS.find((r) => p >= r[0]);

/** Grade the finished week, pay gold for the rank and show the report. */
export function weeklyReport(S, start, ui = NOOP) {
  const w = weekSummary(S, start);
  if (!w.total) return null;
  const [, rank, g0] = weekRank(w.pct);
  const g = S.penalty ? 0 : g0;
  S.gold += g;
  if (rank === 'S') S.cnt.weekS++;
  S.report = Object.assign({ wk: dayKey(start), rank, g }, w);
  log(S, F('Недельный отчёт: ранг {0} ({1}%)', rank, w.pct) + (g ? ', +' + g + L(' золота') : ''), 'gold');
  ui.notify({ gold: g > 0, burst: rank === 'S', title: L('НЕДЕЛЬНЫЙ ОТЧЁТ'), big: L('РАНГ ') + rank,
    msg: F('Выполнено дней: {0} из {1} ({2}%).', w.done, w.total, w.pct),
    sub: F('Заданий за неделю: {0}', w.quests) + (w.shield ? '\n' + F('Щит спас дней: {0}', w.shield) : '') + '\n' +
      (g ? F('Награда: +{0} золота', g) : S.penalty && g0 ? L('Награда заблокирована: вы в штрафной зоне') : L('Система ждёт большего.')) });
  return S.report;
}

/** Pay the daily reward when every goal for today is done. Returns true when it was claimed now. */
export function checkDaily(S, now = new Date(), ui = NOOP) {
  const tg = goalsFor(S, now);
  if (S.claimed || !tg.length || !tg.every((g) => (S.prog[g.id] || 0) >= g.max)) return false;
  S.claimed = true; S.stats.dis++; S.streak++; S.best = Math.max(S.best, S.streak); S.total++; S.cnt.days++;
  const d0 = dailyBonus(S), b = gains(S, d0.xp, d0.g, 'daily');
  log(S, L('Ежедневное задание выполнено') + (S.penalty ? L(' (награда заблокирована)') : ': +' + b.xp + ' EXP, +' + b.g + L(' золота')), 'gold');
  ui.notify({ gold: true, burst: true, title: L('ЗАДАНИЕ ВЫПОЛНЕНО'), msg: L('Ежедневное задание выполнено.'), sub: rewardText(S, b.xp, b.g) + L('\nДисциплина +1\nСерия: ') + S.streak + L(' дн.') });
  award(S, b.xp, b.g, ui);
  return true;
}

/** Set today's amount for a goal. Returns 'done' when the goal was just completed, 'step' otherwise, null if nothing changed. */
export function goalSet(S, id, value, now = new Date(), ui = NOOP) {
  const g = S.goals.find((x) => x.id === id); if (!g) return null;
  const c = S.prog[g.id] || 0, v = Math.max(0, Math.min(g.max, Math.round(value)));
  if (v === c) return null;
  S.prog[g.id] = v; S.tot[g.id] = Math.max(0, (S.tot[g.id] || 0) + v - c);
  let res = 'step';
  if (v >= g.max && !S.hit[g.id]) {
    const r = gains(S, 10, 5);
    S.hit[g.id] = 1; S.stats[g.stat]++; S.cnt.goals++; res = 'done';
    award(S, r.xp, r.g, ui);
    log(S, g.t + ': ' + g.max + g.unit + ' (' + STATS[g.stat] + ' +1)');
  }
  checkDaily(S, now, ui);
  return res;
}

/** Add one step to a goal. Returns 'done' when the goal was just completed. */
export function goalPlus(S, id, now = new Date(), ui = NOOP) {
  const g = S.goals.find((x) => x.id === id); if (!g) return null;
  const c = S.prog[g.id] || 0; if (c >= g.max) return null;
  return goalSet(S, id, c + g.step, now, ui);
}

export function goalMinus(S, id) {
  const g = S.goals.find((x) => x.id === id); if (!g) return;
  goalSet(S, id, (S.prog[g.id] || 0) - g.step);
}

export function completeQuest(S, id, ui = NOOP) {
  const q = S.quests.find((x) => x.id === id); if (!q || q.done) return false;
  const D = gains(S, DIFF[q.diff].xp, DIFF[q.diff].g, q.type === 'study' ? 'study' : undefined);
  q.done = true; S.stats[q.stat]++; S.total++; S.cnt.quests++; S.qd = (S.qd || 0) + 1;
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
  const r = S.rewards.find((x) => x.id === id), price = r && priceOf(S, r.price); if (!r || S.gold < price) return false;
  S.gold -= price; S.cnt.buys++;
  log(S, L('Куплено: ') + r.t + ' (−' + price + L(' золота)'), 'gold');
  ui.notify({ gold: true, title: L('НАГРАДА ПОЛУЧЕНА'), big: '−' + price, msg: r.t, sub: L('Вы это заслужили. Наслаждайтесь.\nОсталось золота: ') + S.gold });
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
  S.penalty = null; S.cnt.pens++;
  ui.notify({ title: L('ШТРАФНАЯ ЗОНА ПРОЙДЕНА'), msg: L('Вы вернулись.'), sub: L('Опыт и золото снова начисляются.\nНе подводите Систему.') });
  return true;
}

/* ---------- first-launch setup ---------- */
const WEEKDAYS = [1, 2, 3, 4, 5];
// goal: [name, per day, step, unit, stat, days?]; quest: [name, difficulty, stat, linked to the pack's skill?]
export const PACKS = [
  { id: 'body', icon: '⚔', n: L('Тело'), d: L('Сила и выносливость'),
    goals: [[L('Отжимания'), 30, 10, '', 'str'], [L('Приседания'), 40, 10, '', 'end'], [L('Планка'), 2, 1, L(' мин'), 'end']],
    quests: [[L('Пробежать 3 км без остановки'), 'hard', 'agi']] },
  { id: 'mind', icon: '◈', n: L('Ум'), d: L('Чтение и новые знания'),
    goals: [[L('Чтение'), 20, 5, L(' мин'), 'int']],
    quests: [[L('Дочитать книгу до конца'), 'hard', 'int']] },
  { id: 'lang', icon: '✎', n: L('Языки'), d: L('Иностранный язык каждый будний день'), skill: L('Английский язык'),
    goals: [[L('Английский'), 15, 5, L(' мин'), 'int', WEEKDAYS]],
    quests: [[L('Выучить 20 новых английских слов'), 'mid', 'int', true]] },
  { id: 'study', icon: '▣', n: L('Учёба'), d: L('Сосредоточенная работа без телефона'), skill: L('Учёба'),
    goals: [[L('Учёба без телефона'), 60, 15, L(' мин'), 'int', WEEKDAYS]],
    quests: [[L('Разобрать одну сложную тему'), 'mid', 'int', true]] },
  { id: 'health', icon: '✚', n: L('Здоровье'), d: L('Вода, шаги и сон'),
    goals: [[L('Вода'), 8, 1, L(' стак.'), 'end'], [L('Шаги'), 6000, 2000, '', 'agi']],
    quests: [[L('Лечь спать до 23:00 пять дней подряд'), 'hard', 'dis']] },
  { id: 'disc', icon: '⛨', n: L('Дисциплина'), d: L('Режим и меньше телефона'),
    goals: [[L('Подъём с первого будильника'), 1, 1, '', 'dis'], [L('Без соцсетей до обеда'), 1, 1, '', 'dis']],
    quests: [[L('Убрать рабочее место'), 'easy', 'dis']] },
  { id: 'calm', icon: '☯', n: L('Спокойствие'), d: L('Медитация и дневник'),
    goals: [[L('Медитация'), 10, 5, L(' мин'), 'dis'], [L('Дневник'), 1, 1, '', 'cha']],
    quests: [[L('Позвонить близкому человеку'), 'easy', 'cha']] },
];
export const MODES = {
  soft: { n: L('Мягкий старт'), d: L('Половина нагрузки, выходные свободны'), k: 0.5 },
  normal: { n: L('Обычный'), d: L('Полная нагрузка каждый день'), k: 1 },
  hard: { n: L('Жёсткий'), d: L('В полтора раза больше. Для тех, кто готов'), k: 1.5 },
};
export const REWARD_PRESETS = [
  [L('Сладкое или любимый перекус'), 100],
  [L('Серия любимого сериала'), 150],
  [L('Кофе в кофейне'), 200],
  [L('1 час игр'), 300],
  [L('Поход в кино'), 600],
  [L('Заказать любимую еду'), 800],
  [L('Новая вещь для себя'), 2000],
];

/** Scale a daily amount for the chosen mode, keeping it a whole number of steps. */
export function scaleGoal(max, step, k) {
  if (max <= 1) return { max, step };
  const s = Math.max(1, Math.min(step, Math.round(step * Math.min(1, k)) || 1));
  return { max: Math.max(s, Math.round((max * k) / s) * s), step: s };
}

/** Add the chosen packs to the state; goals whose name already exists are skipped. Returns how many goals were added. */
export function addPacks(S, ids, mode = 'normal') {
  const m = MODES[mode] || MODES.normal;
  let added = 0;
  for (const p of PACKS.filter((x) => ids.includes(x.id))) {
    let skill = null;
    if (p.skill) {
      skill = S.skills.find((s) => s.n === p.skill);
      if (!skill) { skill = { id: uid(), n: p.skill, lv: 1, p: 0 }; S.skills.push(skill); }
    }
    for (const [t, max, step, unit, stat, days] of p.goals) {
      if (S.goals.some((g) => g.t === t)) continue;
      let d = (days || ALL_DAYS).slice();
      if (mode === 'soft') d = d.filter((x) => x !== 0 && x !== 6);
      S.goals.push(Object.assign({ id: uid(), t, unit, stat, days: d }, scaleGoal(max, step, m.k)));
      added++;
    }
    for (const [t, diff, stat, linked] of p.quests || []) {
      if (S.quests.some((q) => q.t === t)) continue;
      S.quests.push({ id: uid(), type: linked || stat === 'int' ? 'study' : 'once', t, diff, stat, skill: linked && skill ? skill.id : null, done: false });
    }
  }
  return added;
}

/** Build a new player's lists from the first-launch choices. */
export function applySetup(S, { name, packs, mode = 'normal', rewards = [] }) {
  if (name && name.trim()) S.name = name.trim().slice(0, 24);
  S.goals = []; S.skills = []; S.quests = []; S.prog = {}; S.hit = {}; S.claimed = false;
  addPacks(S, packs, mode);
  S.rewards = rewards.filter((i) => REWARD_PRESETS[i]).map((i) => ({ id: uid(), t: REWARD_PRESETS[i][0], price: REWARD_PRESETS[i][1] }));
  S.mode = mode; S.welcomed = true; S.grace = S.day;
  log(S, L('Система активирована'), 'gold');
  return S;
}

/* ---------- streak shield ---------- */
export function buyShield(S, ui = NOOP) {
  const price = priceOf(S, SHIELD_PRICE);
  if (S.shields >= SHIELD_MAX || S.gold < price) return false;
  S.gold -= price; S.shields++; S.cnt.buys++;
  log(S, L('Куплен щит серии') + ' (−' + price + L(' золота)'), 'gold');
  ui.notify({ gold: true, title: L('ЩИТ СЕРИИ'), big: '🛡', msg: L('Щит готов.'), sub: L('Он сам сработает, если вы пропустите день: серия и HP останутся.') + '\n' + F('Щитов: {0} из {1}', S.shields, SHIELD_MAX) });
  return true;
}

/* ---------- dungeons: a big goal in stages, the last stage is the boss ---------- */
export function addDungeon(S, { t, stages, diff = 'normal', stat = 'int' }) {
  const d = { id: uid(), t, diff, stat, stages: stages.map((x) => ({ t: x, done: false })), done: false };
  S.dungeons.unshift(d);
  log(S, L('Открыто подземелье: ') + t);
  return d;
}
/** Clear a stage. Returns 'stage', 'boss', 'locked' (boss before the other stages) or false. */
export function clearStage(S, id, i, ui = NOOP) {
  const d = S.dungeons.find((x) => x.id === id); if (!d || d.done) return false;
  const st = d.stages[i]; if (!st || st.done) return false;
  const boss = i === d.stages.length - 1;
  if (boss && d.stages.some((x, k) => k < i && !x.done)) return 'locked';
  st.done = true;
  if (!boss) {
    const r = gains(S, STAGE.xp, STAGE.g, 'study');
    log(S, d.t + ': ' + st.t);
    award(S, r.xp, r.g, ui);
    return 'stage';
  }
  const r = gains(S, DUNGEON[d.diff].xp, DUNGEON[d.diff].g, 'study');
  d.done = true; S.stats[d.stat] += 2; S.cnt.dungeons++;
  log(S, L('Подземелье пройдено: ') + d.t, 'gold');
  ui.notify({ gold: true, burst: true, title: L('ПОДЗЕМЕЛЬЕ ПРОЙДЕНО'), big: L('БОСС ПОВЕРЖЕН'), msg: d.t, sub: rewardText(S, r.xp, r.g) + '\n' + STATS[d.stat] + ' +2' });
  award(S, r.xp, r.g, ui);
  return 'boss';
}

/* ---------- achievements ---------- */
const most = (o) => Math.max(0, ...Object.values(o || {}));
export const ACH = [
  ['first', L('Первый шаг'), L('Выполнить ежедневное задание'), 20, (S) => S.cnt.days >= 1],
  ['streak3', L('Разгон'), L('Серия 3 дня'), 30, (S) => S.best >= 3],
  ['streak7', L('Неделя силы'), L('Серия 7 дней'), 70, (S) => S.best >= 7],
  ['streak30', L('Железная воля'), L('Серия 30 дней'), 300, (S) => S.best >= 30],
  ['streak100', L('Неостановимый'), L('Серия 100 дней'), 1000, (S) => S.best >= 100],
  ['lvl5', L('Пробуждение'), L('Достичь 5 уровня'), 50, (S) => S.level >= 5],
  ['lvl10', L('Охотник ранга C'), L('Достичь 10 уровня'), 100, (S) => S.level >= 10],
  ['lvl25', L('Элита'), L('Достичь 25 уровня'), 300, (S) => S.level >= 25],
  ['q10', L('Исполнитель'), L('Выполнить 10 заданий'), 50, (S) => S.cnt.quests >= 10],
  ['q50', L('Мастер заданий'), L('Выполнить 50 заданий'), 200, (S) => S.cnt.quests >= 50],
  ['k1000', L('Тысячник'), L('Набрать 1000 в одной цели'), 100, (S) => most(S.tot) >= 1000],
  ['skill3', L('Знаток'), L('Поднять навык до 3 уровня'), 80, (S) => S.skills.some((x) => x.lv >= 3)],
  ['stat30', L('Специалист'), L('Довести характеристику до 30'), 150, (S) => most(S.stats) >= 30],
  ['pen', L('Искупление'), L('Выбраться из штрафной зоны'), 30, (S) => S.cnt.pens >= 1],
  ['buy', L('Заслуженный отдых'), L('Купить первую награду'), 20, (S) => S.cnt.buys >= 1],
  ['dungeon', L('Покоритель подземелий'), L('Пройти подземелье'), 150, (S) => S.cnt.dungeons >= 1],
  ['weekS', L('Ранг S'), L('Получить ранг S за неделю'), 200, (S) => S.cnt.weekS >= 1],
];
/** Grant every achievement whose condition is met. Returns how many were new. */
export function checkAch(S, ui = NOOP) {
  const got = ACH.filter((a) => !S.ach[a[0]] && a[4](S));
  if (!got.length) return 0;
  let g = 0;
  for (const a of got) { S.ach[a[0]] = Date.now(); g += a[3]; log(S, L('Достижение: ') + a[1] + ' (+' + a[3] + L(' золота)'), 'gold'); }
  S.gold += g;
  const one = got.length === 1;
  ui.notify({ gold: true, burst: true, title: one ? L('ДОСТИЖЕНИЕ') : F('ДОСТИЖЕНИЯ: {0}', got.length), big: one ? got[0][1] : '',
    msg: one ? got[0][2] : got.map((a) => a[1]).join(' · '), sub: '+' + g + L(' золота') + '\n' + L('Титул можно выбрать в окне статуса.') });
  return got.length;
}
/** The title shown in the status window: a chosen achievement, or the one for the level. */
export function titleOf(S) {
  const a = S.titleSel && S.ach[S.titleSel] && ACH.find((x) => x[0] === S.titleSel);
  return a ? a[1] : pick(TITLES, S.level);
}
