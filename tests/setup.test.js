import test from 'node:test';
import assert from 'node:assert/strict';
import { L } from '../src/i18n.js';
import { fresh, applySetup, addPacks, scaleGoal, rollover, PACKS, REWARD_PRESETS, goalsFor } from '../src/game.js';

test('setup builds goals, skills, quests and rewards from the chosen packs', () => {
  const S = applySetup(fresh(), { name: '  Dima ', packs: ['body', 'lang'], mode: 'normal', rewards: [1, 3] });
  assert.equal(S.name, 'Dima');
  assert.deepEqual(S.goals.map((g) => g.t), [L('Отжимания'), L('Приседания'), L('Планка'), L('Английский')]);
  assert.equal(S.skills.length, 1);
  const q = S.quests.find((x) => x.t === L('Выучить 20 новых английских слов'));
  assert.equal(q.skill, S.skills[0].id);
  assert.deepEqual(S.rewards.map((r) => r.price), [150, 300]);
  assert.equal(S.welcomed, true);
  assert.equal(S.log[0].text, L('Система активирована'));
});

test('soft mode halves the load and frees the weekend', () => {
  const S = applySetup(fresh(), { packs: ['body', 'disc'], mode: 'soft' });
  const push = S.goals.find((g) => g.t === L('Отжимания'));
  assert.equal(push.max, 15); assert.equal(push.max % push.step, 0);
  assert.ok(S.goals.every((g) => !g.days.includes(0) && !g.days.includes(6)));
  assert.equal(S.goals.find((g) => g.t === L('Без соцсетей до обеда')).max, 1); // yes/no goals stay 1
  assert.equal(goalsFor(S, new Date('2026-11-08T12:00:00')).length, 0); // Sunday is a rest day
});

test('hard mode raises the load in whole steps', () => {
  assert.deepEqual(scaleGoal(30, 10, 1.5), { max: 50, step: 10 });
  assert.deepEqual(scaleGoal(6000, 2000, 1.5), { max: 10000, step: 2000 });
  assert.deepEqual(scaleGoal(2, 1, 0.5), { max: 1, step: 1 });
  assert.deepEqual(scaleGoal(1, 1, 1.5), { max: 1, step: 1 });
});

test('adding packs later keeps progress and skips goals that already exist', () => {
  const S = fresh(); S.level = 4; S.gold = 90;
  const before = S.goals.length;
  const added = addPacks(S, ['body', 'calm']);
  assert.equal(added, 3); // push-ups and squats already exist; plank, meditation, journal are new
  assert.equal(S.goals.length, before + 3);
  assert.equal(S.level, 4); assert.equal(S.gold, 90);
  assert.equal(addPacks(S, ['body', 'calm']), 0);
});

test('every pack and reward preset is well formed', () => {
  for (const p of PACKS) for (const g of p.goals) assert.ok(g[1] >= g[2] && g[2] >= 1, p.id + ' ' + g[0]);
  assert.ok(REWARD_PRESETS.every(([t, price]) => t && price > 0));
});

test('the setup day is a trial: no penalty for leaving it unfinished', () => {
  const S = applySetup(fresh(new Date('2026-11-07T20:00:00')), { packs: ['body'] });
  rollover(S, new Date('2026-11-08T09:00:00'));
  assert.equal(S.penalty, null);
  assert.equal(S.hp, 100);
  // the next day counts as usual
  rollover(S, new Date('2026-11-09T09:00:00'));
  assert.ok(S.penalty);
});
