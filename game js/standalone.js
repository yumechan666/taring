// The small host contract used by the original modules. All gameplay stays in game/.
export function createTweaks(manifest) {
  const values = Object.fromEntries(Object.entries(manifest).map(([key, entry]) => [key, entry.value]));
  const listeners = new Map();
  return {
    get: key => values[key],
    set(key, value) {
      values[key] = value;
      for (const listener of listeners.get(key) || []) listener(value);
    },
    subscribe(key, listener) {
      if (!listeners.has(key)) listeners.set(key, new Set());
      listeners.get(key).add(listener);
      return () => listeners.get(key).delete(listener);
    },
  };
}

export function createHost(bridge = window.TaringNative) {
  let context;
  return {
    gameState: {
      async load() {
        try {
          return JSON.parse(bridge ? bridge.loadState() : localStorage.getItem('taring_game'));
        } catch { return null; }
      },
      async save(state) {
        const json = JSON.stringify(state);
        if (bridge) bridge.saveState(json);
        else localStorage.setItem('taring_game', json);
      },
    },
    audio: {
      async getContext() {
        context ||= new (window.AudioContext || window.webkitAudioContext)();
        return { context, unlock: () => context.resume() };
      },
    },
    // Online leaderboard belongs to the original hosting service; local records
    // are saved by gameState. Android play does not submit data to a remote host.
    leaderboard: { submit: async () => {} },
    device: { haptics: {
      isSupported: () => typeof navigator.vibrate === 'function',
      vibrate: async ms => { navigator.vibrate?.(ms); },
    } },
    async suspendAudio() { if (context?.state === 'running') await context.suspend(); },
    async resumeAudio() { if (context?.state === 'suspended') await context.resume(); },
  };
}

export function startLoop(game, onError) {
  let previous = null;
  let frame;
  let stopped = false;
  const step = 1 / 60;
  let accumulated = 0;
  let stillDrawn = false;
  const resetClock = () => { previous = null; accumulated = 0; };
  const run = {
    frozen: false,
    restart() { game.hooks.init(game.state); resetClock(); },
    stop() {
      stopped = true;
      cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', resetClock);
    },
  };
  game.attachRun(run);
  run.restart();
  document.addEventListener('visibilitychange', resetClock);
  const tick = now => {
    if (stopped) return;
    try {
      // Catch up slow display frames in small physics steps; cap long stalls.
      const dt = previous === null ? 0 : Math.max(0, Math.min((now - previous) / 1000, 0.25));
      previous = now;
      if (!document.hidden) {
        if (!run.frozen && !game.state.paused && !game.state.screen && !game.state.loading) {
          // Split each display frame into equal steps of at most 1/60 s. A fixed
          // 1/60 accumulator alternates 0 and 2 updates per frame on 90/120 Hz
          // screens and on jittery 60 Hz frames, which shows as micro-stutter.
          accumulated += dt;
          const n = Math.ceil(accumulated / step - 1e-6);
          if (n > 0) {
            const sub = Math.min(step, accumulated / n);
            for (let i = 0; i < n; i++) game.hooks.update(game.state, sub);
            accumulated = Math.max(0, accumulated - sub * n);
          }
        } else accumulated = 0;
        // Paint the frozen world once when a pause or menu opens, then refresh
        // only the HUD until play resumes or the view is resized.
        const still = Boolean(game.state.paused || game.state.screen) && !game.state.loading && game.renderHud;
        const dirty = game.renderer?.consumeDirty?.() ?? true;
        if (still && stillDrawn && !dirty) game.renderHud(game.state);
        else game.hooks.render(game.state);
        stillDrawn = Boolean(still);
      } else resetClock();
      frame = requestAnimationFrame(tick);
    } catch (error) { run.stop(); onError(error); }
  };
  frame = requestAnimationFrame(tick);
  return run;
}
