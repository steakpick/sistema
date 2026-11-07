import test from 'node:test';
import assert from 'node:assert/strict';
import { plan, isPristine } from '../src/sync.js';
import { fresh } from '../src/game.js';

const st = (updated, over = {}) => Object.assign(fresh(), { updated }, over);
const used = (updated) => st(updated, { level: 3, gold: 40, total: 5 });

test('no cloud save yet: upload', () => {
  assert.equal(plan(used(100), null, null), 'push');
});

test('first link on a new phone takes the cloud save', () => {
  assert.equal(plan(st(50), used(100), null), 'pull');
  assert.equal(plan(st(500), used(100), null), 'pull'); // even if the fresh phone looks newer
});

test('first link with progress on both sides asks', () => {
  assert.equal(plan(used(200), used(100), null), 'ask');
});

test('first link with an empty cloud save keeps the phone', () => {
  assert.equal(plan(used(100), st(200), null), 'push');
});

test('only the phone changed since last sync: upload', () => {
  assert.equal(plan(used(300), used(200), 200), 'push');
});

test('only the cloud changed (other device): download', () => {
  assert.equal(plan(used(200), used(300), 200), 'pull');
});

test('both changed: the newest wins', () => {
  assert.equal(plan(used(400), used(300), 200), 'push');
  assert.equal(plan(used(300), used(400), 200), 'pull');
});

test('nothing changed', () => {
  assert.equal(plan(used(200), used(200), 200), 'same');
});

test('pristine means a brand-new player', () => {
  assert.equal(isPristine(fresh()), true);
  assert.equal(isPristine(used(1)), false);
});
