import assert from 'node:assert/strict';
import { chromium } from 'playwright';

// Forward the debug WebView socket to this port after opening Mulai Perjalanan:
// adb -s SERIAL forward tcp:9223 localabstract:webview_devtools_remote_PID
const browser = await chromium.connectOverCDP(process.argv[2] || 'http://127.0.0.1:9223');
const page = browser.contexts().flatMap(context => context.pages()).find(page => page.url().includes('/game/index.html'));
assert.ok(page, 'Open the game in the debug APK before running this test.');
await page.waitForFunction(() => window.taringGame, { timeout: 60000 });
assert.equal(await page.locator('#startup-error').isVisible(), false);
const session = await page.context().newCDPSession(page);
const point = async action => {
  const box = await page.locator(`[data-act="${action}"]`).boundingBox();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};
// Joystick position: dx/dy in -1..1 across the base.
const stickAt = async (dx, dy) => {
  const box = await page.locator('.stick').boundingBox();
  return { x: box.x + box.width * (0.5 + dx * 0.4), y: box.y + box.height * (0.5 + dy * 0.4) };
};
const touch = (type, points) => session.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p, id) => ({ ...p, id })) });
const tap = async action => { await touch('touchStart', [await point(action)]); await touch('touchEnd', []); };
await page.evaluate(() => window.taringGame.loadLevel(0));
await page.waitForFunction(() => window.taringGame.state.player.onGround);
const x = await page.evaluate(() => window.taringGame.state.player.x);
const right = await stickAt(1, 0);
await touch('touchStart', [right]);
await page.waitForFunction(x => window.taringGame.state.player.x > x + 1, x);
await touch('touchStart', [right, await point('jump')]);
await page.waitForFunction(() => !window.taringGame.state.player.onGround);
await touch('touchEnd', []);
await page.waitForFunction(() => window.taringGame.state.player.onGround);
await tap('transform');
await page.waitForFunction(() => window.taringGame.state.player.form === 'wolf' && !window.taringGame.state.player.act);
await touch('touchStart', [await stickAt(0, 1)]);
await page.waitForFunction(() => window.taringGame.state.player.anim === 'wolf.crawl');
await touch('touchEnd', []);
await tap('attack');
await page.waitForFunction(() => window.taringGame.state.player.anim === 'wolf.claw');
await page.screenshot({ path: 'build/android-gameplay.png' });
await page.evaluate(() => { window.taringGame.togglePause(); window.taringGame.openWardrobe(); });
const nextSkin = await page.evaluate(() => window.taringGame.meta.skin % 10 + 1);
await page.locator('[data-menu="skin-next"]').click();
await page.locator('[data-menu="skin-equip"]').click();
await page.waitForFunction(id => window.taringGame.state.skinId === id, nextSkin);
await page.locator('.wardrobe-overlay [data-menu="close"]').click();
await page.locator('[data-menu="resume"]').click();
await page.evaluate(() => window.taringGame.fillUlti());
await tap('ulti');
await page.waitForFunction(() => window.taringGame.state.player.form === 'eclipse');
assert.equal(await page.locator('#startup-error').isVisible(), false);
await page.screenshot({ path: 'build/android-eclipse.png' });
console.log('PASS: Android APK loads bundled assets; real touch movement, simultaneous jump, transform, crawl, attack, wardrobe and Eclipse work.');
await session.detach();
// Disconnect the inspector without closing the Android app.
await browser.close();
