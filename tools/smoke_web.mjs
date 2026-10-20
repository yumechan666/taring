import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { serveFlutter } from './serve_game.mjs';

const server = await serveFlutter();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.addInitScript(() => localStorage.setItem('flutter.sabit_taring_malam_save', JSON.stringify(JSON.stringify({ tutorialSeen: true, skin: 2, theme: 4, muted: true }))));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.locator('flt-semantics-placeholder').waitFor({ state: 'attached', timeout: 90000 });
  await page.locator('flt-semantics-placeholder').evaluate(element => element.click());
  await page.getByRole('button', { name: 'Mulai Perjalanan' }).click();
  // The tutorial opens before every run; skipping it starts the game.
  await page.getByRole('button', { name: 'Lewati' }).click();
  await page.waitForSelector('iframe');
  const frame = page.frames().find(frame => frame.url().includes('index.html?'));
  assert.ok(frame, 'Original game iframe did not open');
  console.log('Game frame:', frame.url());
  await frame.waitForSelector('#startup-error', { state: 'attached' });
  await frame.waitForFunction(() => window.taringGame || !document.querySelector('#startup-error').hidden);
  assert.equal(await frame.locator('#startup-error').isVisible(), false, await frame.locator('#error-detail').textContent());
  assert.equal(await frame.evaluate(() => window.taringGame.state.skinId), 3);
  assert.equal(await frame.evaluate(() => window.taringGame.state.level.area), 3);
  // Tilt the joystick to its right edge, then let go.
  const edge = await frame.evaluate(() => {
    const r = document.querySelector('.stick').getBoundingClientRect();
    return { clientX: r.left + r.width * 0.9, clientY: r.top + r.height / 2 };
  });
  await frame.locator('.stick').dispatchEvent('pointerdown', { pointerId: 1, ...edge });
  const x = await frame.evaluate(() => window.taringGame.state.player.x);
  await frame.waitForFunction(x => window.taringGame.state.player.x > x + 1, x);
  await frame.locator('.stick').dispatchEvent('pointerup', { pointerId: 1, ...edge });
  await frame.evaluate(() => { window.taringGame.state.score = 123; window.taringGame.togglePause(); });
  await frame.getByRole('button', { name: 'Kembali ke menu utama' }).click();
  await page.getByText('Skor terbaik: 123').waitFor();
  assert.equal(await page.locator('iframe').count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS: built Flutter web opens original game, resolves encoded bundle assets, moves and saves score on exit.');
} finally { await browser.close(); server.closeAllConnections(); server.close(); }
