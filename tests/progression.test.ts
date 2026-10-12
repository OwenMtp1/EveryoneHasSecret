import { test } from 'node:test';
import assert from 'node:assert/strict';
import { progression, xpForGame } from '../src/shared/progression';

test('progression : niveaux croissants, titres, XP par nuit et par victoire', () => {
  assert.equal(progression(0, 0).level, 1);
  assert.equal(progression(0, 0).title, 'Invité·e de passage');
  assert.equal(xpForGame(false), 100);
  assert.equal(xpForGame(true), 250);
  let prev = 0;
  for (let n = 0; n <= 60; n += 5) {
    const p = progression(n, Math.floor(n / 2));
    assert.ok(p.level >= prev, 'le niveau ne baisse jamais');
    assert.ok(p.progress >= 0 && p.progress < 1);
    prev = p.level;
  }
  assert.equal(progression(40, 20).title, 'Inspecteur·rice');
});
