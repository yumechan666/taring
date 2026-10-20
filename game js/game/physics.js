// Box-vs-tile movement. Entities are { x (center), y (feet), w, h, vx, vy }.
// Planks and shadow platforms are one-way: solid only when landing from above.

import { tileAt, solidAt } from "./world.js";
import { isSolidTile } from "./config.js";

export function moveEntity(state, e, dt, opts = {}) {
  const level = state.level;
  const plats = opts.noPlatforms ? [] : state.plats || [];
  const drop = Boolean(opts.dropThrough);
  const wasGround = e.onGround;
  e.onGround = false;
  e.hitWall = 0;
  e.hitCeil = false;
  e.groundTile = 0;

  // Ride a moving platform we stood on last frame.
  if (wasGround && e.platId) {
    const p = plats.find((pl) => pl.id === e.platId);
    if (p) {
      e.x += p.dx;
      e.y += p.dy;
    }
  }
  e.platId = null;

  const dist = Math.max(Math.abs(e.vx * dt), Math.abs(e.vy * dt));
  const steps = Math.max(1, Math.ceil(dist / 0.35));
  const sdt = dt / steps;
  for (let s = 0; s < steps; s++) {
    // Horizontal
    let nx = e.x + e.vx * sdt;
    const top = e.y - e.h + 0.04;
    const bot = e.y - 0.04;
    if (e.vx !== 0) {
      const dir = e.vx > 0 ? 1 : -1;
      const edge = nx + (dir * e.w) / 2;
      const tx = Math.floor(edge);
      for (let ty = Math.floor(top); ty <= Math.floor(bot); ty++) {
        if (solidAt(level, tx, ty)) {
          nx = dir > 0 ? tx - e.w / 2 - 0.001 : tx + 1 + e.w / 2 + 0.001;
          e.vx = 0;
          e.hitWall = dir;
          break;
        }
      }
    }
    e.x = nx;

    // Vertical
    let ny = e.y + e.vy * sdt;
    const l = e.x - e.w / 2 + 0.04;
    const r = e.x + e.w / 2 - 0.04;
    if (e.vy >= 0) {
      const row = Math.floor(ny);
      if (e.y <= row + 0.0001 && ny >= row) {
        for (let tx = Math.floor(l); tx <= Math.floor(r); tx++) {
          const t = tileAt(level, tx, row);
          if (isSolidTile(t) || (t === 2 && !drop)) {
            ny = row;
            e.vy = 0;
            e.onGround = true;
            e.groundTile = t;
            break;
          }
        }
      }
      if (!e.onGround && !drop) {
        for (const p of plats) {
          if (r < p.x || l > p.x + p.w) continue;
          if (e.y <= p.y + 0.06 && ny >= p.y) {
            ny = p.y;
            e.vy = 0;
            e.onGround = true;
            e.platId = p.id;
            break;
          }
        }
      }
    } else {
      const headOld = Math.floor(e.y - e.h);
      const headNew = Math.floor(ny - e.h);
      if (headNew < headOld) {
        for (let tx = Math.floor(l); tx <= Math.floor(r); tx++) {
          if (solidAt(level, tx, headNew)) {
            ny = headNew + 1 + e.h + 0.001;
            e.vy = 0;
            e.hitCeil = true;
            break;
          }
        }
      }
    }
    e.y = ny;
  }

  // Stay glued to a platform that moved down a little since last frame.
  if (!e.onGround && wasGround && e.vy >= 0 && !drop) {
    for (const p of plats) {
      if (e.x + e.w / 2 < p.x || e.x - e.w / 2 > p.x + p.w) continue;
      if (e.y >= p.y - 0.02 && e.y <= p.y + 0.25) {
        e.y = p.y;
        e.vy = 0;
        e.onGround = true;
        e.platId = p.id;
        break;
      }
    }
  }
  return e;
}

// Is there floor under a point slightly ahead (used by patrolling enemies)?
export function floorAhead(state, x, y) {
  const t = tileAt(state.level, Math.floor(x), Math.floor(y + 0.1));
  return isSolidTile(t) || t === 2;
}
