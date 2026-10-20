// The level's living parts: tiles, altars and the shadow platforms they raise,
// light cones that erase shadows, crumbling floors, pickups and checkpoints.

import { isSolidTile } from "./config.js";

export function tileAt(level, tx, ty) {
  if (tx < 0 || tx >= level.cols) return 1;
  if (ty < 0 || ty >= level.rows) return 0;
  return level.tiles[ty * level.cols + tx];
}

export const solidAt = (level, tx, ty) => isSolidTile(tileAt(level, tx, ty));

export function setTile(level, tx, ty, v) {
  if (tx < 0 || tx >= level.cols || ty < 0 || ty >= level.rows) return;
  level.tiles[ty * level.cols + tx] = v;
}

// True when a box (center x, feet y) overlaps any solid tile.
export function boxHitsSolid(level, x, y, w, h) {
  const x0 = Math.floor(x - w / 2 + 0.01);
  const x1 = Math.floor(x + w / 2 - 0.01);
  const y0 = Math.floor(y - h + 0.01);
  const y1 = Math.floor(y - 0.01);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (solidAt(level, tx, ty)) return true;
  return false;
}

export const WHEEL_SPEED = 0.7;

export function altarActive(level, altarId) {
  const a = level.altars.find((al) => al.id === altarId);
  return Boolean(a && a.activeT > 0);
}

function pointLit(lights, x, y) {
  for (const l of lights) {
    const dx = x - l.x;
    const dy = y - l.y;
    const d = Math.hypot(dx, dy);
    if (d > l.len || d < 0.01) continue;
    let da = Math.atan2(dy, dx) - l.ang;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    if (Math.abs(da) <= l.half) return true;
  }
  return false;
}

// Rebuild light cones (guard lamps + lantern hunters) and active platforms.
export function updateLightsAndPlatforms(state, dt) {
  const level = state.level;
  const lights = [];
  for (const lamp of level.lamps) {
    lamp.ang = lamp.base + Math.sin((state.time * Math.PI * 2) / lamp.period) * lamp.amp;
    lights.push({ x: lamp.x, y: lamp.y, ang: lamp.ang, half: 0.2, len: 11, kind: "lamp" });
  }
  for (const e of state.enemies) {
    if (e.type !== "lantern" || e.dead || !e.lanternOn) continue;
    const dir = e.facing;
    lights.push({
      x: e.x + dir * 0.5,
      y: e.y - 1.15,
      ang: dir > 0 ? 0.32 : Math.PI - 0.32,
      half: 0.42,
      len: 6.5,
      kind: "lantern",
    });
  }
  state.lights = lights;

  const plats = [];
  // Each shadow platform is split into tile-wide segments so a light cone
  // erases only the part it touches.
  for (const s of level.shadows) {
    const on = altarActive(level, s.altar);
    const n = Math.max(1, Math.round(s.w));
    const seg = s.w / n;
    if (!s.litMask || s.litMask.length !== n) s.litMask = new Array(n).fill(false);
    let anyLit = false;
    for (let i = 0; i < n; i++) {
      const lit = on && pointLit(lights, s.x + seg * (i + 0.5), s.y);
      s.litMask[i] = lit;
      anyLit = anyLit || lit;
      if (on && !lit) plats.push({ id: `${s.id}_${i}`, x: s.x + seg * i, y: s.y, w: seg + 0.001, dx: 0, dy: 0 });
    }
    s.lit = anyLit;
  }
  for (const wh of level.wheels) {
    wh.ang += WHEEL_SPEED * dt;
    const on = altarActive(level, wh.altar);
    for (let i = 0; i < 4; i++) {
      const a = wh.ang + (i * Math.PI) / 2;
      const pa = a - WHEEL_SPEED * dt;
      const px = wh.cx + Math.cos(a) * wh.r;
      const py = wh.cy + Math.sin(a) * wh.r;
      wh.lit[i] = on && pointLit(lights, px, py);
      if (on && !wh.lit[i]) {
        plats.push({
          id: `${wh.id}_${i}`,
          x: px - 0.9,
          y: py,
          w: 1.8,
          dx: px - (wh.cx + Math.cos(pa) * wh.r),
          dy: py - (wh.cy + Math.sin(pa) * wh.r),
        });
      }
    }
  }
  state.plats = plats;
}

// A fragile floor column starts crumbling when something heavy stands on it.
export function touchFragile(state, x, y, delay) {
  const level = state.level;
  const tx = Math.floor(x);
  const ty = Math.floor(y + 0.05);
  if (tileAt(level, tx, ty) !== 3) return;
  if (state.crumble.some((c) => c.x === tx)) return;
  state.crumble.push({ x: tx, y: ty, t: -delay });
}

export function breakColumn(level, tx, ty, kind) {
  let y = ty;
  while (y > 0 && tileAt(level, tx, y - 1) === kind) y--;
  const broken = [];
  while (tileAt(level, tx, y) === kind) {
    setTile(level, tx, y, 0);
    broken.push(y);
    y++;
  }
  return broken;
}

export function updateCrumble(state, dt, env) {
  for (const c of state.crumble) {
    c.t += dt;
    if (c.t >= 0 && !c.done) {
      c.done = true;
      const ys = breakColumn(state.level, c.x, c.y, 3);
      if (ys.length) {
        env.fx("dust", c.x + 0.5, ys[0] + 0.6, { scale: 1.1 });
        env.sfx("break");
      }
    }
  }
  state.crumble = state.crumble.filter((c) => !c.done || c.t < 0.5);
}
