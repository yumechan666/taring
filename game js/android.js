import { createGame } from './game/game.js';
import { createHost, createTweaks, startLoop } from './standalone.js';

async function readJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Data tidak ditemukan: ${path} (${response.status})`);
  return response.json();
}

async function boot() {
  const [manifest, defaults] = await Promise.all([readJson('./assets.json'), readJson('./tweaks.json')]);
  const params = new URLSearchParams(location.search);
  if (params.get('bundled') === 'true') {
    for (const entry of Object.values(manifest)) {
      const filename = entry.src.split('/').pop();
      entry.src = new URL(`../assets/images/${filename}`, location.href).href;
      entry.framesSrc = new URL(`../assets/json/${filename.replace(/\.(webp|png)$/, '.frames.json')}`, location.href).href;
    }
  }
  const skin = Math.max(1, Math.min(10, Number(params.get('skin')) || 1));
  const area = Math.max(0, Math.min(10, Number(params.get('area')) || 0));
  let muted = params.get('muted') === 'true';
  const sdk = createHost();
  const tweaks = createTweaks(defaults);
  const applyMute = () => {
    tweaks.set('musicVolume', muted ? 0 : defaults.musicVolume.value);
    tweaks.set('sfxVolume', muted ? 0 : defaults.sfxVolume.value);
  };
  applyMute();
  const game = createGame({ mount: document.querySelector('#app'), sdk, tweaks, manifest });
  await game.whenReady;
  await game.equipSkin(skin);
  await game.loadLevel(area);
  const run = startLoop(game, window.showGameError);

  const exit = async () => {
    game.meta.bestScore = Math.max(game.meta.bestScore, game.state.score || 0);
    await sdk.gameState.save(game.meta);
    const result = { bestScore: game.meta.bestScore, skin: game.meta.skin, area: game.state.level.area || 0, muted };
    window.taringClose(result);
  };
  const panel = game.hud.el.pause.querySelector('.panel');
  const menuButton = (text, extra = '') => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `menu-btn ${extra}`.trim();
    button.innerHTML = '<span class="control-label"></span>';
    button.firstChild.textContent = text;
    return button;
  };
  const muteButton = menuButton('');
  const labelMute = () => { muteButton.firstChild.textContent = muted ? 'Aktifkan suara' : 'Matikan suara'; };
  labelMute();
  muteButton.onclick = () => { muted = !muted; applyMute(); labelMute(); };
  panel.append(muteButton);
  const exitButton = menuButton('Kembali ke menu utama', 'danger');
  exitButton.onclick = exit;
  panel.append(exitButton);

  window.taringBack = () => {
    if (game.state.paused && !game.state.screen) exit();
    else { game.state.screen = null; game.state.paused = true; }
  };
  window.taringSuspend = () => {
    game.state.paused = true;
    window.dispatchEvent(new Event('blur'));
    sdk.suspendAudio().catch(console.warn);
  };
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) window.taringSuspend();
  });
  document.addEventListener('pointerdown', () => sdk.resumeAudio().catch(console.warn), { passive: true });
  window.addEventListener('pagehide', () => { run.stop(); game.destroy(); });
  // Read-only smoke-test handle is reachable through Android's debug-only WebView inspector.
  window.taringGame = game;
  console.info(`Taring ready: ${Object.keys(manifest).length} assets, skin ${skin}, area ${area}`);
}

boot().catch(window.showGameError);
