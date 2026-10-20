// The hunters that chase the wolf. Each type answers one of the two forms:
// archers (deflect), lantern hunters (hook the lantern), thorn knights
// (crack then hook), moon crows, clockwork hounds, shadow tailors, mimics.

import { ENEMY_STATS, GRAVITY, clamp } from "./config.js";
import { moveEntity } from "./physics.js";
import { rectOf, overlap, damagePlayer, killEnemy, applyEnemyHit } from "./combat.js";
import { applyBossHit } from "./boss.js";
import { touchFragile, solidAt, boxHitsSolid } from "./world.js";
import { VARIANTS } from "./areas.js";

// Spawns are authored at the default ground row, so an enemy placed over a
// raised floor (train cars, steps) would start inside it. Lift ground enemies
// one tile at a time until their box is clear, so they stand on the surface.
export function settleEnemy(level, e) {
  if (e.fly) return e;
  let y = e.y;
  for (let i = 0; i < 24 && boxHitsSolid(level, e.x, y, e.w, e.h); i++) y -= 1;
  e.y = y;
  e.homeY = y;
  return e;
}

export function makeEnemy(spec, id, hpMul = 1) {
  const v = VARIANTS[spec.type] || null;
  const base = v ? v.base : spec.type;
  const st = ENEMY_STATS[base];
  const hp = Math.max(1, Math.round((v ? v.hp : st.hp) * hpMul * (spec.hpMul || 1) * 2) / 2);
  return {
    id,
    type: base,
    variant: v ? spec.type : null,
    sheet: v ? v.sheet : null,
    scale: v && v.scale ? v.scale : 1,
    vp: v || null,
    split: Boolean(spec.split),
    burn: 0,
    frozen: 0,
    x: spec.x,
    y: spec.y,
    w: v && v.w ? v.w : st.w,
    h: v && v.h ? v.h : st.h,
    hp,
    maxHp: hp,
    fly: Boolean(st.fly),
    vx: 0,
    vy: 0,
    facing: -1,
    onGround: false,
    platId: null,
    home: spec.x,
    homeY: spec.y,
    range: spec.range ?? 3,
    state: "idle",
    t: Math.random() * 3,
    cd: 1 + Math.random() * 1.5,
    stun: 0,
    flash: 0,
    marked: 0,
    dead: false,
    deathT: 0,
    anim: "idle",
    animT: 0,
    animProg: -1,
    animFps: 8,
    shield: spec.type === "knight",
    cracked: false,
    lanternOn: base === "lantern" && !(v && v.noLight),
    disguised: base === "mimic",
    revealed: false,
    carrying: false,
    pull: null,
    turnT: 0,
    alert: false,
    targetX: spec.x,
    fired: false,
  };
}

function setAnim(e, key, dt, prog = -1, fps = 8) {
  if (e.anim !== key) {
    e.anim = key;
    e.animT = 0;
  } else e.animT += dt;
  e.animProg = prog;
  e.animFps = fps;
}

function attackBox(e, reach, height, offY = 0) {
  return { l: e.x + (e.facing > 0 ? 0 : -reach), r: e.x + (e.facing > 0 ? reach : 0), t: e.y - height - offY, b: e.y - offY };
}

function hitPlayerIf(state, env, box, dmg, fromX, slow = 0) {
  const p = state.player;
  if (overlap(box, rectOf(p))) return damagePlayer(state, env, dmg, fromX, slow);
  return false;
}

export function updateEnemies(state, dt, env) {
  const p = state.player;
  for (const e of state.enemies) {
    if (e.dead) {
      e.deathT += dt;
      if (!e.fly) {
        e.vy = Math.min(e.vy + GRAVITY * dt, 20);
        e.vx *= 0.9;
        moveEntity(state, e, dt, { noPlatforms: false });
      } else {
        e.vy = Math.min(e.vy + GRAVITY * 0.5 * dt, 12);
        e.y += e.vy * dt;
      }
      setAnim(e, e.type === "mimic" ? "hurt" : "hurt", dt, clamp(e.deathT / 0.5, 0, 0.99));
      continue;
    }
    const dx = p.x - e.x;
    const dist = Math.abs(dx);
    if (dist > 24 && !e.carrying) continue; // asleep off-screen
    e.flash = Math.max(0, e.flash - dt);
    e.marked = Math.max(0, e.marked - dt);
    e.stun = Math.max(0, e.stun - dt);
    e.cd -= dt;
    e.t += dt;

    if (e.pull) {
      e.pull.t += dt;
      e.vx = (e.pull.tx - e.x) * 14;
      if (e.pull.t > 0.22) e.pull = null;
    }

    // Skin statuses: burning ticks damage, frozen enemies stand still.
    if (e.burn > 0) {
      e.burn -= dt;
      e.hp -= 0.8 * dt;
      if (Math.random() < dt * 6) env.fx("hit_spark", e.x + (Math.random() - 0.5) * e.w, e.y - Math.random() * e.h, { scale: 0.25, dur: 0.25 });
      if (e.hp <= 0) {
        killEnemy(state, env, e);
        continue;
      }
    }
    if (e.frozen > 0) {
      e.frozen -= dt;
      e.vx = 0;
      if (!e.fly) {
        e.vy = Math.min(e.vy + GRAVITY * dt, 20);
        moveEntity(state, e, dt);
      }
      continue;
    }
    const slowHit = e.vp && e.vp.slowOnHit ? e.vp.slowOnHit : 0;
    const stunned = e.stun > 0 && !e.pull;
    const prog = (d) => clamp(e.t / d, 0, 0.999);
    switch (e.type) {
      case "archer": {
        if (stunned) {
          e.state = "idle";
          setAnim(e, "hurt", dt, 0.3);
          break;
        }
        if (dist < 13) e.facing = dx > 0 ? 1 : -1;
        if (e.state === "shoot") {
          setAnim(e, "shoot", dt, prog(0.75));
          const vp = e.vp || {};
          const burst = vp.burst || 1;
          const speed = vp.shotSpeed || 11;
          if (e.t >= 0.45 + (e.shotsFired || 0) * 0.13 && (e.shotsFired || 0) < burst) {
            e.shotsFired = (e.shotsFired || 0) + 1;
            const ty = p.y - 0.9;
            const sy = e.y - 1.15;
            const flight = Math.max(0.3, dist / speed);
            const baseVy = clamp((ty - sy) / flight, -3, 3);
            const fan = vp.fan || 1;
            for (let f = 0; f < fan; f++) {
              const spread = fan > 1 ? (f - (fan - 1) / 2) * 2.4 : 0;
              state.shots.push({ id: `ar${state.nextId++}`, kind: "arrow", style: e.variant || "arrow", x: e.x + e.facing * 0.6, y: sy, vx: e.facing * speed, vy: baseVy + spread, t: 0, friendly: false, owner: e.id, slow: slowHit });
            }
            env.sfx("arrow");
          }
          if (e.t >= 0.75 + burst * 0.13) {
            e.state = "idle";
            e.shotsFired = 0;
            e.cd = (vp.interval || Number(env.tweak("archerInterval"))) * (0.8 + Math.random() * 0.4);
          }
        } else {
          setAnim(e, "idle", dt, -1, 6);
          if (e.cd <= 0 && dist < 11 && Math.abs(p.y - e.y) < 6 && !p.dead) {
            e.state = "shoot";
            e.t = 0;
            e.fired = false;
            e.shotsFired = 0;
          }
        }
        e.vx *= 0.8;
        break;
      }
      case "lantern": {
        if (stunned) {
          setAnim(e, "hurt", dt, 0.25);
          e.state = "walk";
          break;
        }
        if (e.state === "swing") {
          setAnim(e, "swing", dt, prog(0.8));
          if (e.t > 0.35 && e.t < 0.55) hitPlayerIf(state, env, attackBox(e, 1.7, 1.8), 1, e.x, slowHit);
          if (e.t >= 0.8) {
            e.state = "walk";
            e.cd = 1.2;
          }
          e.vx *= 0.8;
          break;
        }
        const sees = dist < 7 && Math.sign(dx) === e.facing && Math.abs(p.y - e.y) < 3;
        if (sees || (dist < 3 && Math.abs(p.y - e.y) < 2)) {
          e.facing = dx > 0 ? 1 : -1;
          e.vx = e.facing * 2.2;
          if (dist < 1.7 && e.cd <= 0) {
            e.state = "swing";
            e.t = 0;
          }
        } else {
          if (e.x > e.home + e.range) e.facing = -1;
          if (e.x < e.home - e.range) e.facing = 1;
          e.vx = e.facing * 1.3;
        }
        if (!groundAheadFor(state, e)) {
          e.facing *= -1;
          e.vx = 0;
        }
        setAnim(e, "walk", dt, -1, Math.abs(e.vx) > 2 ? 9 : 6);
        break;
      }
      case "knight": {
        if (stunned) {
          setAnim(e, "hurt", dt, 0.2);
          e.vx *= 0.85;
          break;
        }
        if (e.state === "bash") {
          setAnim(e, "bash", dt, prog(0.9));
          if (e.t > 0.35 && e.t < 0.55) {
            e.vx = e.facing * 6;
            hitPlayerIf(state, env, attackBox(e, 1.4, 1.9), 1, e.x, slowHit);
          } else e.vx *= 0.8;
          if (e.t >= 0.9) {
            e.state = "walk";
            e.cd = 1.6;
          }
          break;
        }
        if (Math.sign(dx) !== e.facing && dist < 10) {
          e.turnT += dt;
          if (e.turnT > 0.9) {
            e.facing *= -1;
            e.turnT = 0;
          }
        } else e.turnT = 0;
        if (dist < 9 && Math.sign(dx) === e.facing) e.vx = e.facing * 1.1;
        else e.vx *= 0.8;
        if (!groundAheadFor(state, e)) e.vx = 0;
        if (dist < 2.1 && Math.sign(dx) === e.facing && e.cd <= 0 && Math.abs(p.y - e.y) < 1.5) {
          e.state = "bash";
          e.t = 0;
        }
        // Spikes on the shield side hurt on contact.
        if (e.shield && Math.sign(dx) === e.facing && dist < e.w / 2 + p.w / 2 + 0.15 && Math.abs(p.y - e.y) < 1.8) damagePlayer(state, env, 1, e.x, slowHit);
        setAnim(e, "walk", dt, -1, Math.abs(e.vx) > 0.3 ? 6 : 0);
        break;
      }
      case "crow": {
        e.vx = 0;
        if (stunned) {
          e.y = Math.min(e.y + 2 * dt, e.homeY + 3);
          setAnim(e, "hurt", dt, 0.3);
          break;
        }
        if (e.carrying) {
          e.x += 4.5 * Math.sign(e.x - p.x || 1) * dt;
          e.y = Math.max(1, e.y - 2 * dt);
          e.facing = e.x > p.x ? 1 : -1;
          setAnim(e, "fly", dt, -1, 12);
          e.flee = (e.flee || 0) + dt;
          if (e.flee > 7) {
            e.dead = true;
            e.deathT = 2;
          }
          break;
        }
        const orb = state.orbs.find((o) => !o.carrier && Math.abs(o.x - e.x) < 9 && Math.abs(o.y - e.y) < 9);
        if (orb && e.state !== "swoop") {
          const ox = orb.x - e.x;
          const oy = orb.y - e.y;
          const od = Math.hypot(ox, oy);
          e.x += (ox / od) * 6.5 * dt;
          e.y += (oy / od) * 6.5 * dt;
          e.facing = ox > 0 ? 1 : -1;
          if (od < 0.6) {
            orb.carrier = e.id;
            e.carrying = true;
            env.text("Gagak mencuri energi!", e.x, e.y - 1, "#d9b8ff");
            env.sfx("caw");
          }
          setAnim(e, "fly", dt, -1, 14);
          break;
        }
        if (e.state === "swoop") {
          const sx = e.sx - e.x;
          const sy = e.sy - e.y;
          const sd = Math.hypot(sx, sy);
          if (e.t < 0.9 && sd > 0.3) {
            const sp = (e.vp && e.vp.swoopSpeed) || 9;
            e.x += (sx / sd) * sp * dt;
            e.y += (sy / sd) * sp * dt;
            hitPlayerIf(state, env, rectOf(e), 1, e.x, slowHit);
          } else {
            e.y -= 5 * dt;
            if (e.y <= e.homeY) {
              e.state = "idle";
              e.cd = 3 + Math.random();
              e.home = e.x;
            }
          }
          setAnim(e, "swoop", dt, clamp(e.t / 0.9, 0, 0.99));
          break;
        }
        e.x += (e.home + Math.sin(e.t * 0.8) * 2 - e.x) * Math.min(1, dt * 2);
        e.y += (e.homeY + Math.sin(e.t * 1.7) * 0.4 - e.y) * Math.min(1, dt * 2);
        e.facing = dx > 0 ? 1 : -1;
        if (e.cd <= 0 && dist < 7 && !p.dead) {
          e.state = "swoop";
          e.t = 0;
          e.sx = p.x;
          e.sy = p.y - 0.6;
          env.sfx("caw");
        }
        setAnim(e, "fly", dt, -1, 10);
        break;
      }
      case "hound": {
        if (stunned) {
          setAnim(e, "hurt", dt, 0.3);
          e.vx *= 0.85;
          break;
        }
        if (state.noise && state.noise.t > 0 && Math.abs(state.noise.x - e.x) < 18 && Math.abs(state.noise.y - e.y) < 6) {
          e.targetX = state.noise.x;
          e.alert = true;
        }
        if (e.vp && e.vp.hunter && dist < 14 && Math.abs(p.y - e.y) < 5) {
          e.targetX = p.x;
          e.alert = true;
        }
        if (e.state === "bite") {
          setAnim(e, "bite", dt, prog(0.6));
          if (e.t > 0.25 && e.t < 0.45) hitPlayerIf(state, env, attackBox(e, 1.5 * e.scale, 1.0 * e.scale), 1, e.x, slowHit);
          if (e.t >= 0.6) {
            e.state = "run";
            e.cd = 1;
          }
          e.vx *= 0.85;
          break;
        }
        if (dist < 1.7 && Math.abs(p.y - e.y) < 1.2 && e.cd <= 0) {
          e.facing = dx > 0 ? 1 : -1;
          e.state = "bite";
          e.t = 0;
          break;
        }
        if (e.alert) {
          const tdx = e.targetX - e.x;
          if (Math.abs(tdx) < 0.4) {
            e.alert = false;
            e.vx = 0;
          } else {
            e.facing = tdx > 0 ? 1 : -1;
            e.vx = e.facing * ((e.vp && e.vp.speed) || Number(env.tweak("houndSpeed")));
          }
        } else e.vx *= 0.8;
        if (e.onGround && e.groundTile === 3) touchFragile(state, e.x, e.y, 0.05);
        setAnim(e, "run", dt, -1, Math.abs(e.vx) > 0.5 ? 14 : 0);
        break;
      }
      case "stitcher": {
        const threaded = p.thread && p.thread.id === e.id;
        if (stunned) {
          e.y = Math.min(e.y + 1.5 * dt, e.homeY + 1.6);
          setAnim(e, "hurt", dt, 0.4);
          break;
        }
        e.x += (e.home + Math.sin(e.t * 0.6) * 1.2 - e.x) * Math.min(1, dt * 2);
        e.y += (e.homeY + Math.sin(e.t * 2) * 0.25 - e.y) * Math.min(1, dt * 3);
        e.facing = dx > 0 ? 1 : -1;
        if (e.state === "cast") {
          setAnim(e, "cast", dt, prog(0.6));
          if (e.t >= 0.55 && !e.fired) {
            e.fired = true;
            const tx = e.castX - e.x;
            const ty = e.castY - (e.y - 1);
            const d = Math.hypot(tx, ty) || 1;
            const fire = e.vp && e.vp.fire;
            state.shots.push({ id: `th${state.nextId++}`, kind: fire ? "fire" : "thread", style: e.variant || "thread", x: e.x, y: e.y - 1, vx: (tx / d) * 13, vy: (ty / d) * 13, t: 0, friendly: false, owner: e.id });
            env.sfx(fire ? "arrow" : "thread");
          }
          if (e.t >= 0.6) {
            e.state = "idle";
            e.cd = 3.4;
          }
          break;
        }
        if (!threaded && e.cd <= 0 && dist < 8 && !p.dead) {
          e.state = "cast";
          e.t = 0;
          e.fired = false;
          e.castX = p.x;
          e.castY = p.y - 0.2;
        }
        setAnim(e, "float", dt, -1, 6);
        break;
      }
      case "mimic": {
        if (e.disguised) {
          setAnim(e, "disguise", dt, -1, 5);
          if (p.form === "wolf" && dist < 6) {
            e.disguised = false;
            e.revealed = true;
            e.state = "reveal";
            e.t = 0;
            env.text("Tak ada bau kawanan — palsu!", e.x, e.y - 1.4, "#ffd2a8");
            env.sfx("growl");
          } else if (dist < 1.8 && Math.abs(p.y - e.y) < 1.5) {
            e.disguised = false;
            e.state = "ambush";
            e.t = 0;
            e.facing = dx > 0 ? 1 : -1;
            env.sfx("growl");
          }
          break;
        }
        if (e.h < 1.3) e.h = 1.35;
        if (stunned) {
          setAnim(e, "hurt", dt, 0.3);
          e.vx *= 0.85;
          break;
        }
        if (e.state === "ambush") {
          setAnim(e, "reveal", dt, prog(0.35));
          if (e.t > 0.25 && !e.fired) {
            e.fired = true;
            hitPlayerIf(state, env, attackBox(e, 1.9, 1.4), 1, e.x, slowHit);
          }
          if (e.t > 0.6) e.state = "hunt";
          break;
        }
        if (e.state === "reveal") {
          setAnim(e, "reveal", dt, prog(0.6));
          if (e.t > 0.6) e.state = "hunt";
          break;
        }
        if (e.state === "attack") {
          setAnim(e, "attack", dt, prog(0.7));
          if (e.t > 0.25 && e.t < 0.45) {
            e.vx = e.facing * 5;
            hitPlayerIf(state, env, attackBox(e, 1.5, 1.3), 1, e.x, slowHit);
          } else e.vx *= 0.8;
          if (e.t >= 0.7) {
            e.state = "hunt";
            e.cd = 1.1;
          }
          break;
        }
        e.facing = dx > 0 ? 1 : -1;
        e.vx = dist > 1.2 && dist < 12 ? e.facing * 2.6 : 0;
        if (!groundAheadFor(state, e)) e.vx = 0;
        if (dist < 1.6 && e.cd <= 0) {
          e.state = "attack";
          e.t = 0;
        }
        setAnim(e, "attack", dt, Math.abs(e.vx) > 0.5 ? (e.animT * 0.6) % 0.4 : 0);
        break;
      }
      default:
        break;
    }

    if (!e.fly) {
      e.vy = Math.min(e.vy + GRAVITY * dt, 20);
      moveEntity(state, e, dt);
      if (e.y > state.level.rows + 2) {
        killEnemy(state, env, e);
        env.text("Jatuh!", e.x, state.level.rows - 1, "#ffd2a8");
      }
    }
  }
  state.enemies = state.enemies.filter((e) => !e.dead || e.deathT < 1.1);
}

function groundAheadFor(state, e) {
  const ax = e.x + e.facing * (e.w / 2 + 0.2);
  if (solidAt(state.level, Math.floor(ax), Math.floor(e.y - 0.5))) return false;
  const t = state.level.tiles[Math.floor(e.y + 0.1) * state.level.cols + Math.floor(ax)];
  return t === 1 || t === 2 || t === 3 || t === 4 || t === 5;
}

// Arrows, threads, the Eclipse spirit wolf and the boss's ground waves.
export function updateShots(state, dt, env) {
  const p = state.player;
  for (const s of state.shots) {
    s.t += dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    if (s.kind === "arrow") {
      if (solidAt(state.level, Math.floor(s.x), Math.floor(s.y)) || s.t > 3) s.gone = true;
      else if (!s.friendly) {
        const pr = rectOf(p);
        if (s.x > pr.l && s.x < pr.r && s.y > pr.t && s.y < pr.b) {
          s.gone = true;
          damagePlayer(state, env, 1, s.x - s.vx, s.slow || 0);
        }
      } else {
        for (const e of state.enemies) {
          if (e.dead) continue;
          const r = rectOf(e);
          if (s.x > r.l && s.x < r.r && s.y > r.t && s.y < r.b) {
            s.gone = true;
            applyEnemyHit(state, env, e, { kind: "arrow", form: "human", dmg: 2, dir: Math.sign(s.vx), fromX: s.x - s.vx, knock: 3, ignoreShield: false });
            break;
          }
        }
      }
    } else if (s.kind === "thread") {
      if (s.t > 1.2 || solidAt(state.level, Math.floor(s.x), Math.floor(s.y))) s.gone = true;
      const pr = rectOf(p);
      if (!s.gone && s.x > pr.l - 0.2 && s.x < pr.r + 0.2 && s.y > pr.t && s.y < pr.b + 0.3 && p.invuln <= 0) {
        s.gone = true;
        p.thread = { id: s.owner, t: 4.5 };
        env.text("Terjahit! Tebas benangnya", p.x, p.y - 2, "#d9b8ff");
        env.sfx("thread");
      }
    } else if (s.kind === "spirit") {
      if (s.t > 1.3) s.gone = true;
      const box = { x: s.x, y: s.y, w: 2.2, h: 1.6, dmg: 4, dir: Math.sign(s.vx), fromX: s.x - s.vx, form: "eclipse", kind: "spirit", ignoreShield: true, knock: 6, heavy: true, ids: s.ids };
      const r = { l: s.x - 1.1, r: s.x + 1.1, t: s.y - 0.8, b: s.y + 0.8 };
      for (const e of state.enemies) {
        if (e.dead || s.ids.includes(e.id)) continue;
        if (overlap(r, rectOf(e))) {
          s.ids.push(e.id);
          applyEnemyHit(state, env, e, box);
        }
      }
      const b = state.boss;
      if (b && b.active && !b.dead && !s.ids.includes("boss") && overlap(r, rectOf(b))) {
        s.ids.push("boss");
        applyBossHit(state, env, box);
      }
    } else if (s.kind === "fire" || s.kind === "orb") {
      if (s.t > (s.kind === "orb" ? 2.6 : 1.4) || (s.kind === "fire" && solidAt(state.level, Math.floor(s.x), Math.floor(s.y)))) s.gone = true;
      const pr = rectOf(p);
      if (!s.gone && s.x > pr.l - 0.15 && s.x < pr.r + 0.15 && s.y > pr.t && s.y < pr.b) {
        s.gone = true;
        damagePlayer(state, env, 1, s.x - s.vx);
      }
    } else if (s.kind === "drop") {
      if (s.wait > 0) {
        s.wait -= dt;
        s.x -= s.vx * dt;
        s.y -= s.vy * dt;
        continue;
      }
      s.vy = Math.min(s.vy + 30 * dt, 16);
      if (solidAt(state.level, Math.floor(s.x), Math.floor(s.y)) || s.y > state.level.rows + 1) {
        s.gone = true;
        env.fx("hit_spark", s.x, s.y - 0.2, { scale: 0.4 });
      }
      const pr = rectOf(p);
      if (!s.gone && s.x > pr.l - 0.25 && s.x < pr.r + 0.25 && s.y > pr.t && s.y < pr.b) {
        s.gone = true;
        damagePlayer(state, env, 1, s.x);
      }
    } else if (s.kind === "wave") {
      if (s.t > s.life || solidAt(state.level, Math.floor(s.x + Math.sign(s.vx) * 0.5), Math.floor(s.y - 0.5))) s.gone = true;
      const r = { l: s.x - 0.6, r: s.x + 0.6, t: s.y - 0.9, b: s.y + 0.1 };
      if (!s.gone && !s.hitPlayer && overlap(r, rectOf(p))) {
        s.hitPlayer = true;
        damagePlayer(state, env, 1, s.x - s.vx);
      }
    }
  }
  state.shots = state.shots.filter((s) => !s.gone);
}
