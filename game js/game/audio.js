// Sound effects and music are mp3 files in assets/audio/, named after the
// event that plays them (sfx("jump") -> jump.mp3, setTrack("bgm_stage") ->
// bgm_stage.mp3). Short sound effects are fetched and decoded once, up front.
// Music is streamed through an <audio> element, so long tracks never sit in
// memory as decoded PCM. Both feed the same Web Audio graph but run on their
// own paths, so an effect never stops the music. A missing file is silent, and
// nothing plays until the context is unlocked by the first tap or key press.

export const SFX = [
  "jump", "land", "attack", "hit", "hurt", "death", "slam", "hook", "grab", "snap",
  "thread", "arrow", "transform", "howl", "pounce", "ulti", "spirit", "deflect",
  "break", "lever", "pickup", "orb", "checkpoint", "win", "growl", "caw", "buzz",
  "ready", "tick", "enemy_die", "gate", "combo", "low_hp", "ulti_ready", "footstep",
];
export const MUSIC = ["bgm_stage", "bgm_boss", "bgm_endless", "bgm_victory", "bgm_defeat"];

// The page sits in a folder next to the Flutter asset folder on both hosts:
// Android serves /game/index.html and /assets/audio/, web serves
// assets/game%20js/index.html and assets/assets/audio/. Both resolve from the page.
const AUDIO_DIR = () => new URL("../assets/audio/", document.baseURI);

export function createAudio({ sdk, tweaks, surface }) {
  let audio = null;
  let ctx = null;
  let master = null;
  let musicGain = null;
  let sfxGain = null;
  // Effect name -> Promise<AudioBuffer | null>. Null means the file is missing or unreadable.
  const buffers = new Map();
  let wantTrack = null;
  let current = null; // { name, el, source, gain }
  let paused = false;
  let unlocked = false;
  const unsubs = [];

  const applyVolumes = () => {
    if (!musicGain) return;
    musicGain.gain.value = Number(tweaks.get("musicVolume"));
    sfxGain.gain.value = Number(tweaks.get("sfxVolume"));
  };
  unsubs.push(tweaks.subscribe("musicVolume", applyVolumes), tweaks.subscribe("sfxVolume", applyVolumes));

  sdk.audio
    .getContext()
    .then((a) => {
      audio = a;
      ctx = a.context;
      master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(ctx.destination);
      musicGain = ctx.createGain();
      sfxGain = ctx.createGain();
      musicGain.connect(master);
      sfxGain.connect(master);
      applyVolumes();
      for (const name of SFX) load(name);
    })
    .catch(() => {});

  function load(name) {
    if (!buffers.has(name)) {
      const decoded = fetch(new URL(`${name}.mp3`, AUDIO_DIR()))
        .then((response) => (response.ok ? response.arrayBuffer() : null))
        .then((data) => (data && data.byteLength ? ctx.decodeAudioData(data) : null))
        .catch(() => null);
      buffers.set(name, decoded);
    }
    return buffers.get(name);
  }

  const unlock = () => {
    if (!audio || unlocked) return;
    audio
      .unlock()
      .then(() => {
        unlocked = true;
        surface.removeEventListener("pointerdown", unlock, true);
        window.removeEventListener("keydown", unlock, true);
        syncMusic();
      })
      .catch(() => {});
  };
  surface.addEventListener("pointerdown", unlock, true);
  window.addEventListener("keydown", unlock, true);

  const running = () => ctx && ctx.state === "running";

  function fadeOut(track) {
    track.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.25);
    setTimeout(() => {
      track.el.pause();
      track.source.disconnect();
    }, 1200);
  }

  // Music keeps its own element and position. Pausing only pauses it, so
  // resuming continues the same track instead of starting it again.
  function syncMusic() {
    if (!running()) return;
    if (current && current.name === wantTrack) {
      if (paused) current.el.pause();
      else current.el.play().catch(() => {});
      return;
    }
    if (current) fadeOut(current);
    current = null;
    if (!wantTrack) return;
    const el = new Audio(new URL(`${wantTrack}.mp3`, AUDIO_DIR()).href);
    el.loop = true;
    el.preload = "auto";
    const source = ctx.createMediaElementSource(el);
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(1, ctx.currentTime, 0.4);
    source.connect(gain).connect(musicGain);
    current = { name: wantTrack, el, source, gain };
    if (!paused) el.play().catch(() => {});
  }

  return {
    play(name, opts = {}) {
      if (!running()) return;
      load(name)
        .then((buffer) => {
          if (!buffer || !running()) return;
          const src = ctx.createBufferSource();
          const gain = ctx.createGain();
          src.buffer = buffer;
          src.playbackRate.value = opts.rate ?? 1;
          gain.gain.value = opts.volume ?? 1;
          src.connect(gain).connect(sfxGain);
          src.start();
        })
        .catch(() => {});
    },
    setTrack(name) {
      wantTrack = name;
      syncMusic();
    },
    setPaused(v) {
      if (paused === v) return;
      paused = v;
      syncMusic();
    },
    destroy() {
      for (const u of unsubs) u();
      surface.removeEventListener("pointerdown", unlock, true);
      window.removeEventListener("keydown", unlock, true);
      if (current) {
        current.el.pause();
        current = null;
      }
    },
  };
}
