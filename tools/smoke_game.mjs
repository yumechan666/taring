import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { serveGame } from './serve_game.mjs';

const server = await serveGame();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  await page.goto(`http://127.0.0.1:${server.address().port}/game/index.html?muted=true`);
  await page.waitForFunction(() => window.taringGame || !document.querySelector('#startup-error').hidden);
  assert.equal(await page.locator('#startup-error').isVisible(), false, await page.locator('#error-detail').textContent());
  await page.waitForFunction(() => window.taringGame.state.time > 0.25);
  const start = await page.evaluate(() => window.taringGame.state.player.x);
  await page.keyboard.down('ArrowRight');
  await page.waitForFunction(start => window.taringGame.state.player.x > start + 1, start);
  await page.keyboard.up('ArrowRight');
  const moved = await page.evaluate(() => ({ x: window.taringGame.state.player.x, anim: window.taringGame.state.player.anim }));
  assert.ok(moved.x > start + 1, JSON.stringify(moved));
  await page.keyboard.down('Space');
  await page.waitForFunction(() => !window.taringGame.state.player.onGround);
  await page.keyboard.up('Space');
  assert.equal(await page.evaluate(() => window.taringGame.state.player.onGround), false);
  await page.waitForFunction(() => window.taringGame.state.player.onGround);
  await page.keyboard.press('l');
  await page.waitForFunction(() => window.taringGame.state.player.form === 'wolf' && !window.taringGame.state.player.act);
  assert.equal(await page.evaluate(() => window.taringGame.state.player.form), 'wolf');
  await page.keyboard.press('j');
  await page.waitForFunction(() => window.taringGame.state.player.anim === 'wolf.claw');
  assert.equal(await page.evaluate(() => window.taringGame.state.player.anim), 'wolf.claw');
  await page.screenshot({ path: 'build/game-smoke.png' });
  console.log('PASS: original game boots, moves, jumps, transforms and attacks.');
  // Inspect actual drawImage calls, not just whether image downloads succeeded.
  await page.evaluate(() => {
    const original = CanvasRenderingContext2D.prototype.drawImage;
    window.drawnSprites = [];
    CanvasRenderingContext2D.prototype.drawImage = function(img, ...args) {
      if (this.canvas.classList.contains('game-canvas')) window.drawnSprites.push({ src: img.src, args });
      return original.call(this, img, ...args);
    };
    window.taringGame.state.paused = true;
  });
  for (let id = 1; id <= 10; id++) {
    await page.evaluate(id => window.taringGame.equipSkin(id), id);
    assert.equal(await page.evaluate(() => window.taringGame.state.skinId), id);
    const missing = await page.evaluate(async id => {
      const game = window.taringGame;
      const roles = { HUMAN_MOVE: ['idle', 'run', 'jump', 'fall'], HUMAN_COMBAT: ['slash1', 'slash2', 'slash3', 'hook'], HUMAN_ACTION: ['deflect', 'hang', 'hurt', 'transform'], WOLF_MOVE: ['idle', 'run', 'jump', 'pounce'], WOLF_COMBAT: ['claw', 'bite', 'slam', 'crawl'], WOLF_ACTION: ['sniff', 'howl', 'hurt'], ECLIPSE: ['idle', 'run', 'claw', 'slam'] };
      const missing = [];
      for (const [role, rows] of Object.entries(roles)) {
        const file = `${id === 1 ? 'hero' : `skin${id}`}_${role.toLowerCase()}-transparent.webp`;
        const data = await (await fetch(`/generated-assets/${file.replace('.webp', '.frames.json')}`)).json();
        for (const row of rows) {
          const form = role.startsWith('HUMAN') ? 'human' : role.startsWith('WOLF') ? 'wolf' : 'eclipse';
          const frames = data.animations.find(a => a.name === row).frames;
          for (const progress of [0, 0.99]) {
            const expected = frames[progress === 0 ? 0 : frames.length - 1].content;
            Object.assign(game.state.player, { anim: `${form}.${row}`, animProg: progress });
            window.drawnSprites = [];
            game.hooks.render(game.state);
            if (!window.drawnSprites.some(draw => draw.src?.endsWith(file) && draw.args[0] === expected.x && draw.args[1] === expected.y)) missing.push(`${id}/${form}.${row}/${progress}`);
          }
        }
      }
      return missing;
    }, id);
    assert.deepEqual(missing, [], 'Player animation did not draw the requested skin/frame');
  }
  console.log('PASS: first and last frames of every player animation draw for all 10 skins.');
  for (let area = 0; area <= 10; area++) {
    await page.evaluate(area => window.taringGame.loadLevel(area), area);
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => window.taringGame.state.level.area || 0), area);
    assert.equal(await page.locator('#startup-error').isVisible(), false);
  }
  await page.evaluate(async () => {
    const g = window.taringGame;
    await g.loadLevel(0);
    const s = g.state;
    const shard = s.level.shards[0];
    s.player.x = shard.x; s.player.y = shard.y;
    g.hooks.update(s, 1 / 60);
    if (!shard.taken || s.stats.shards !== 1 || s.score < 50) throw new Error('Moon shard pickup failed');
    s.player.ulti = 0;
    s.orbs.push({ x: s.player.x, y: s.player.y - s.player.h * 0.5, t: 0, vx: 0, vy: 0 });
    g.hooks.update(s, 0);
    if (s.orbs.length || s.player.ulti <= 0) throw new Error('Overlapping orb pickup failed');
    g.fillUlti();
    s.inputEvents.push('ulti');
    g.hooks.update(s, 1 / 60);
    if (s.player.form !== 'eclipse') throw new Error('Eclipse ulti failed');
  });
  assert.deepEqual(errors, []);
  console.log('PASS: all 10 skins and 11 areas load and render without runtime errors.');
} finally {
  await browser.close();
  server.closeAllConnections();
  server.close();
}
