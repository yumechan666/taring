import test from 'node:test';
import assert from 'node:assert/strict';
import { startLoop } from '../game js/standalone.js';
import { createInput } from '../game js/game/input.js';
import { createArt } from '../game js/game/assets.js';

test('simulation advances one second at 15, 30, 60 and 120 display FPS', () => {
  globalThis.document = new EventTarget();
  document.hidden = false;
  let callback;
  globalThis.requestAnimationFrame = fn => { callback = fn; return 1; };
  globalThis.cancelAnimationFrame = () => {};
  for (const fps of [15, 30, 60, 120]) {
    let elapsed = 0;
    const game = { state: {}, attachRun() {}, hooks: {
      init() {}, render() {}, update(_, dt) { assert.ok(dt <= 1 / 60); elapsed += dt; },
    } };
    const run = startLoop(game, error => { throw error; });
    callback(0);
    for (let i = 1; i <= fps; i++) callback(i * 1000 / fps);
    assert.ok(Math.abs(elapsed - 1) < 1e-6, `${fps} FPS advanced ${elapsed}s`);
    document.hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    callback(100000);
    document.hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    callback(200000);
    assert.ok(Math.abs(elapsed - 1) < 1e-6, 'resume must not simulate background time');
    run.stop();
  }
});

test('held aliases, touch and pause do not lose movement or queue stale attacks', () => {
  globalThis.window = new EventTarget();
  const root = new EventTarget();
  root.contains = () => true;
  const state = { input: {}, inputEvents: [], player: { skillHold: 1, aim: {} }, slowmo: true };
  const input = createInput({ root, getState: () => state, onPause() {} });
  const key = (type, code) => { const e = new Event(type); Object.assign(e, { code }); window.dispatchEvent(e); };
  key('keydown', 'ArrowRight');
  key('keydown', 'KeyD');
  key('keyup', 'ArrowRight');
  assert.equal(state.input.right, true);
  key('keyup', 'KeyD');
  assert.equal(state.input.right, false);
  key('keydown', 'ArrowUp');
  key('keydown', 'Space');
  key('keyup', 'Space');
  assert.equal(state.input.jump, true);
  input.reset();
  assert.equal(state.input.jump, false);
  assert.equal(state.player.skillHold, 0);
  assert.equal(state.player.aim, null);
  assert.equal(state.slowmo, false);
  state.paused = true;
  key('keydown', 'KeyJ');
  assert.deepEqual(state.inputEvents, []);
  key('keyup', 'KeyJ');
  state.paused = false;
  const btn = { dataset: { act: 'right' }, classList: { add() {}, remove() {} } };
  root.closest = () => btn;
  const pointer = (type, id) => { const e = new Event(type); e.pointerId = id; root.dispatchEvent(e); };
  pointer('pointerdown', 1);
  pointer('pointerdown', 2);
  pointer('pointerup', 1);
  assert.equal(state.input.right, true);
  pointer('pointercancel', 2);
  assert.equal(state.input.right, false);
  input.destroy();
});

test('asset loads are atomic, validate animation references and can retry', async () => {
  const originalFetch = globalThis.fetch;
  const originalImage = globalThis.Image;
  let valid = false;
  const frame = { name: 'idle_1', source: { x: 0, y: 0, w: 10, h: 10 } };
  globalThis.Image = class { set src(value) { queueMicrotask(() => this.onload()); } };
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ frames: [frame], animations: [{ name: 'idle', frames: [valid ? 'idle_1' : 'missing'] }] }) });
  try {
    const art = createArt(null, { HERO_HUMAN_MOVE: { src: '/hero.webp' } });
    await assert.rejects(art.ensure(['HERO_HUMAN_MOVE']), /invalid animation/);
    assert.equal(art.has(['HERO_HUMAN_MOVE']), false);
    assert.equal(art.images.HERO_HUMAN_MOVE, undefined);
    valid = true;
    await art.ensure(['HERO_HUMAN_MOVE']);
    assert.equal(art.has(['HERO_HUMAN_MOVE']), true);
    assert.equal(art.frames.HERO_HUMAN_MOVE.anims.idle[0].name, 'idle_1');
    art.retain([]);
    assert.equal(art.has(['HERO_HUMAN_MOVE']), false);
    await art.ensure(['HERO_HUMAN_MOVE']);
    assert.equal(art.has(['HERO_HUMAN_MOVE']), true);
  } finally { globalThis.fetch = originalFetch; globalThis.Image = originalImage; }
});

test('joystick holds left/right and down independently and releases cleanly', () => {
  globalThis.window = new EventTarget();
  const stickEl = {
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    classList: { add() {}, remove() {} },
    style: { setProperty() {}, removeProperty() {} },
    dataset: {},
    setPointerCapture() {},
  };
  const root = new EventTarget();
  root.contains = () => true;
  root.closest = undefined;
  const state = { input: {}, inputEvents: [], player: { skillHold: 0, aim: null }, slowmo: false };
  const input = createInput({ root, getState: () => state, onPause() {} });
  const pointer = (type, id, x, y) => {
    const e = new Event(type);
    Object.assign(e, { pointerId: id, clientX: x, clientY: y });
    Object.defineProperty(e, 'target', { value: { closest: sel => (sel === '[data-act]' ? null : sel === '.stick' ? stickEl : null) } });
    root.dispatchEvent(e);
  };
  // Right of centre registers right; back at centre releases it.
  pointer('pointerdown', 1, 90, 50);
  assert.equal(state.input.right, true);
  assert.notEqual(state.input.left, true);
  pointer('pointermove', 1, 50, 50);
  assert.equal(state.input.right, false);
  // Sliding straight across switches direction without lifting.
  pointer('pointermove', 1, 10, 50);
  assert.equal(state.input.left, true);
  pointer('pointermove', 1, 90, 50);
  assert.equal(state.input.left, false);
  assert.equal(state.input.right, true);
  // Down is its own axis: crawl while holding a direction.
  pointer('pointermove', 1, 90, 90);
  assert.equal(state.input.right, true);
  assert.equal(state.input.down, true);
  // A second finger on the stick is ignored while the first holds it.
  pointer('pointerdown', 2, 10, 50);
  assert.equal(state.input.left, false);
  pointer('pointerup', 1, 90, 90);
  assert.equal(state.input.right, false);
  assert.equal(state.input.down, false);
  // Releasing the stick must not cancel a key that is still held.
  const key = (type, code) => { const e = new Event(type); Object.assign(e, { code }); window.dispatchEvent(e); };
  key('keydown', 'ArrowRight');
  pointer('pointerdown', 3, 90, 50);
  pointer('pointerup', 3, 90, 50);
  assert.equal(state.input.right, true);
  key('keyup', 'ArrowRight');
  assert.equal(state.input.right, false);
  // reset() (pause, focus loss) lets go of the stick.
  pointer('pointerdown', 4, 10, 50);
  assert.equal(state.input.left, true);
  input.reset();
  assert.equal(state.input.left, false);
  pointer('pointerup', 4, 10, 50);
  assert.equal(state.input.left, false);
  input.destroy();
});
