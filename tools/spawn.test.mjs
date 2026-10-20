import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStage1, buildEndless } from '../game js/game/stage.js';
import { buildArea, AREAS } from '../game js/game/areas.js';
import { makeEnemy, settleEnemy } from '../game js/game/enemies.js';
import { boxHitsSolid, tileAt } from '../game js/game/world.js';

const floorTiles = new Set([1, 2, 3, 4, 5]);

// Every ground enemy must start clear of solid tiles and standing on a surface,
// in every level, including the generated endless ones.
function problems(name, level) {
  const found = [];
  for (const spec of level.enemies) {
    const e = settleEnemy(level, makeEnemy(spec, 'x', 1));
    if (e.fly) continue;
    const at = `${name} ${spec.type}@${spec.x},${spec.y}`;
    if (boxHitsSolid(level, e.x, e.y, e.w, e.h)) found.push(`${at} starts inside solid tiles`);
    const x0 = Math.floor(e.x - e.w / 2 + 0.01);
    const x1 = Math.floor(e.x + e.w / 2 - 0.01);
    let supported = false;
    for (let tx = x0; tx <= x1; tx++) if (floorTiles.has(tileAt(level, tx, Math.floor(e.y + 0.05)))) supported = true;
    if (!supported) found.push(`${at} has no floor under it`);
  }
  return found;
}

test('ground enemies spawn on a surface in every story level', () => {
  const found = [...problems('stage1', buildStage1())];
  for (let area = 1; area < AREAS.length; area++) found.push(...problems(`area ${area}`, buildArea(area)));
  assert.deepEqual(found, []);
});

test('ground enemies spawn on a surface in generated endless levels', () => {
  const found = [];
  for (const seed of [1, 2, 3, 7, 42, 99, 1234, 5555]) found.push(...problems(`endless ${seed}`, buildEndless(seed)));
  assert.deepEqual(found, []);
});
