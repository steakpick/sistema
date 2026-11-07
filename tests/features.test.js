import test from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../src/game.js';

const at = (iso) => new Date(iso);
const spy = () => { const n = []; return { n, notify: (o) => n.push(o), float() {} }; };
const state = (day, over = {}) => Object.assign(G.fresh(at(day + 'T10:00:00')), over);
const finishDay = (S, now) => { for (const g of G.goalsFor(S, now)) G.goalSet(S, g.id, g.max, now); };

test('history records done, failed and rest days', () => {
  const S = state('2026-11-05'); // Thursday
  finishDay(S, at('2026-11-05T12:00:00'));
  assert.equal(S.claimed, true);
  G.rollover(S, at('2026-11-07T09:00:00')); // Thu done, Fri missed
  assert.equal(S.hist['2026-11-05'].s, 'done');
  assert.equal(S.hist['2026-11-06'].s, 'fail');
  const push = S.goals[0];
  assert.deepEqual(S.hist['2026-11-05'].p[push.id], [push.max, push.max]);
  assert.equal(S.tot[push.id], push.max);
});

test('a streak shield absorbs a missed day: no HP loss, no penalty, streak kept', () => {
  const S = state('2026-11-07', { streak: 6, shields: 1 });
  const ui = spy();
  G.rollover(S, at('2026-11-08T09:00:00'), ui);
  assert.equal(S.hp, 100);
  assert.equal(S.penalty, null);
  assert.equal(S.streak, 6);
  assert.equal(S.shields, 0);
  assert.equal(S.hist['2026-11-07'].s, 'shield');
  assert.ok(ui.n.some((o) => o.big === '🛡'));
});

test('one shield for two missed days still leaves a penalty for one', () => {
  const S = state('2026-11-07', { shields: 1 });
  G.rollover(S, at('2026-11-09T09:00:00'));
  assert.equal(S.hp, 100 - G.PENALTY);
  assert.ok(S.penalty);
});

test('buying a shield costs gold and is capped', () => {
  const S = state('2026-11-07', { gold: 1000 });
  assert.equal(G.buyShield(S), true);
  assert.equal(G.buyShield(S), true);
  assert.equal(G.buyShield(S), false);
  assert.equal(S.shields, G.SHIELD_MAX);
  assert.equal(S.gold, 1000 - 2 * G.SHIELD_PRICE);
});

test('stat effects: resilience raises max HP, discipline softens penalties, charisma lowers prices', () => {
  const S = state('2026-11-07');
  S.stats.end = 20; S.stats.dis = 30; S.stats.cha = 20;
  G.applyStats(S);
  assert.equal(S.maxHp, 120); assert.equal(S.hp, 120);
  assert.equal(G.penaltyHp(S, 20), 16);
  assert.equal(G.priceOf(S, 300), 270);
  G.rollover(S, at('2026-11-08T09:00:00'));
  assert.equal(S.hp, 120 - 16);
});

test('stat effects: intellect boosts study quests, agility boosts gold', () => {
  const S = state('2026-11-07');
  S.stats.int = 30; S.stats.agi = 20;
  const q = S.quests[0]; // study, medium: 80 EXP, 25 gold
  G.completeQuest(S, q.id);
  assert.equal(S.gold, Math.round(25 * 1.1));
  assert.equal(S.xp, 96);
});

test('effects are capped', () => {
  const S = state('2026-11-07'); S.stats.dis = 500; S.stats.cha = 500;
  assert.equal(G.effects(S).pen, 50);
  assert.equal(G.effects(S).price, 30);
});

test('dungeon: stages pay small rewards, the boss waits for the others and pays big', () => {
  const S = state('2026-11-07');
  const d = G.addDungeon(S, { t: 'Exam', stages: ['A', 'B', 'Boss'], diff: 'normal', stat: 'int' });
  assert.equal(G.clearStage(S, d.id, 2), 'locked');
  assert.equal(G.clearStage(S, d.id, 0), 'stage');
  assert.equal(G.clearStage(S, d.id, 0), false);
  assert.equal(G.clearStage(S, d.id, 1), 'stage');
  const ui = spy(), int0 = S.stats.int, gold0 = S.gold;
  assert.equal(G.clearStage(S, d.id, 2, ui), 'boss');
  assert.equal(d.done, true);
  assert.equal(S.stats.int, int0 + 2);
  assert.equal(S.gold, gold0 + G.DUNGEON.normal.g + 50 * (S.level - 1)); // plus level-up gold
  assert.equal(S.cnt.dungeons, 1);
});

test('achievements are granted once, pay gold and can become the title', () => {
  const S = state('2026-11-07');
  finishDay(S, at('2026-11-07T12:00:00'));
  const ui = spy(), gold0 = S.gold;
  assert.equal(G.checkAch(S, ui), 1);
  assert.ok(S.ach.first);
  assert.equal(S.gold, gold0 + 20);
  assert.equal(G.checkAch(S, ui), 0);
  assert.equal(G.titleOf(S), G.TITLES[0][1]);
  S.titleSel = 'first';
  assert.equal(G.titleOf(S), G.ACH[0][1]);
  S.titleSel = 'streak100'; // not earned: falls back to the level title
  assert.equal(G.titleOf(S), G.TITLES[0][1]);
});

test('weekly report: rank and gold for the finished week', () => {
  const S = state('2026-11-02'); // Monday
  const ui = spy();
  for (let d = 2; d <= 8; d++) {
    const now = at('2026-11-' + String(d).padStart(2, '0') + 'T12:00:00');
    G.rollover(S, now, ui);
    if (d !== 4) finishDay(S, now); // Wednesday missed
    if (S.penalty) G.clearPenalty(S);
  }
  const gold0 = S.gold;
  G.rollover(S, at('2026-11-09T08:00:00'), ui); // Monday: report for 2–8 Nov
  assert.equal(S.report.wk, '2026-11-02');
  assert.equal(S.report.done, 6); assert.equal(S.report.total, 7);
  assert.equal(S.report.rank, 'A'); // 6 of 7 = 86%
  assert.equal(S.gold, gold0 + 100);
  assert.ok(ui.n.some((o) => /A$/.test(o.big || '')));
});

test('timer-friendly goalSet completes a goal once', () => {
  const S = state('2026-11-07');
  const g = S.goals.find((x) => x.unit.trim());
  assert.equal(G.goalSet(S, g.id, 3), 'step');
  assert.equal(G.goalSet(S, g.id, g.max + 50), 'done');
  assert.equal(S.prog[g.id], g.max);
  assert.equal(G.goalSet(S, g.id, g.max), null);
});

test('old saves get the new fields', () => {
  const S = state('2026-11-07');
  for (const k of ['hist', 'cnt', 'tot', 'ach', 'dungeons', 'shields', 'timer', 'titleSel', 'qd', 'report']) delete S[k];
  const M = G.migrate(S);
  assert.deepEqual(M.hist, {}); assert.equal(M.cnt.days, 0); assert.equal(M.shields, 0); assert.deepEqual(M.dungeons, []);
});
