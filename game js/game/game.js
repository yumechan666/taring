// Entry the template wires to: composes the run from its modules and hands
// init/update/render to the SDK loop. Game time flows only through dt.

import { createArt, CORE_KEYS } from "./assets.js";
import { createRenderer } from "./render.js";
import { createHud } from "./hud.js";
import { createInput } from "./input.js";
import { createAudio } from "./audio.js";
import { buildStage1, buildEndless } from "./stage.js";
import { AREAS, VARIANTS, areaKeys, buildArea } from "./areas.js";
import { SKINS, skinKeys, skinKey, skinBuffs } from "./skins.js";
import { createPlayer, updatePlayer } from "./player.js";
import { makeEnemy, settleEnemy, updateEnemies, updateShots } from "./enemies.js";
import { createBoss, updateBoss } from "./boss.js";
import { createAreaBoss, updateAreaBoss } from "./areaBoss.js";
import { updateLightsAndPlatforms, updateCrumble, solidAt } from "./world.js";
import { gainUlti, applyEnemyHit } from "./combat.js";
import { GRAVITY, clamp } from "./config.js";

const AREA_COUNT = AREAS.length;

export function createGame({ mount, sdk, tweaks, assets, manifest }) {
  // Everything the run needs lives on this one object (plain JSON).
  const state = {};
  const view = { W: 0, H: 0, T: 40, left: 0, top: 0 };
  let run = null;
  let pendingKind = "stage";
  let pendingArea = 0;
  let ready = false;
  let buffs = skinBuffs(1);
  let previewFrame = 0;
  let skinRequest = 0;
  let levelRequest = 0;
  const meta = {
    version: 2,
    bestScore: 0,
    bestTime: 0,
    bestCombo: 0,
    endlessBest: 0,
    skin: 1,
    cleared: new Array(AREA_COUNT).fill(false),
    records: {},
    ultiDuration: 8,
  };

  const hud = createHud({ mount, handlers: { pause: () => togglePause(), menu: (m) => onMenu(m) } });
  const renderer = createRenderer({ canvas: hud.el.canvas, view });
  const audio = createAudio({ sdk, tweaks, surface: hud.el.root });
  const input = createInput({ root: hud.el.root, getState: () => state, onPause: () => (state.screen ? onMenu("close") : togglePause()) });
  const art = createArt(assets, manifest);
  renderer.setArt(art);

  const keysFor = (kind, area, skin) => {
    const keys = [...CORE_KEYS, ...skinKeys(skin), ...areaKeys(kind === "endless" ? 0 : area)];
    if (kind === "endless") {
      const top = highestCleared();
      if (top > 0) keys.push(...areaKeys(top));
    }
    return keys;
  };

  const artReady = art
    .ensure(keysFor("stage", 0, 1))
    .then(() => {
      ready = true;
      hud.setArt(art, assets ? assets.get("PROPS_OBJECTS") : manifest.PROPS_OBJECTS.src);
      renderer.resize();
    })
    .catch((err) => {
      console.error(err);
      hud.loadFailed();
      throw err;
    });

  const saveReady = sdk.gameState
    .load()
    .then((saved) => {
      if (!saved || (saved.version !== 1 && saved.version !== 2)) return;
      for (const k of ["bestScore", "bestTime", "bestCombo", "endlessBest", "skin", "records"]) if (saved[k] !== undefined) meta[k] = saved[k];
      if (Array.isArray(saved.cleared)) saved.cleared.forEach((v, i) => (meta.cleared[i] = Boolean(v)));
      if (saved.endlessUnlocked) meta.cleared[0] = true;
      meta.skin = Math.max(1, Math.min(SKINS.length, Number(meta.skin) || 1));
      if (meta.skin !== 1) return equipSkin(meta.skin, true);
    })
    .catch(() => {});

  const persist = () => {
    const save = { version: 2, bestScore: meta.bestScore, bestTime: meta.bestTime, bestCombo: meta.bestCombo, endlessBest: meta.endlessBest, skin: meta.skin, cleared: meta.cleared, records: meta.records };
    sdk.gameState.save(save).catch(() => {});
  };

  function highestCleared() {
    let top = 0;
    for (let i = 1; i < AREA_COUNT; i++) if (meta.cleared[i - 1] && meta.cleared[i]) top = i;
    return top;
  }
  const unlocked = (i) => i === 0 || meta.cleared[i - 1];

  const env = {
    tweak: (k) => tweaks.get(k),
    buffs: () => buffs,
    sfx: (n, o) => audio.play(n, o),
    fx: (fx, x, y, o = {}) =>
      state.fx.push({ fx, x, y, t: 0, dur: o.dur ?? 0.35, flip: o.flip ?? 1, scale: o.scale ?? 1, rot: o.rot ?? 0, follow: o.follow ?? null, ground: Boolean(o.ground), alpha: o.alpha ?? 1 }),
    text: (text, x, y, color = "#f1f4ff") => state.texts.push({ text, x, y, t: 0, dur: 1.15, color }),
    shake: (a) => {
      state.shake = Math.max(state.shake, a * Number(tweaks.get("screenShake")));
    },
    haptic: (ms) => {
      try {
        if (sdk.device.haptics.isSupported()) sdk.device.haptics.vibrate(ms).catch(() => {});
      } catch {
        /* optional */
      }
    },
    toast: (text, dur = 3.2) => {
      state.toast = { text, t: 0, dur };
    },
    realDt: 0,
  };

  const maxHearts = () => Number(tweaks.get("maxHearts")) + buffs.extraHeart;

  // ---------------------------------------------------------------- run setup
  function init(s) {
    const kind = pendingKind;
    const area = kind === "endless" ? 0 : pendingArea;
    let level;
    if (kind === "endless") {
      const top = highestCleared();
      const extra = top > 0 ? { tileKeys: AREAS[top].tiles, layerKeys: AREAS[top].layers, pool: AREAS[top].monsters } : null;
      level = buildEndless(1 + Math.floor(Math.random() * 1e6), extra);
    } else level = area === 0 ? buildStage1() : buildArea(area);
    for (const k of Object.keys(s)) delete s[k];
    const hpMul = level.hpMul || 1;
    const player = createPlayer(level.start.x, level.start.y, maxHearts());
    if (buffs.startUlti) player.ulti = 100;
    let boss = null;
    if (level.boss) boss = area === 0 ? createBoss(level.boss, Number(tweaks.get("bossHealth"))) : createAreaBoss(AREAS[area], level.boss);
    Object.assign(s, {
      runKind: kind,
      level,
      time: 0,
      nextId: 1000,
      skinId: meta.skin,
      player,
      enemies: level.enemies.map((sp, i) => settleEnemy(level, makeEnemy(sp, `e${i + 1}`, hpMul))),
      boss,
      shots: [],
      fx: [],
      texts: [],
      orbs: [],
      crumble: [],
      plats: [],
      lights: [],
      bolts: [],
      spawnQueue: [],
      companion: null,
      cam: { x: level.start.x + 3, y: 11 },
      score: 0,
      combo: { count: 0, t: 0 },
      stats: { kills: 0, bestCombo: 0, shards: 0, shardsTotal: level.shards.length, time: 0, distance: 0 },
      checkpoint: { x: level.start.x, y: level.start.y, name: "" },
      noise: null,
      hitstop: 0,
      slowmo: false,
      shake: 0,
      hurtFlash: 0,
      toast: null,
      paused: false,
      screen: null,
      wardrobeIdx: meta.skin - 1,
      over: null,
      overT: 0,
      newBest: false,
      input: { left: false, right: false, down: false, up: false, jump: false, skill: false },
      inputEvents: [],
      formLog: [{ t: -10, form: "human" }],
      lastForm: "human",
      respawnFade: 0.8,
      shadowDuration: Number(tweaks.get("shadowDuration")),
      arenaLocked: false,
      sectionName: level.sections[0] ? level.sections[0].name : "Perjalanan Tanpa Akhir",
    });
    snapCamera(s);
    audio.setTrack(stageTrack(s));
    env.toast(kind === "endless" ? "Perjalanan Tanpa Akhir" : area === 0 ? s.sectionName : `Area ${area}: ${AREAS[area].name}`, 2.6);
  }

  // One stage theme for every area; endless runs get their own.
  const stageTrack = (s) => (s.runKind === "endless" ? "bgm_endless" : "bgm_stage");

  function snapCamera(s) {
    const t = cameraTarget(s);
    s.cam.x = t.x;
    s.cam.y = t.y;
  }

  function cameraTarget(s) {
    const p = s.player;
    const T = view.T || 40;
    const W = view.W || 400;
    const H = view.H || 600;
    const halfW = W / 2 / T;
    const halfH = H / 2 / T;
    let tx = p.x + p.facing * Number(tweaks.get("cameraLookahead"));
    let ty = p.y - 0.12 * (H / T);
    tx = clamp(tx, halfW, Math.max(halfW, s.level.cols - halfW));
    ty = Math.min(ty, s.level.rows + 1.2 - halfH);
    ty = Math.max(ty, halfH - 3);
    return { x: tx, y: ty };
  }

  // ---------------------------------------------------------------- actions
  function respawn(s) {
    const cp = s.checkpoint;
    const old = s.player;
    const p = createPlayer(cp.x, cp.y, maxHearts());
    p.ulti = buffs.startUlti ? 100 : old.ulti;
    s.player = p;
    s.shots = [];
    s.slowmo = false;
    s.respawnFade = 1;
    s.combo.count = 0;
    s.formLog.push({ t: s.time, form: "human" });
    s.lastForm = "human";
    if (s.boss && s.arenaLocked && !s.boss.dead) {
      const a = s.level.arena;
      for (let y = 0; y < 14; y++) s.level.tiles[y * s.level.cols + a.gateX] = 0;
      const area = s.level.area || 0;
      s.boss = area === 0 ? createBoss(s.level.boss, Number(tweaks.get("bossHealth"))) : createAreaBoss(AREAS[area], s.level.boss);
      s.enemies = s.enemies.filter((e) => e.x < a.x0 - 1);
      s.arenaLocked = false;
      audio.setTrack(stageTrack(s));
    }
    snapCamera(s);
    env.toast("Bangkit di bawah bulan", 1.8);
  }

  function stageClear(s) {
    s.over = "clear";
    s.overT = 0;
    const area = s.level.area || 0;
    const bonus = Math.max(0, Math.round(3000 - s.stats.time * 5));
    s.score += bonus + s.stats.shards * 100;
    meta.cleared[area] = true;
    const rec = meta.records[area];
    s.newBest = !rec || s.score > rec.score;
    meta.records[area] = { score: Math.max(rec ? rec.score : 0, s.score), time: rec ? Math.min(rec.time, Math.round(s.stats.time)) : Math.round(s.stats.time) };
    meta.bestScore = Math.max(meta.bestScore, s.score);
    meta.bestCombo = Math.max(meta.bestCombo, s.stats.bestCombo);
    persist();
    submit(s.score);
    audio.setTrack("bgm_victory");
  }

  function gameOver(s) {
    s.over = "gameover";
    s.overT = 0;
    s.newBest = s.score > meta.endlessBest;
    meta.endlessBest = Math.max(meta.endlessBest, s.score);
    meta.bestCombo = Math.max(meta.bestCombo, s.stats.bestCombo);
    persist();
    submit(s.score);
    audio.setTrack("bgm_defeat");
  }

  function submit(score) {
    if (!Number.isFinite(score)) return;
    sdk.leaderboard.submit(Math.max(0, Math.min(Math.round(score), Number.MAX_SAFE_INTEGER))).catch(() => {});
  }

  function togglePause() {
    if (!state.level || state.over || state.screen) return;
    state.paused = !state.paused;
    input.reset();
    env.sfx("tick");
  }

  // Load an area's art (if needed), then rebuild the run there.
  function goTo(kind, area) {
    const request = ++levelRequest;
    const keys = keysFor(kind, area, meta.skin);
    state.loading = true;
    input.reset();
    const start = () => {
      if (request !== levelRequest) return;
      art.retain(keys);
      pendingKind = kind;
      pendingArea = area;
      hud.setLoading(null);
      if (run) run.restart();
      else init(state);
    };
    if (art.has(keys)) return Promise.resolve(start());
    else {
      hud.setLoading(kind === "endless" ? "Menyiapkan perjalanan…" : `Menuju ${AREAS[area].name}…`);
      return art
        .ensure(keys)
        .then(start)
        .catch((error) => {
          if (request === levelRequest) { state.loading = false; hud.loadFailed(); }
          throw error;
        });
    }
  }

  function equipSkin(id, silent = false) {
    if (!Number.isInteger(id) || id < 1 || id > SKINS.length) return Promise.reject(new Error(`Skin tidak tersedia: ${id}`));
    const request = ++skinRequest;
    const keys = skinKeys(id);
    return art
      .ensure(keys)
      .then(() => {
        if (request !== skinRequest) return;
        meta.skin = id;
        buffs = skinBuffs(id);
        state.skinId = id;
        const p = state.player;
        if (p) {
          const max = maxHearts();
          if (max > p.maxHp) p.hp += max - p.maxHp;
          p.maxHp = max;
          p.hp = Math.min(p.hp, max);
          if (buffs.startUlti) p.ulti = 100;
        }
        const area = state.runKind === "endless" ? 0 : state.level ? state.level.area || 0 : 0;
        art.retain(keysFor(state.runKind || "stage", area, id));
        if (!silent) {
          persist();
          env.sfx("ready");
        }
      })
      .catch(error => {
        if (!silent) {
          console.error(`Gagal memuat skin ${id}`, error);
          env.toast('Skin gagal dimuat. Silakan coba lagi.', 4);
        }
        throw error;
      });
  }

  function previewSkin(idx) {
    const id = SKINS[idx].id;
    art.ensure([skinKey(id, "HUMAN_MOVE"), skinKey(id, "WOLF_MOVE")]).catch(() => {});
  }

  function onMenu(m) {
    env.sfx("tick");
    const s = state;
    if (m === "resume") togglePause();
    else if (m === "map") {
      input.reset();
      s.screen = "map";
      if (!s.over) s.paused = true;
    } else if (m === "wardrobe") {
      input.reset();
      s.screen = "wardrobe";
      s.wardrobeIdx = meta.skin - 1;
      previewSkin(s.wardrobeIdx);
      if (!s.over) s.paused = true;
    } else if (m === "close") {
      s.screen = null;
      const area = s.runKind === "endless" ? 0 : s.level.area || 0;
      art.retain(keysFor(s.runKind, area, meta.skin));
    } else if (m === "skin-prev" || m === "skin-next") {
      s.wardrobeIdx = (s.wardrobeIdx + (m === "skin-next" ? 1 : -1) + SKINS.length) % SKINS.length;
      previewSkin(s.wardrobeIdx);
    } else if (m === "skin-equip") equipSkin(SKINS[s.wardrobeIdx].id).catch(() => {});
    else if (m === "checkpoint") {
      s.paused = false;
      if (s.runKind === "stage") respawn(s);
      else goTo("endless", 0);
    } else if (m === "restart") goTo(s.runKind, s.level.area || 0);
    else if (m === "endless") goTo("endless", 0);
    else if (m === "again") goTo(s.runKind, s.level.area || 0);
    else if (m === "next") goTo("stage", Math.min(AREA_COUNT - 1, (s.level.area || 0) + 1));
    else if (m.startsWith("area:")) {
      const n = Number(m.slice(5));
      if (unlocked(n)) goTo("stage", n);
    }
  }

  function loadLevel(index) {
    if (index >= AREA_COUNT) return goTo("endless", 0);
    return goTo("stage", clamp(index, 0, AREA_COUNT - 1));
  }

  function fillUlti() {
    if (state.player) state.player.ulti = 100;
  }
  function heal() {
    if (state.player) state.player.hp = state.player.maxHp;
  }
  function skipToNextCheckpoint() {
    const p = state.player;
    if (!p) return;
    const cp = state.level.checkpoints.find((c) => c.x > p.x + 1);
    if (!cp) return;
    p.x = cp.x;
    p.y = cp.y - 0.05;
    p.vx = 0;
    p.vy = 0;
    p.hang = null;
    p.swing = null;
    snapCamera(state);
  }

  // ---------------------------------------------------------------- update
  function updatePickups(s, dt) {
    const p = s.player;
    for (const sh of s.level.shards) {
      if (sh.taken) continue;
      if (Math.abs(p.x - sh.x) < 0.8 && sh.y > p.y - p.h - 0.4 && sh.y - 0.6 < p.y + 0.2) {
        sh.taken = true;
        s.stats.shards += 1;
        s.score += 50;
        gainUlti(s, 10, env);
        env.sfx("pickup");
        env.fx("shard_sparkle", sh.x, sh.y - 0.5, { scale: 0.6, dur: 0.45 });
        if (sh.secret) env.text("Rahasia!", sh.x, sh.y - 1.4, "#ffd2a8");
        if (s.runKind === "endless" && s.stats.shards % 10 === 0 && p.hp < p.maxHp) {
          p.hp += 1;
          env.text("+1 nyawa", p.x, p.y - 2.2, "#ff9a9a");
        }
      }
    }
    for (const o of s.orbs) {
      o.t += dt;
      if (o.carrier) {
        const c = s.enemies.find((e) => e.id === o.carrier);
        if (!c) o.gone = true;
        else if (c.dead) o.carrier = null;
        else {
          o.x = c.x;
          o.y = c.y + 0.2;
          continue;
        }
      }
      const dx = p.x - o.x;
      const dy = p.y - p.h * 0.5 - o.y;
      const d = Math.hypot(dx, dy);
      if (d < 2.4 && !p.dead) {
        if (d < 0.6) {
          o.gone = true;
          gainUlti(s, 8, env);
          env.sfx("orb");
        } else {
          const travel = Math.min(d, 11 * dt);
          o.x += (dx / d) * travel;
          o.y += (dy / d) * travel;
        }
        continue;
      }
      o.vy = Math.min(o.vy + GRAVITY * 0.5 * dt, 8);
      o.vx *= 0.96;
      const ny = o.y + o.vy * dt;
      if (o.vy > 0 && solidAt(s.level, Math.floor(o.x), Math.floor(ny + 0.3))) {
        o.vy = 0;
        o.y = Math.floor(ny + 0.3) - 0.3 - Math.abs(Math.sin(o.t * 3)) * 0.15;
      } else o.y = ny;
      o.x += o.vx * dt;
      if (o.t > 11 || o.y > s.level.rows + 2) o.gone = true;
    }
    s.orbs = s.orbs.filter((o) => !o.gone);
    for (const cp of s.level.checkpoints) {
      if (cp.on) continue;
      if (Math.abs(p.x - cp.x) < 1 && Math.abs(p.y - cp.y) < 2.5) {
        cp.on = true;
        s.checkpoint = { x: cp.x, y: cp.y, name: cp.name };
        s.sectionName = cp.name;
        p.hp = p.maxHp;
        p.reviveUsed = false;
        env.toast(cp.name, 2.6);
        env.sfx("checkpoint");
        env.fx("moon_burst", cp.x + 0.3, cp.y - 1.3, { scale: 0.8 });
      }
    }
    for (const h of s.level.hints) {
      if (!h.shown && p.x >= h.x) {
        h.shown = true;
        env.toast(h.text, 3.8);
      }
    }
  }

  // Roh Leluhur / Gerhana Abadi: a spirit wolf that follows and strikes.
  function updateCompanion(s, dt) {
    const p = s.player;
    if (!buffs.spirit || p.dead) {
      s.companion = null;
      return;
    }
    const c = s.companion || (s.companion = { x: p.x - 1.5, y: p.y - 1.2, cd: 1, facing: 1, dash: null });
    c.cd -= dt;
    if (c.dash) {
      c.dash.t += dt;
      const k = Math.min(1, c.dash.t / 0.22);
      c.x = c.dash.sx + (c.dash.tx - c.dash.sx) * k;
      c.y = c.dash.sy + (c.dash.ty - c.dash.sy) * k;
      if (k >= 1) {
        const e = s.enemies.find((en) => en.id === c.dash.id && !en.dead);
        if (e) applyEnemyHit(s, env, e, { kind: "spirit", form: "eclipse", dmg: 1.2, dir: c.facing, fromX: c.x, knock: 2, ignoreShield: true, noChain: true, ulti: 2 });
        c.dash = null;
      }
      return;
    }
    const hx = p.x - p.facing * 1.4;
    const hy = p.y - 1.1 + Math.sin(s.time * 3) * 0.15;
    c.x += (hx - c.x) * Math.min(1, dt * 5);
    c.y += (hy - c.y) * Math.min(1, dt * 5);
    c.facing = p.facing;
    if (c.cd <= 0) {
      const e = s.enemies.filter((en) => !en.dead && Math.hypot(en.x - p.x, en.y - p.y) < 7).sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0];
      if (e) {
        c.cd = 1.3;
        c.facing = e.x > c.x ? 1 : -1;
        c.dash = { id: e.id, t: 0, sx: c.x, sy: c.y, tx: e.x, ty: e.y - e.h * 0.5 };
      } else c.cd = 0.3;
    }
  }

  function update(s, dt) {
    if (!ready || !s.level || s.loading) return;
    env.realDt = dt;
    if (s.paused || s.screen) return;
    for (const t of s.texts) t.t += dt;
    s.texts = s.texts.filter((t) => t.t < t.dur);
    if (s.over) {
      s.overT += dt;
      return;
    }
    if (s.hitstop > 0) {
      s.hitstop -= dt;
      return;
    }
    const wdt = dt * (s.slowmo ? 0.35 : 1);
    s.time += wdt;
    s.stats.time += wdt;
    s.shake = Math.max(0, s.shake - dt * 3);
    s.hurtFlash = Math.max(0, s.hurtFlash - dt);
    s.respawnFade = Math.max(0, s.respawnFade - dt * 1.6);
    if (s.toast) s.toast.t += dt;
    if (s.combo.t > 0) {
      s.combo.t -= wdt;
      if (s.combo.t <= 0) s.combo.count = 0;
    }
    if (s.noise) {
      s.noise.t -= wdt;
      if (s.noise.t <= 0) s.noise = null;
    }
    s.shadowDuration = Number(tweaks.get("shadowDuration"));
    for (const a of s.level.altars) a.activeT = Math.max(0, a.activeT - wdt);

    updateLightsAndPlatforms(s, wdt);
    updatePlayer(s, wdt, env);
    const p = s.player;
    // Footsteps while running on the ground, one per stride; a combo chime every 5 hits.
    if (p.onGround && !p.dead && Math.abs(p.vx) > 2.5) {
      s.stepT = (s.stepT || 0) - wdt;
      if (s.stepT <= 0) {
        s.stepT = 0.3;
        env.sfx("footstep", { volume: 0.5 });
      }
    } else s.stepT = 0;
    if (s.combo.count >= 5 && s.combo.count % 5 === 0 && s.combo.count !== s.comboChimed) {
      s.comboChimed = s.combo.count;
      env.sfx("combo");
    } else if (s.combo.count < 5) s.comboChimed = 0;
    if (p.form !== s.lastForm) {
      s.lastForm = p.form;
      s.formLog.push({ t: s.time, form: p.form });
      if (s.formLog.length > 12) s.formLog.shift();
    }
    updateEnemies(s, wdt, env);
    if (s.boss && s.boss.kind === "area") updateAreaBoss(s, wdt, env);
    else updateBoss(s, wdt, env);
    updateShots(s, wdt, env);
    updateCrumble(s, wdt, env);
    updatePickups(s, wdt);
    updateCompanion(s, wdt);
    for (const spec of s.spawnQueue) {
      const e = makeEnemy(spec, `e${s.nextId++}`, 1);
      s.enemies.push(e);
      env.fx("shadow_burst", e.x, e.y - 0.8, { scale: 0.8 });
    }
    s.spawnQueue = [];
    for (const b of s.bolts) b.t += wdt;
    s.bolts = s.bolts.filter((b) => b.t < 0.3);

    // Entering the arena seals it and wakes the boss.
    const arena = s.level.arena;
    if (arena && s.boss && !s.arenaLocked && !s.boss.dead && p.x > arena.trigger && !p.dead) {
      s.arenaLocked = true;
      for (let y = 0; y < 14; y++) s.level.tiles[y * s.level.cols + arena.gateX] = 5;
      s.boss.active = true;
      s.boss.state = "intro";
      s.boss.t = 0;
      audio.setTrack("bgm_boss");
      env.sfx("gate");
      const area = s.level.area || 0;
      env.toast(area === 0 ? "Serigala Tanpa Bayangan — ia meniru wujudmu" : AREAS[area].boss, 3.2);
      env.shake(0.8);
      env.sfx("growl");
    }
    if (s.boss && s.boss.dead && s.boss.deathT > 2.2 && !s.over) stageClear(s);

    if (p.dead && p.deadT > 1.1) {
      if (s.runKind === "endless") gameOver(s);
      else respawn(s);
    }

    for (const f of s.fx) f.t += dt;
    s.fx = s.fx.filter((f) => f.t < f.dur);

    if (s.runKind === "endless") {
      const dist = Math.max(s.stats.distance, p.x - s.level.start.x);
      if (dist > s.stats.distance) {
        s.score += Math.floor(dist) - Math.floor(s.stats.distance);
        s.stats.distance = dist;
      }
    }
    for (const sec of s.level.sections) if (p.x >= sec.x) s.sectionName = sec.name;

    const t = cameraTarget(s);
    s.cam.x += (t.x - s.cam.x) * Math.min(1, dt * 4.5);
    s.cam.y += (t.y - s.cam.y) * Math.min(1, dt * 3.5);
  }

  function hudMeta(s) {
    meta.ultiDuration = Number(tweaks.get("ultiDuration")) * buffs.eclipseMult;
    meta.endlessUnlocked = meta.cleared[0];
    meta.skins = SKINS;
    // Only the map and result screens read the area list. Rebuilding it and
    // stringifying records on every frame fed the GC and caused hitches.
    if (!meta.areas || s.screen === "map" || s.over) {
      meta.areas = AREAS.map((a) => ({ id: a.id, name: a.name, boss: a.boss, color: a.color, unlocked: unlocked(a.id), cleared: meta.cleared[a.id] }));
      meta.mapKey = meta.cleared.map(Number).join("") + JSON.stringify(meta.records);
    }
    return meta;
  }

  function render(s) {
    renderer.draw(s);
    renderHud(s);
  }

  // Everything except the canvas. The standalone loop calls this alone while
  // paused, because the world under the pause menu does not change.
  function renderHud(s) {
    hud.update(s, hudMeta(s));
    if (s.screen === "wardrobe") {
      previewFrame += 1;
      const id = SKINS[s.wardrobeIdx].id;
      hud.drawPreview(art, [skinKey(id, "HUMAN_MOVE"), skinKey(id, "WOLF_MOVE")], previewFrame);
    }
    audio.setPaused(Boolean((run && run.frozen) || s.paused || s.screen));
  }

  return {
    state,
    whenReady: Promise.all([artReady, saveReady]),
    hooks: { init, update, render },
    renderHud,
    view,
    renderer,
    hud,
    meta,
    areas: AREAS,
    variants: VARIANTS,
    attachRun(r) {
      run = r;
    },
    loadLevel,
    startEndless: () => goTo("endless", 0),
    respawn: () => state.level && respawn(state),
    togglePause,
    openMap: () => onMenu("map"),
    openWardrobe: () => onMenu("wardrobe"),
    equipSkin: (id) => equipSkin(id),
    unlockAll() {
      meta.cleared = meta.cleared.map(() => true);
      persist();
    },
    fillUlti,
    heal,
    skipToNextCheckpoint,
    destroy() {
      input.destroy();
      audio.destroy();
      renderer.destroy();
      mount.replaceChildren();
    },
  };
}
