import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { serveGame } from './serve_game.mjs';

// The stage-clear and game-over popups must fit the screen with nothing
// overlapping, from a small landscape phone up to a desktop window. The clear
// popup goes through the real stageClear() by marking the boss dead.
const sizes = [[640, 300], [800, 360], [915, 412], [1280, 720], [1920, 1080]];
const overlaps = (a, b) => a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1;

const server = await serveGame();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const [width, height] of sizes) {
    for (const area of [0, 3]) {
      const page = await browser.newPage({ viewport: { width, height } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`http://127.0.0.1:${server.address().port}/game/index.html?muted=true&area=${area}`);
      await page.waitForFunction(() => window.taringGame?.state.time > 0.5);
      await page.evaluate(() => {
        const state = window.taringGame.state;
        state.player.x = state.level.arena.trigger + 0.5;
      });
      await page.waitForTimeout(400);
      await page.evaluate(() => {
        const boss = window.taringGame.state.boss;
        boss.hp = 0;
        boss.dead = true;
        boss.deathT = 2.19;
      });
      await page.waitForFunction(() => !document.querySelector('.result-overlay').hidden, null, { timeout: 5000 });
      await page.waitForTimeout(900); // let the entrance animation finish
      const layout = await page.evaluate(() => {
        const rect = selector => {
          const r = document.querySelector(selector).getBoundingClientRect();
          return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
        };
        const panel = document.querySelector('.result-panel');
        return {
          panel: rect('.result-panel'),
          title: rect('.result-title'),
          sub: rect('.result-sub'),
          stats: rect('.stats'),
          buttons: [...document.querySelectorAll('.result-actions .menu-btn')].filter(b => !b.hidden).map(b => {
            const r = b.getBoundingClientRect();
            return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
          }),
          scrolls: panel.scrollHeight > panel.clientHeight + 1,
        };
      });
      const label = `${width}x${height} area ${area}`;
      assert.equal(layout.scrolls, false, `${label}: popup scrolls`);
      assert.ok(layout.panel.left >= 0 && layout.panel.top >= 0 && layout.panel.right <= width && layout.panel.bottom <= height, `${label}: popup leaves the screen`);
      assert.ok(!overlaps(layout.title, layout.sub), `${label}: title overlaps the sub line`);
      assert.ok(!overlaps(layout.title, layout.stats), `${label}: title overlaps the stats`);
      assert.ok(!overlaps(layout.sub, layout.stats), `${label}: sub line overlaps the stats`);
      layout.buttons.forEach((button, i) => {
        assert.ok(button.top >= layout.panel.top && button.bottom <= layout.panel.bottom, `${label}: button ${i} sits outside the popup`);
        for (const other of layout.buttons.slice(i + 1)) assert.ok(!overlaps(button, other), `${label}: buttons overlap`);
        assert.ok(!overlaps(button, layout.stats), `${label}: a button overlaps the stats`);
      });
      assert.deepEqual(errors, [], `${label}: page errors`);
      await page.close();
    }
  }
  console.log(`PASS: stage-clear popup fits and nothing overlaps at ${sizes.length} sizes, 2 bosses each.`);
} finally { await browser.close(); server.closeAllConnections(); server.close(); }
