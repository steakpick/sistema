// Run with: npm test   (sets TZ so date logic is checked across a DST change)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../src/game.js';

const at = (iso) => new Date(iso);            // local time, TZ from npm script
const spy = () => { const n = []; return { n, notify: (o) => n.push(o), float() {} }; };
function state(day, over = {}) {
  const S = G.fresh(at(day + 'T10:00:00'));
  return Object.assign(S, over);
}

test('same day: nothing changes', () => {
  const S = state('2026-11-07');
  assert.equal(G.rollover(S, at('2026-11-07T23:59:00')), false);
  assert.equal(S.hp, 100);
});

test('completed day: next day heals and keeps the streak', () => {
  const S = state('2026-11-07', { claimed: true, streak: 3, hp: 70 });
  assert.equal(G.rollover(S, at('2026-11-08T00:00:01')), true);
  assert.equal(S.day, '2026-11-08');
  assert.equal(S.hp, 80);
  assert.equal(S.streak, 3);
  assert.equal(S.penalty, null);
});

test('missed day: −20 HP, streak reset, penalty zone', () => {
  const S = state('2026-11-07', { streak: 5 });
  const ui = spy();
  G.rollover(S, at('2026-11-08T08:00:00'), ui, () => 0);
  assert.equal(S.hp, 80);
  assert.equal(S.streak, 0);
  assert.equal(S.penalty.t, G.PEN_TASKS[0]);
  assert.ok(ui.n.some((o) => o.alert));
});

test('three days away counts every missed day', () => {
  const S = state('2026-11-07'); // all goals but English run every day
  G.rollover(S, at('2026-11-10T09:00:00'));
  assert.equal(S.hp, 100 - 3 * G.PENALTY);
});

test('days without goals are not penalised', () => {
  const S = state('2026-11-07', { claimed: true });
  S.goals.forEach((g) => { g.days = [1]; });   // Mondays only
  G.rollover(S, at('2026-11-09T09:00:00'));     // Sat → Mon, Sunday had no goals
  assert.equal(S.hp, 100);
  assert.equal(S.penalty, null);
});

test('long absence is capped', () => {
  const S = state('2026-10-01');
  G.rollover(S, at('2026-11-07T09:00:00'));
  assert.equal(G.missedDays(state('2026-10-01'), at('2026-11-07T09:00:00')), G.MAX_MISSED);
  assert.equal(S.hp, 50); // fell to 0 or below, then restored to half
  assert.equal(S.xp, 0);
});

test('unfinished penalty costs 30 HP more the next day', () => {
  const S = state('2026-11-07', { claimed: true, penalty: { t: 'x' } });
  G.rollover(S, at('2026-11-08T09:00:00'));
  assert.equal(S.hp, 70);
  assert.equal(S.penalty, null);
});

test('HP at zero loses the level EXP and restores half HP', () => {
  const S = state('2026-11-07', { hp: 15, xp: 77 });
  G.rollover(S, at('2026-11-08T09:00:00'));
  assert.equal(S.xp, 0);
  assert.equal(S.hp, 50);
});

test('daylight saving change does not double count (Europe/Chisinau, 25 Oct 2026)', () => {
  const S = state('2026-10-24', { claimed: true });
  G.rollover(S, at('2026-10-26T09:00:00')); // only 25 Oct missed
  assert.equal(S.hp, 80);
});

test('clock moved backwards: no penalty', () => {
  const S = state('2026-11-07');
  G.rollover(S, at('2026-11-05T09:00:00'));
  assert.equal(S.hp, 100);
  assert.equal(S.day, '2026-11-05');
});

test('finishing every goal of the day pays the daily reward once', () => {
  const now = at('2026-11-07T12:00:00'); // Saturday: English goal is weekdays only
  const S = state('2026-11-07');
  const tg = G.goalsFor(S, now);
  assert.equal(tg.length, 3);
  for (const g of tg) while ((S.prog[g.id] || 0) < g.max) G.goalPlus(S, g.id, now);
  assert.equal(S.claimed, true);
  assert.equal(S.streak, 1);
  const gold = S.gold;
  assert.equal(G.checkDaily(S, now), false);
  assert.equal(S.gold, gold);
});

test('rewards are blocked in the penalty zone', () => {
  const S = state('2026-11-07', { penalty: { t: 'x' } });
  const q = S.quests[0];
  G.completeQuest(S, q.id);
  assert.equal(S.xp, 0);
  assert.equal(S.gold, 0);
  assert.equal(q.done, true);
});

test('big EXP gains level up several times', () => {
  const S = state('2026-11-07');
  G.gainXp(S, 100 + 150 + 10);
  assert.equal(S.level, 3);
  assert.equal(S.xp, 10);
  assert.equal(S.points, 6);
});

test('buying needs enough gold', () => {
  const S = state('2026-11-07', { gold: 100 });
  const r = S.rewards[0]; // costs 150
  assert.equal(G.buy(S, r.id), false);
  S.gold = 200;
  assert.equal(G.buy(S, r.id), true);
  assert.equal(S.gold, 50);
});

test('migrate rejects junk and fills new fields', () => {
  assert.equal(G.migrate(null), null);
  assert.equal(G.migrate({ v: 1 }), null);
  const old = state('2026-11-07');
  delete old.gold; delete old.rewards; old.goals.forEach((g) => delete g.days);
  const m = G.migrate(old);
  assert.equal(m.gold, 0);
  assert.ok(m.rewards.length);
  assert.deepEqual(m.goals[0].days, G.ALL_DAYS);
});
