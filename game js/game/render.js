// Canvas renderer. One transform owns world→screen (tiles × T + origin);
// every sprite, hit marker and chain derives from it. Reads state only.

import { WHEEL_SPEED } from "./world.js";
import { skinKey } from "./skins.js";
import { RIGS } from "./areaBoss.js";

// Tiles of world height per source pixel, per sheet (sizes art consistently).
const UNIT = {
  HERO_HUMAN_MOVE: 1.8 / 300,
  HERO_HUMAN_COMBAT: 1.8 / 300,
  HERO_HUMAN_ACTION: 1.8 / 300,
  HERO_WOLF_MOVE: 1.3 / 258,
  HERO_WOLF_COMBAT: 1.3 / 258,
  HERO_WOLF_ACTION: 1.3 / 258,
  HERO_ECLIPSE: 2.75 / 326,
  BOSS_HUMAN: 1.95 / 327,
  BOSS_WOLF: 1.5 / 258,
  ENEMY_ARCHER: 1.85 / 335,
  ENEMY_LANTERN: 1.85 / 279,
  ENEMY_KNIGHT: 2.1 / 316,
  ENEMY_CROW: 1.3 / 340,
  ENEMY_HOUND: 1.0 / 177,
  ENEMY_STITCHER: 2.0 / 334,
  ENEMY_MIMIC: 0.9 / 171,
};
const ROLE_UNIT = {
  HUMAN_MOVE: 1.8 / 300, HUMAN_COMBAT: 1.8 / 300, HUMAN_ACTION: 1.8 / 300,
  WOLF_MOVE: 1.3 / 258, WOLF_COMBAT: 1.3 / 258, WOLF_ACTION: 1.3 / 258,
  ECLIPSE: 2.75 / 326,
};

// Player animation key → [sheet, row, reversed]
const HERO = {
  "human.idle": ["HUMAN_MOVE", "idle"],
  "human.run": ["HUMAN_MOVE", "run"],
  "human.jump": ["HUMAN_MOVE", "jump"],
  "human.fall": ["HUMAN_MOVE", "fall"],
  "human.slash1": ["HUMAN_COMBAT", "slash1"],
  "human.slash2": ["HUMAN_COMBAT", "slash2"],
  "human.slash3": ["HUMAN_COMBAT", "slash3"],
  "human.hook": ["HUMAN_COMBAT", "hook"],
  "human.deflect": ["HUMAN_ACTION", "deflect"],
  "human.hang": ["HUMAN_ACTION", "hang"],
  "human.hurt": ["HUMAN_ACTION", "hurt"],
  "human.transform": ["HUMAN_ACTION", "transform"],
  "human.untransform": ["HUMAN_ACTION", "transform", true],
  "wolf.idle": ["WOLF_MOVE", "idle"],
  "wolf.run": ["WOLF_MOVE", "run"],
  "wolf.jump": ["WOLF_MOVE", "jump"],
  "wolf.pounce": ["WOLF_MOVE", "pounce"],
  "wolf.claw": ["WOLF_COMBAT", "claw"],
  "wolf.bite": ["WOLF_COMBAT", "bite"],
  "wolf.slam": ["WOLF_COMBAT", "slam"],
  "wolf.crawl": ["WOLF_COMBAT", "crawl"],
  "wolf.sniff": ["WOLF_ACTION", "sniff"],
  "wolf.howl": ["WOLF_ACTION", "howl"],
  "wolf.hurt": ["WOLF_ACTION", "hurt"],
  "eclipse.idle": ["ECLIPSE", "idle"],
  "eclipse.run": ["ECLIPSE", "run"],
  "eclipse.claw": ["ECLIPSE", "claw"],
  "eclipse.slam": ["ECLIPSE", "slam"],
};

const ENEMY_SHEET = {
  archer: "ENEMY_ARCHER",
  lantern: "ENEMY_LANTERN",
  knight: "ENEMY_KNIGHT",
  crow: "ENEMY_CROW",
  hound: "ENEMY_HOUND",
  stitcher: "ENEMY_STITCHER",
  mimic: "ENEMY_MIMIC",
};

const FX_SHEET = {
  slash: "FX_COMBAT",
  claw: "FX_COMBAT",
  moon_mark: "FX_COMBAT",
  armor_crack: "FX_COMBAT",
  hit_spark: "FX_IMPACT",
  dust: "FX_IMPACT",
  moon_burst: "FX_IMPACT",
  shadow_burst: "FX_IMPACT",
  spirit_wolf: "FX_SPIRIT",
  ground_wave: "FX_SPIRIT",
  howl_rings: "FX_SPIRIT",
  shard_sparkle: "FX_SPIRIT",
};

// World height (tiles) of each prop part.
const PROP_H = {
  moon_ring: 1.15, lever_off: 0.95, lever_on: 0.95, moon_altar: 1.2, moon_altar_lit: 1.2,
  moon_shard: 0.62, checkpoint_off: 2.0, checkpoint_on: 2.0, arrow: 0.2, hook_head: 0.5, chain_link: 0.16,
  fallen_tree: 1.5, iron_bars: 2.0, guard_lamp: 1.3, lamp_post: 2.7, gravestone: 1.1, red_bush: 1.2,
  barrel: 1.0, signpost: 1.7, dead_tree: 2.6, mill_wheel: 1, wood_plank: 0.2, shadow_block: 1,
};

function hexRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

export function createRenderer({ canvas, view }) {
  const ctx = canvas.getContext("2d");
  let art = null;
  let dirty = true;
  // The canvas is drawn at devicePixelRatio, capped at 2. Measured on a phone-sized
  // emulation, lower caps did not change frame pacing, so there is no adaptive scaling.
  const pixelRatio = () => Math.min(window.devicePixelRatio || 1, 2);
  let pairs = new WeakMap(); // mirrored background strips, rebuilt on resize
  const glows = new Map(); // pre-rendered glow sprites per colour and size
  // The edge vignette never changes between frames, so it is painted once per
  // size instead of creating a full-screen radial gradient every frame.
  const vignette = document.createElement("canvas");

  function buildVignette(W, H) {
    vignette.width = Math.max(1, Math.round(W / 2));
    vignette.height = Math.max(1, Math.round(H / 2));
    const v = vignette.getContext("2d");
    const w = vignette.width;
    const h = vignette.height;
    const g = v.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
    g.addColorStop(0, "rgba(5,6,16,0)");
    g.addColorStop(1, "rgba(5,6,16,0.55)");
    v.clearRect(0, 0, w, h);
    v.fillStyle = g;
    v.fillRect(0, 0, w, h);
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = pixelRatio();
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (view.W !== rect.width || view.H !== rect.height) buildVignette(rect.width, rect.height);
    view.W = rect.width;
    view.H = rect.height;
    view.T = Math.min(rect.height / 11.5, rect.width / 9.5);
    view.left = rect.left;
    view.top = rect.top;
    pairs = new WeakMap();
    glows.clear();
    dirty = true;
  }
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  // ---- helpers
  const sx = (wx, cam) => (wx - cam.x) * view.T + view.W / 2;
  const sy = (wy, cam) => (wy - cam.y) * view.T + view.H / 2;

  function frameOf(sheet, row, prog, animT, fps, reverse) {
    const list = art.frames[sheet]?.anims[row];
    if (!list || !list.length) return null;
    let i;
    if (prog >= 0) i = Math.min(list.length - 1, Math.floor(prog * list.length));
    else i = fps > 0 ? Math.floor(animT * fps) % list.length : 0;
    if (reverse) i = list.length - 1 - i;
    return list[i];
  }

  // Draw a frame pinned at its anchor (feet) — no per-frame creep.
  // save/restore is costly on the canvas, so the common case (no flip) draws
  // directly and only touches globalAlpha when it has to.
  function drawAnchored(img, fr, x, y, k, flip, alpha = 1) {
    const c = fr.content || fr.source;
    const an = fr.anchor || { x: c.x + c.w / 2, y: c.y + c.h };
    const prev = ctx.globalAlpha;
    if (alpha !== 1) ctx.globalAlpha = prev * alpha;
    if (flip) {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(-1, 1);
      ctx.drawImage(img, c.x, c.y, c.w, c.h, -(an.x - c.x) * k, -(an.y - c.y) * k, c.w * k, c.h * k);
      ctx.restore();
    } else ctx.drawImage(img, c.x, c.y, c.w, c.h, x - (an.x - c.x) * k, y - (an.y - c.y) * k, c.w * k, c.h * k);
    if (alpha !== 1) ctx.globalAlpha = prev;
  }

  function drawFlashOver(img, fr, x, y, k, flip, strength, color) {
    // Brighten by redrawing additively — Safari-safe (no ctx.filter).
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    drawAnchored(img, fr, x, y, k, flip, strength);
    ctx.restore();
    if (color) {
      /* tint handled by glow under the sprite */
    }
  }

  // Draw an atlas part with its bottom-center at (x, y), height h tiles.
  function drawProp(sheet, name, x, y, hTiles, opts = {}) {
    const fr = art.frames[sheet]?.byName[name];
    if (!fr) return;
    const c = fr.content || fr.source;
    const k = (hTiles * view.T) / c.h;
    const w = c.w * k;
    const h = c.h * k;
    const ay = opts.center ? h * (opts.cy ?? 0.5) : h;
    const alpha = opts.alpha ?? 1;
    const prev = ctx.globalAlpha;
    if (alpha !== 1) ctx.globalAlpha = prev * alpha;
    if (opts.rot || opts.flip) {
      ctx.save();
      ctx.translate(x, y);
      if (opts.rot) ctx.rotate(opts.rot);
      if (opts.flip) ctx.scale(-1, 1);
      ctx.drawImage(art.images[sheet], c.x, c.y, c.w, c.h, -w / 2, -ay, w, h);
      ctx.restore();
    } else ctx.drawImage(art.images[sheet], c.x, c.y, c.w, c.h, x - w / 2, y - ay, w, h);
    if (alpha !== 1) ctx.globalAlpha = prev;
  }

  // A glow is a radial gradient that never changes shape, so it is painted once
  // into a small canvas per colour/size and stamped with drawImage. Creating a
  // gradient and a save/restore pair for every lamp, every frame, was costly.
  // Alpha is applied when stamping, not baked in: several callers pulse it every frame.
  function glowSprite(color, r) {
    const key = `${color}|${Math.round(r)}`;
    let sprite = glows.get(key);
    if (!sprite) {
      const dpr = pixelRatio();
      const size = Math.max(2, Math.round(r * 2 * dpr));
      sprite = document.createElement("canvas");
      sprite.width = sprite.height = size;
      const g = sprite.getContext("2d");
      const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      grad.addColorStop(0, color.replace("A", "1"));
      grad.addColorStop(1, color.replace("A", "0"));
      g.fillStyle = grad;
      g.fillRect(0, 0, size, size);
      if (glows.size > 64) glows.clear();
      glows.set(key, sprite);
    }
    return sprite;
  }

  function glow(x, y, r, color, alpha) {
    const op = ctx.globalCompositeOperation;
    const prev = ctx.globalAlpha;
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = prev * Math.max(0, Math.min(1, alpha));
    ctx.drawImage(glowSprite(color, r), x - r, y - r, r * 2, r * 2);
    ctx.globalAlpha = prev;
    ctx.globalCompositeOperation = op;
  }

  // Parallax strips alternate with a mirrored copy so the seams match. The
  // image and its mirror are drawn once into one canvas, so a layer costs a
  // few drawImage calls per frame instead of a save/flip/restore for every strip.
  function mirroredPair(img, w, h) {
    let bySize = pairs.get(img);
    if (!bySize) pairs.set(img, (bySize = new Map()));
    const key = `${Math.round(w)}x${Math.round(h)}`;
    let pair = bySize.get(key);
    if (!pair) {
      const dpr = pixelRatio();
      pair = document.createElement("canvas");
      pair.width = Math.max(2, Math.round(w * 2 * dpr));
      pair.height = Math.max(1, Math.round(h * dpr));
      const p = pair.getContext("2d");
      const half = pair.width / 2;
      p.drawImage(img, 0, 0, half, pair.height);
      p.translate(pair.width, 0);
      p.scale(-1, 1);
      p.drawImage(img, 0, 0, half, pair.height);
      bySize.set(key, pair);
    }
    return pair;
  }

  // ---- background
  function drawBackground(state, cam) {
    const { W, H, T } = view;
    const sky = art.images.SKY_BG;
    const s = Math.max(W / sky.width, H / sky.height) * 1.08;
    const sw = sky.width * s;
    const shh = sky.height * s;
    ctx.drawImage(sky, (W - sw) / 2 - ((cam.x * 0.4) % 20), (H - shh) / 2 - (cam.y - 9) * 0.6, sw, shh);

    if (state.level.tint) {
      ctx.fillStyle = state.level.tint;
      ctx.fillRect(0, 0, W, H);
    }
    const groundY = sy(14, cam);
    const weights = themeWeights(state, cam);
    const drift = (state.level.drift || 0) * state.time;
    const layer = (factor, heightFrac, bottom, alpha) => {
      for (const [idx, a] of weights) {
        const key = state.level.layerKeys[idx];
        const img = art.images[key];
        if (a <= 0.01 || !img) continue;
        const h = H * heightFrac;
        const w = img.width * (h / img.height);
        let off = -(((cam.x + drift) * T * factor) % (w * 2));
        if (off > 0) off -= w * 2;
        const pair = mirroredPair(img, w, h);
        const prev = ctx.globalAlpha;
        ctx.globalAlpha = alpha * a;
        for (let x = off; x < W; x += w * 2) ctx.drawImage(pair, x, bottom - h, w * 2, h);
        ctx.globalAlpha = prev;
      }
    };
    const farBottom = H * 0.8 * 0.6 + (groundY + T * 0.5) * 0.4;
    layer(0.12, 0.38, farBottom, 0.5);
    // fog band between layers
    const fogG = ctx.createLinearGradient(0, farBottom - H * 0.2, 0, farBottom + 10);
    fogG.addColorStop(0, "rgba(70,90,140,0)");
    fogG.addColorStop(1, "rgba(70,90,140,0.35)");
    ctx.fillStyle = fogG;
    ctx.fillRect(0, farBottom - H * 0.2, W, H * 0.2 + 10);
    const nearBottom = H * 0.92 * 0.4 + (groundY + T * 2.2) * 0.6;
    layer(0.3, 0.5, nearBottom, 0.9);
    ctx.fillStyle = "#0b0f1e";
    ctx.fillRect(0, nearBottom - 2, W, H - nearBottom + 2);
  }

  function themeWeights(state, cam) {
    const th = state.level.theme;
    const counts = new Map();
    let n = 0;
    for (let x = Math.floor(cam.x) - 6; x <= Math.floor(cam.x) + 6; x++) {
      if (x < 0 || x >= th.length) continue;
      counts.set(th[x], (counts.get(th[x]) || 0) + 1);
      n++;
    }
    if (!n) return [[0, 1]];
    return [...counts.entries()].map(([k, c]) => [k, c / n]);
  }

  // ---- tiles
  function drawTiles(state, cam) {
    const level = state.level;
    const { W, H, T } = view;
    const x0 = Math.max(0, Math.floor(cam.x - W / 2 / T) - 2);
    const x1 = Math.min(level.cols - 1, Math.ceil(cam.x + W / 2 / T) + 2);
    const y0 = Math.max(0, Math.floor(cam.y - H / 2 / T) - 1);
    const y1 = Math.min(level.rows - 1, Math.ceil(cam.y + H / 2 / T) + 1);
    const at = (x, y) => (y >= level.rows ? 1 : x < 0 || x >= level.cols || y < 0 ? 0 : level.tiles[y * level.cols + x]);
    const ground = (x, y) => at(x, y) === 1;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const t = at(x, y);
        if (!t) continue;
        const X = sx(x, cam);
        const Y = sy(y, cam);
        if (t === 1) {
          const sheet = level.tileKeys[level.theme[x]] || level.tileKeys[0];
          if (!art.frames[sheet] || !art.images[sheet]) continue;
          const up = ground(x, y - 1);
          const down = ground(x, y + 1);
          const left = x === 0 ? true : ground(x - 1, y);
          const right = x === level.cols - 1 ? true : ground(x + 1, y);
          const row = !up ? "top" : !down ? "bottom" : "";
          const col = !left ? "left" : !right ? "right" : "";
          const name = row && col ? `${row}_${col}` : row || col || "center";
          const fr = art.frames[sheet].byName[name];
          if (!fr) continue;
          const s = fr.source;
          const c = fr.content;
          const k = T / s.w;
          ctx.drawImage(art.images[sheet], c.x, c.y, c.w, c.h, X + (c.x - s.x) * k - 0.3, Y + (c.y - s.y) * k - 0.3, c.w * k + 0.6, c.h * k + 0.6);
        } else if (t === 2) {
          drawProp("PROPS_WORLD", "wood_plank", X + T / 2, Y + T * 0.22, 0.22);
        } else {
          const name = t === 3 ? "fragile_floor" : t === 4 ? "cracked_barricade" : "gate_block";
          const fr = art.frames.PROPS_OBJECTS.byName[name];
          const s = fr.source;
          const c = fr.content;
          const k = T / s.w;
          let shakeX = 0;
          if (t === 3) {
            const cr = state.crumble.find((cc) => cc.x === x && !cc.done);
            if (cr) shakeX = Math.sin(state.time * 80) * T * 0.05;
          }
          ctx.drawImage(art.images.PROPS_OBJECTS, c.x, c.y, c.w, c.h, X + (c.x - s.x) * k + shakeX, Y + (c.y - s.y) * k, c.w * k, c.h * k);
        }
      }
    }
  }

  function drawShadowSquares(x, y, w, cam, alpha) {
    const n = Math.max(1, Math.round(w));
    const size = w / n;
    for (let i = 0; i < n; i++) {
      drawProp("PROPS_WORLD", "shadow_block", sx(x + i * size + size / 2, cam), sy(y + size, cam), size, { alpha });
    }
  }

  function drawShadows(state, cam) {
    const level = state.level;
    const pulse = 0.75 + Math.sin(state.time * 4) * 0.1;
    for (const s of level.shadows) {
      const altar = level.altars.find((a) => a.id === s.altar);
      const on = altar && altar.activeT > 0;
      const n = Math.max(1, Math.round(s.w));
      const seg = s.w / n;
      for (let i = 0; i < n; i++) {
        let alpha = 0.1;
        if (on) {
          const lit = s.litMask && s.litMask[i];
          alpha = lit ? 0.1 + ((Math.floor(state.time * 20) + i) % 3) * 0.04 : pulse;
          if (altar.activeT < 2.5 && Math.floor(altar.activeT * 8) % 2 === 0) alpha *= 0.4;
        }
        drawProp("PROPS_WORLD", "shadow_block", sx(s.x + seg * (i + 0.5), cam), sy(s.y + seg, cam), seg, { alpha });
      }
    }
    for (const wh of level.wheels) {
      const altar = level.altars.find((a) => a.id === wh.altar);
      const on = altar && altar.activeT > 0;
      // the real wheel turns behind its shadow blades
      drawProp("PROPS_WORLD", "mill_wheel", sx(wh.cx, cam), sy(wh.cy, cam), wh.r * 2.05, { center: true, cy: 0.52, rot: wh.ang, alpha: 0.95 });
      for (let i = 0; i < 4; i++) {
        const a = wh.ang + (i * Math.PI) / 2;
        const px = wh.cx + Math.cos(a) * wh.r;
        const py = wh.cy + Math.sin(a) * wh.r;
        let alpha = 0.12;
        if (on) {
          alpha = wh.lit[i] ? 0.15 : pulse;
          if (altar.activeT < 2.5 && Math.floor(altar.activeT * 8) % 2 === 0) alpha *= 0.4;
        }
        drawShadowSquares(px - 0.9, py, 1.8, cam, alpha);
      }
    }
    void WHEEL_SPEED;
  }

  function drawLights(state, cam) {
    const T = view.T;
    for (const l of state.lights || []) {
      const ox = sx(l.x, cam);
      const oy = sy(l.y, cam);
      const r = l.len * T;
      const g = ctx.createRadialGradient(ox, oy, 0, ox, oy, r);
      const col = l.kind === "lamp" ? "255,232,170" : "255,180,90";
      g.addColorStop(0, `rgba(${col},0.42)`);
      g.addColorStop(1, `rgba(${col},0)`);
      const op = ctx.globalCompositeOperation;
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.arc(ox, oy, r, l.ang - l.half, l.ang + l.half);
      ctx.closePath();
      ctx.fill();
      ctx.globalCompositeOperation = op;
      glow(ox, oy, T * 0.7, `rgba(${col},A)`, 0.5);
    }
  }

  function drawDecor(state, cam) {
    const { W, T } = view;
    for (const d of state.level.decor) {
      if (d.kind === "mill_wheel") continue;
      const X = sx(d.x, cam);
      if (X < -T * 4 || X > W + T * 4) continue;
      drawProp("PROPS_WORLD", d.kind, X, sy(d.y, cam) + T * 0.05, (PROP_H[d.kind] || 1) * d.scale, { alpha: d.kind === "iron_bars" ? 0.9 : 1 });
      if (d.kind === "lamp_post") glow(X + T * 0.35, sy(d.y - 2.1, cam), T * 1.6, "rgba(255,170,80,A)", 0.35);
      if (d.kind === "guard_lamp") glow(X - T * 0.1, sy(d.y - 0.5, cam), T * 1.2, "rgba(255,200,110,A)", 0.4);
    }
  }

  function drawObjects(state, cam) {
    const { T } = view;
    const level = state.level;
    const p = state.player;
    for (const a of level.altars) {
      const X = sx(a.x, cam);
      const Y = sy(a.y, cam);
      const on = a.activeT > 0;
      if (on) glow(X, Y - T * 0.7, T * 2.2, "rgba(150,210,255,A)", 0.45);
      else if (p.form === "wolf" && Math.abs(p.x - a.x) < 5) glow(X, Y - T * 0.7, T * 1.4, "rgba(150,210,255,A)", 0.2 + Math.sin(state.time * 5) * 0.1);
      drawProp("PROPS_OBJECTS", on ? "moon_altar_lit" : "moon_altar", X, Y + T * 0.04, PROP_H.moon_altar);
      if (on) {
        ctx.save();
        ctx.strokeStyle = "rgba(190,227,255,0.9)";
        ctx.lineWidth = Math.max(2, T * 0.07);
        ctx.beginPath();
        ctx.arc(X, Y - T * 1.75, T * 0.28, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (a.activeT / Math.max(1, state.shadowDuration || 12)));
        ctx.stroke();
        ctx.restore();
      }
    }
    for (const lv of level.levers) drawProp("PROPS_OBJECTS", lv.on ? "lever_on" : "lever_off", sx(lv.x, cam), sy(lv.y, cam) + T * 0.04, PROP_H.lever_off);
    for (const r of level.rings) {
      const X = sx(r.x, cam);
      const Y = sy(r.y, cam);
      glow(X, Y, T * 0.9, "rgba(150,200,255,A)", 0.25 + Math.sin(state.time * 3 + r.x) * 0.08);
      drawProp("PROPS_OBJECTS", "moon_ring", X, Y, PROP_H.moon_ring, { center: true, cy: 0.66 });
    }
    for (const cp of level.checkpoints) {
      const X = sx(cp.x, cam);
      const Y = sy(cp.y, cam);
      if (cp.on) glow(X + T * 0.35, Y - T * 1.25, T * 1.5, "rgba(140,200,255,A)", 0.4);
      drawProp("PROPS_OBJECTS", cp.on ? "checkpoint_on" : "checkpoint_off", X, Y + T * 0.04, PROP_H.checkpoint_on);
    }
    for (const sh of level.shards) {
      if (sh.taken) continue;
      const near = Math.abs(p.x - sh.x) < 2.5 && Math.abs(p.y - sh.y) < 3;
      const sniffed = p.form === "wolf" && Math.abs(p.x - sh.x) < 10 && Math.abs(p.y - sh.y) < 6;
      if (sh.secret && !near && !sniffed) continue;
      const X = sx(sh.x, cam);
      const Y = sy(sh.y - 0.55 + Math.sin(state.time * 3 + sh.x) * 0.1, cam);
      glow(X, Y, T * 0.8, "rgba(170,215,255,A)", 0.45);
      drawProp("PROPS_OBJECTS", "moon_shard", X, Y, PROP_H.moon_shard, { center: true });
    }
    // Scent trail to the nearest hidden shard while in wolf form.
    if (p.form === "wolf" && !p.dead) {
      const sh = level.shards.filter((s) => s.secret && !s.taken && Math.abs(s.x - p.x) < 14).sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0];
      if (sh) {
        for (let i = 1; i <= 6; i++) {
          const k = ((i + state.time * 2) % 6) / 6;
          const wx = p.x + (sh.x - p.x) * k;
          const wy = p.y - 0.4 + (sh.y - 0.4 - (p.y - 0.4)) * k + Math.sin(k * 9 + state.time * 3) * 0.2;
          glow(sx(wx, cam), sy(wy, cam), T * 0.25, "rgba(255,210,140,A)", 0.35 * (1 - Math.abs(k - 0.5)));
        }
      }
    }
    for (const o of state.orbs) {
      if (o.carrier) continue;
      const X = sx(o.x, cam);
      const Y = sy(o.y, cam);
      glow(X, Y, T * 0.55, "rgba(160,215,255,A)", 0.8);
      ctx.save();
      ctx.fillStyle = "#e9f5ff";
      ctx.beginPath();
      ctx.arc(X, Y, T * 0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawEnemies(state, cam) {
    const { T, W } = view;
    const p = state.player;
    for (const e of state.enemies) {
      const X = sx(e.x, cam);
      if (X < -T * 3 || X > W + T * 3) continue;
      const Y = sy(e.y, cam);
      const sheet = e.sheet || ENEMY_SHEET[e.type];
      if (!art.images[sheet]) continue;
      const fr = frameOf(sheet, e.anim, e.animProg, e.animT, e.animFps, false);
      if (!fr) continue;
      const k = UNIT[ENEMY_SHEET[e.type]] * T * (e.scale || 1);
      if (e.burn > 0) glow(X, Y - e.h * T * 0.5, T * 1.1, "rgba(255,120,40,A)", 0.35 + Math.random() * 0.15);
      if (e.frozen > 0) glow(X, Y - e.h * T * 0.5, T * 1.2, "rgba(140,220,255,A)", 0.55);
      const alpha = e.dead ? Math.max(0, 1 - Math.max(0, e.deathT - 0.5) / 0.6) : 1;
      if (e.marked > 0) glow(X, Y - e.h * T * 0.5, T * 1.1, "rgba(140,200,255,A)", 0.35);
      if (e.type === "mimic" && (e.revealed || (p.form === "wolf" && Math.abs(p.x - e.x) < 6))) glow(X, Y - T * 0.4, T * 1.2, "rgba(255,80,60,A)", 0.4);
      const flip = e.facing > 0; // enemy sheets face left
      drawAnchored(art.images[sheet], fr, X, Y + T * 0.04, k, flip, alpha);
      if (e.flash > 0) drawFlashOver(art.images[sheet], fr, X, Y + T * 0.04, k, flip, 0.7 * alpha);
      if (e.frozen > 0) drawFlashOver(art.images[sheet], fr, X, Y + T * 0.04, k, flip, 0.35 * alpha);
      if (e.type === "knight" && e.shield && e.cracked) {
        const cf = art.frames.FX_COMBAT.anims.armor_crack[3];
        const c = cf.content;
        const kk = (0.9 * T) / c.h;
        ctx.save();
        ctx.translate(X + e.facing * T * 0.45, Y - T * 1.05);
        ctx.globalAlpha = 0.85;
        ctx.drawImage(art.images.FX_COMBAT, c.x, c.y, c.w, c.h, (-c.w * kk) / 2, (-c.h * kk) / 2, c.w * kk, c.h * kk);
        ctx.restore();
      }
      if (e.type === "mimic" && e.disguised && p.form === "human" && Math.abs(p.x - e.x) < 8) drawBubble(X, Y - T * 1.2, "?");
      if (e.type === "stitcher" && e.state === "cast") {
        ctx.save();
        ctx.strokeStyle = "rgba(200,140,255,0.8)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(sx(e.castX, cam), sy(e.castY + 0.15, cam), T * 0.6, T * 0.18, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      if (!e.dead && e.hp < e.maxHp) {
        const bw = T * 0.9;
        ctx.fillStyle = "rgba(10,12,24,0.75)";
        ctx.fillRect(X - bw / 2, Y - e.h * T - T * 0.5, bw, 4);
        ctx.fillStyle = "#c23a3a";
        ctx.fillRect(X - bw / 2, Y - e.h * T - T * 0.5, (bw * Math.max(0, e.hp)) / e.maxHp, 4);
      }
      if (e.carrying) glow(X, Y + T * 0.1, T * 0.5, "rgba(160,215,255,A)", 0.9);
    }
  }

  function drawBubble(x, y, text) {
    const T = view.T;
    ctx.save();
    ctx.fillStyle = "rgba(235,240,255,0.92)";
    ctx.strokeStyle = "#0b0f1e";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, T * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#1a2040";
    ctx.font = `700 ${Math.round(T * 0.38)}px Cinzel, Georgia, serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y + 1);
    ctx.restore();
  }

  function drawAreaBoss(state, cam) {
    const b = state.boss;
    const T = view.T;
    const X = sx(b.x, cam);
    const Y = sy(b.y, cam);
    if (b.telegraph !== undefined && b.telegraph !== null) {
      const tx = sx(b.telegraph, cam);
      glow(tx, Y - T * 0.2, T * 1.6, "rgba(255,80,60,A)", 0.45 + Math.sin(state.time * 20) * 0.15);
    }
    if (!art.images[b.sheet]) return;
    const fr = frameOf(b.sheet, b.anim, b.animProg, b.animT, b.animFps, false);
    if (!fr) return;
    const base = b.rig === "human" ? 1.95 / 327 : b.rig === "wolf" ? 1.5 / 258 : 3.2 / 379;
    let k = base * T * (b.rig === "gen" ? b.scale : b.scale);
    if (b.rig === "wolf" && b.anim === RIGS.wolf.special) k *= 1.15;
    const alpha = (b.dead ? Math.max(0, 1 - b.deathT / 1.4) : 1) * (b.alpha ?? 1);
    if (alpha <= 0.02) return;
    glow(X, Y - b.h * T * 0.5, T * 2.4, "rgba(200,40,60,A)", 0.22 * alpha);
    drawAnchored(art.images[b.sheet], fr, X, Y + T * 0.05, k, b.facing < 0, alpha);
    if (b.flash > 0) drawFlashOver(art.images[b.sheet], fr, X, Y + T * 0.05, k, b.facing < 0, 0.6 * alpha);
    if (b.stagger > 0) {
      for (let i = 0; i < 3; i++) {
        const a = state.time * 4 + (i * Math.PI * 2) / 3;
        glow(X + Math.cos(a) * T * 0.6, Y - b.h * T - T * 0.3 + Math.sin(a) * T * 0.15, T * 0.22, "rgba(255,240,180,A)", 0.9);
      }
    }
  }

  function drawBoss(state, cam) {
    const b = state.boss;
    if (!b || !b.active) return;
    if (b.kind === "area") return drawAreaBoss(state, cam);
    const T = view.T;
    const X = sx(b.x, cam);
    const Y = sy(b.y, cam);
    const human = ["human_idle", "human_run", "human_slash", "transform"].includes(b.anim);
    const sheet = human ? "BOSS_HUMAN" : "BOSS_WOLF";
    const fr = frameOf(sheet, b.anim, b.animProg, b.animT, b.animFps, b.anim === "transform" && false);
    if (!fr) return;
    let k = UNIT[sheet] * T;
    if (b.anim === "eclipse_slam") k *= 1.25;
    const alpha = b.dead ? Math.max(0, 1 - b.deathT / 1.4) : 1;
    glow(X, Y - b.h * T * 0.5, T * 2, "rgba(200,30,40,A)", 0.25 * alpha);
    drawAnchored(art.images[sheet], fr, X, Y + T * 0.04, k, b.facing < 0, alpha);
    if (b.flash > 0) drawFlashOver(art.images[sheet], fr, X, Y + T * 0.04, k, b.facing < 0, 0.6);
    if (b.stagger > 0) {
      for (let i = 0; i < 3; i++) {
        const a = state.time * 4 + (i * Math.PI * 2) / 3;
        glow(X + Math.cos(a) * T * 0.5, Y - b.h * T - T * 0.3 + Math.sin(a) * T * 0.15, T * 0.2, "rgba(255,240,180,A)", 0.9);
      }
    }
    if (b.state === "lunge" && b.t < 0.35) glow(X, Y - T * 0.5, T * 1.2, "rgba(255,60,60,A)", 0.5);
  }

  function drawPlayer(state, cam) {
    const p = state.player;
    const T = view.T;
    const def = HERO[p.anim] || HERO["human.idle"];
    const [role, row, rev] = def;
    let sheet = skinKey(state.skinId || 1, role);
    if (!art.images[sheet]) sheet = skinKey(1, role);
    if (!art.images[sheet]) return;
    const fr = frameOf(sheet, row, p.animProg, p.animT, p.animFps || 10, rev);
    if (!fr) return;
    const X = sx(p.x, cam);
    let Y = sy(p.y, cam) + T * 0.04;
    const k = ROLE_UNIT[role] * T;
    if (p.anim === "human.hang") {
      // hands at the ledge lip
      const c = fr.content;
      const an = fr.anchor;
      Y = sy(p.hang ? p.hang.top : p.y - p.h, cam) + (an.y - c.y) * k - T * 0.05;
    }
    // soft moonlight rim behind the hero so the dark cloak reads on dark stone
    glow(X, Y - p.h * T * 0.55, T * 1.3, "rgba(150,180,255,A)", 0.16);
    if (p.eclipseT > 0) glow(X, Y - T * 1.3, T * 2.4, "rgba(150,200,255,A)", 0.35 + Math.sin(state.time * 6) * 0.08);
    let alpha = 1;
    if (p.invuln > 0 && !p.dead && Math.floor(p.invuln * 14) % 2 === 0) alpha = 0.45;
    drawAnchored(art.images[sheet], fr, X, Y, k, p.facing < 0, alpha);
    if (p.deflectFlash > 0) glow(X + p.facing * T * 0.6, Y - T, T * 0.9, "rgba(200,240,255,A)", 0.6);
  }

  function drawChain(x0, y0, x1, y1) {
    const T = view.T;
    const fr = art.frames.PROPS_OBJECTS.byName.chain_link;
    const c = fr.content;
    const len = Math.hypot(x1 - x0, y1 - y0);
    const ang = Math.atan2(y1 - y0, x1 - x0);
    const segW = T * 0.55;
    const k = segW / c.w;
    ctx.save();
    ctx.translate(x0, y0);
    ctx.rotate(ang);
    for (let d = 0; d < len - segW * 0.3; d += segW * 0.9) {
      ctx.drawImage(art.images.PROPS_OBJECTS, c.x, c.y, c.w, c.h, d, (-c.h * k) / 2, Math.min(segW, len - d), c.h * k);
    }
    const hf = art.frames.PROPS_OBJECTS.byName.hook_head.content;
    const hk = (T * 0.5) / hf.h;
    ctx.drawImage(art.images.PROPS_OBJECTS, hf.x, hf.y, hf.w, hf.h, len - hf.w * hk * 0.6, (-hf.h * hk) / 2, hf.w * hk, hf.h * hk);
    ctx.restore();
  }

  function drawLinks(state, cam) {
    const p = state.player;
    const T = view.T;
    const hx = sx(p.x + p.facing * 0.25, cam);
    const hy = sy(p.y - p.h * 0.85, cam);
    if (p.hookShot) {
      let tx;
      let ty;
      if (p.hookShot.miss) {
        tx = p.hookShot.tx;
        ty = p.hookShot.ty;
      } else if (p.hookShot.kind === "ring") {
        const r = state.level.rings.find((rg) => rg.id === p.hookShot.id);
        tx = r?.x;
        ty = r?.y;
      } else if (p.hookShot.kind === "boss") {
        tx = state.boss.x;
        ty = state.boss.y - state.boss.h * 0.55;
      } else {
        const e = state.enemies.find((en) => en.id === p.hookShot.id);
        tx = e?.x;
        ty = e ? e.y - e.h * 0.55 : undefined;
      }
      if (tx !== undefined) {
        const k = Math.min(1, p.hookShot.t / p.hookShot.dur);
        const ex = hx + (sx(tx, cam) - hx) * k;
        const ey = hy + (sy(ty, cam) - hy) * k;
        drawChain(hx, hy, ex, ey);
      }
    }
    if (p.swing) drawChain(sx(p.x, cam), sy(p.y - p.h * 0.9, cam), sx(p.swing.cx, cam), sy(p.swing.cy, cam));
    if (p.thread) {
      const e = state.enemies.find((en) => en.id === p.thread.id);
      if (e) {
        const x0 = sx(e.x, cam);
        const y0 = sy(e.y - 1.0, cam);
        const x1 = sx(p.x, cam);
        const y1 = sy(p.y - 0.1, cam);
        ctx.save();
        ctx.strokeStyle = "rgba(205,150,255,0.9)";
        ctx.lineWidth = Math.max(2, T * 0.05);
        ctx.beginPath();
        for (let i = 0; i <= 16; i++) {
          const k = i / 16;
          const x = x0 + (x1 - x0) * k;
          const y = y0 + (y1 - y0) * k + Math.sin(k * 12 + state.time * 10) * T * 0.08 * Math.sin(k * Math.PI);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.restore();
        glow(x1, y1, T * 0.6, "rgba(200,140,255,A)", 0.5);
      }
    }
  }

  function drawShots(state, cam) {
    const T = view.T;
    for (const s of state.shots) {
      const X = sx(s.x, cam);
      const Y = sy(s.y, cam);
      if (s.kind === "arrow" && (s.style === "gunner" || s.style === "pirate")) {
        glow(X, Y, T * 0.35, "rgba(255,200,120,A)", 0.8);
        ctx.save();
        ctx.fillStyle = "#ffe8b0";
        ctx.beginPath();
        ctx.arc(X, Y, T * 0.07, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (s.kind === "arrow") {
        const dirA = Math.atan2(s.vy, s.vx);
        drawProp("PROPS_OBJECTS", "arrow", X, Y, 0.2, { center: true, flip: s.vx > 0, rot: s.vx > 0 ? dirA : dirA - Math.PI });
        if (s.friendly) glow(X, Y, T * 0.4, "rgba(190,230,255,A)", 0.5);
      } else if (s.kind === "thread") {
        ctx.save();
        ctx.strokeStyle = "rgba(205,150,255,0.95)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(X, Y);
        ctx.lineTo(X - s.vx * T * 0.05, Y - s.vy * T * 0.05);
        ctx.stroke();
        ctx.restore();
        glow(X, Y, T * 0.35, "rgba(200,140,255,A)", 0.7);
      } else if (s.kind === "spirit") {
        const list = art.frames.FX_SPIRIT.anims.spirit_wolf;
        const fr = list[Math.floor(s.t * 14) % list.length];
        glow(X, Y, T * 1.4, "rgba(140,210,255,A)", 0.4);
        drawAnchored(art.images.FX_SPIRIT, fr, X, Y + T * 0.6, (1.6 * T) / 218, s.vx < 0, 0.9);
      } else if (s.kind === "fire" || s.kind === "orb" || s.kind === "drop") {
        const col = s.kind === "fire" ? "255,130,50" : hexRgb(s.color || "#ffffff");
        if (s.kind === "drop" && s.wait > 0) {
          glow(X, sy(14, cam) - T * 0.1, T * 0.6, `rgba(${col},A)`, 0.35);
          continue;
        }
        glow(X, Y, T * 0.55, `rgba(${col},A)`, 0.9);
        ctx.save();
        ctx.fillStyle = "#fff8ec";
        ctx.beginPath();
        ctx.arc(X, Y, T * 0.12, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (s.kind === "wave") {
        const list = art.frames.FX_SPIRIT.anims.ground_wave;
        const fr = list[Math.min(list.length - 1, 1 + (Math.floor(s.t * 10) % 3))];
        glow(X, Y - T * 0.4, T * 0.9, "rgba(200,60,80,A)", 0.4);
        drawAnchored(art.images.FX_SPIRIT, fr, X, Y, (1.1 * T) / 230, s.vx < 0, 1);
      }
    }
  }

  function drawCompanion(state, cam) {
    const c = state.companion;
    if (!c) return;
    const T = view.T;
    const list = art.frames.FX_SPIRIT.anims.spirit_wolf;
    const fr = list[Math.floor(state.time * 12) % list.length];
    const X = sx(c.x, cam);
    const Y = sy(c.y, cam);
    glow(X, Y - T * 0.4, T * 1, "rgba(140,230,255,A)", 0.35);
    drawAnchored(art.images.FX_SPIRIT, fr, X, Y, (1.1 * T) / 218, c.facing < 0, 0.75);
  }

  function drawBolts(state, cam) {
    if (!state.bolts || !state.bolts.length) return;
    const T = view.T;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = "rgba(255,240,120,0.95)";
    ctx.lineWidth = Math.max(2, T * 0.06);
    for (const b of state.bolts) {
      const x1 = sx(b.x1, cam);
      const y1 = sy(b.y1, cam);
      const x2 = sx(b.x2, cam);
      const y2 = sy(b.y2, cam);
      ctx.globalAlpha = 1 - b.t / 0.3;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      for (let i = 1; i < 6; i++) {
        const k = i / 6;
        ctx.lineTo(x1 + (x2 - x1) * k + Math.sin(i * 7 + b.t * 50) * T * 0.25, y1 + (y2 - y1) * k + Math.cos(i * 5 + b.t * 40) * T * 0.25);
      }
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawFx(state, cam) {
    const T = view.T;
    for (const f of state.fx) {
      const sheet = FX_SHEET[f.fx];
      const list = art.frames[sheet]?.anims[f.fx];
      if (!list) continue;
      const i = Math.min(list.length - 1, Math.floor((f.t / f.dur) * list.length));
      const fr = list[i];
      const c = fr.content || fr.source;
      let x = f.x;
      let y = f.y;
      if (f.follow) {
        const e = state.enemies.find((en) => en.id === f.follow);
        if (e) {
          x = e.x;
          y = e.y - e.h - 0.5;
        }
      }
      const k = ((1.8 * T) / 320) * f.scale;
      const X = sx(x, cam);
      const Y = sy(y, cam);
      ctx.save();
      ctx.globalAlpha = f.alpha ?? 1;
      ctx.translate(X, Y);
      if (f.rot) ctx.rotate(f.rot * f.flip);
      if (f.flip < 0) ctx.scale(-1, 1);
      const oy = f.ground ? -c.h * k : (-c.h * k) / 2;
      ctx.drawImage(art.images[sheet], c.x, c.y, c.w, c.h, (-c.w * k) / 2, oy, c.w * k, c.h * k);
      ctx.restore();
    }
    // persistent moon marks on marked enemies
    for (const e of state.enemies) {
      if (e.dead || e.marked <= 0) continue;
      const list = art.frames.FX_COMBAT.anims.moon_mark;
      const fr = list[3 + (Math.floor(state.time * 6) % 2)];
      const c = fr.content;
      const k = ((1.8 * T) / 320) * 0.45;
      ctx.save();
      ctx.globalAlpha = Math.min(1, e.marked);
      ctx.drawImage(art.images.FX_COMBAT, c.x, c.y, c.w, c.h, sx(e.x, cam) - (c.w * k) / 2, sy(e.y - e.h - 0.55, cam) - (c.h * k) / 2, c.w * k, c.h * k);
      ctx.restore();
    }
  }

  function drawTexts(state, cam) {
    const T = view.T;
    const size = Math.round(Math.max(12, Math.min(20, T * 0.34)));
    ctx.save();
    ctx.font = `700 ${size}px Cinzel, Georgia, serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    for (const t of state.texts) {
      const k = t.t / t.dur;
      const X = sx(t.x, cam);
      const Y = sy(t.y - k * 0.8, cam);
      ctx.globalAlpha = k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25;
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(8,10,22,0.9)";
      ctx.strokeText(t.text, X, Y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, X, Y);
    }
    ctx.restore();
  }

  function drawTarget(state, cam) {
    const p = state.player;
    if (p.dead || !p.target || p.form === "eclipse" || p.swing) return;
    if (p.form === "wolf" && state.level.altars.some((a) => Math.abs(a.x - p.x) < 1.1 && Math.abs(a.y - p.y) < 0.7)) return;
    const T = view.T;
    const X = sx(p.target.x, cam);
    const Y = sy(p.target.y, cam);
    const aiming = Boolean(p.aim);
    const r = T * (aiming ? 0.75 : 0.55) * (1 + Math.sin(state.time * 6) * 0.06);
    const color = p.form === "human" ? "rgba(170,215,255,0.95)" : "rgba(255,200,120,0.95)";
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, T * (aiming ? 0.08 : 0.05));
    for (let i = 0; i < 3; i++) {
      const a = state.time * 2 + (i * Math.PI * 2) / 3;
      ctx.beginPath();
      ctx.arc(X, Y, r, a, a + 1.2);
      ctx.stroke();
    }
    if (aiming) {
      ctx.setLineDash([6, 6]);
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.moveTo(sx(p.x, cam), sy(p.y - p.h * 0.7, cam));
      ctx.lineTo(X, Y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawOverlays(state) {
    const { W, H } = view;
    ctx.drawImage(vignette, 0, 0, W, H);
    if (state.hurtFlash > 0) {
      ctx.fillStyle = `rgba(160,20,30,${state.hurtFlash * 0.6})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (state.slowmo) {
      ctx.fillStyle = "rgba(40,70,140,0.18)";
      ctx.fillRect(0, 0, W, H);
    }
    const p = state.player;
    if (p.dead) {
      ctx.fillStyle = `rgba(4,4,10,${Math.min(0.85, p.deadT * 0.9)})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (state.respawnFade > 0) {
      ctx.fillStyle = `rgba(4,4,10,${state.respawnFade})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  function draw(state) {
    const { W, H } = view;
    if (!W || !H) return;
    ctx.fillStyle = "#070912";
    ctx.fillRect(0, 0, W, H);
    if (!art || !state.level || !state.player) return;
    const cam = { x: state.cam.x, y: state.cam.y };
    if (state.shake > 0) {
      cam.x += (Math.sin(state.time * 97) * state.shake * 0.12);
      cam.y += (Math.cos(state.time * 83) * state.shake * 0.12);
    }
    drawBackground(state, cam);
    // chasm darkness under the play area
    const pitY = sy(15.5, cam);
    const pg = ctx.createLinearGradient(0, pitY, 0, sy(18.5, cam));
    pg.addColorStop(0, "rgba(5,6,14,0)");
    pg.addColorStop(1, "rgba(5,6,14,0.95)");
    ctx.fillStyle = pg;
    ctx.fillRect(0, pitY, W, H - pitY);
    drawDecor(state, cam);
    drawShadows(state, cam);
    drawTiles(state, cam);
    drawLights(state, cam);
    drawObjects(state, cam);
    drawEnemies(state, cam);
    drawBoss(state, cam);
    drawLinks(state, cam);
    drawCompanion(state, cam);
    drawPlayer(state, cam);
    drawShots(state, cam);
    drawBolts(state, cam);
    drawFx(state, cam);
    drawTarget(state, cam);
    drawTexts(state, cam);
    // low drifting foreground fog
    const fy = sy(14.2, cam);
    const fg = ctx.createLinearGradient(0, fy - view.T * 1.5, 0, fy + view.T);
    fg.addColorStop(0, "rgba(90,110,160,0)");
    fg.addColorStop(0.6, `rgba(90,110,160,${0.12 + Math.sin(state.time * 0.7) * 0.04})`);
    fg.addColorStop(1, "rgba(90,110,160,0)");
    ctx.fillStyle = fg;
    ctx.fillRect(0, fy - view.T * 1.5, W, view.T * 2.5);
    drawOverlays(state);
  }

  return {
    resize,
    draw,
    consumeDirty() {
      const was = dirty;
      dirty = false;
      return was;
    },
    setArt(a) {
      art = a;
    },
    toScreen(wx, wy, cam) {
      return { x: sx(wx, cam) + (view.left || 0), y: sy(wy, cam) + (view.top || 0) };
    },
    destroy() {
      ro.disconnect();
    },
  };
}
