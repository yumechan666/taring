// Bosses of the ten new areas: one engine, different sheets and special moves
// (charge, ground waves, falling swarms, summons, burrow, sound rings,
// teleport). Every boss has a melee attack and gets faster below half health.

import { GRAVITY, clamp } from "./config.js";
import { moveEntity } from "./physics.js";
import { rectOf, overlap, damagePlayer, addCombo, gainUlti } from "./combat.js";

export const RIGS = {
  human: { idle: "human_idle", move: "human_run", attack: "human_slash", special: "transform" },
  wolf: { idle: "wolf_idle", move: "wolf_run", attack: "wolf_lunge", special: "eclipse_slam" },
  gen: { idle: "idle", move: "move", attack: "attack", special: "special" },
};
const BOX = { human: { w: 0.9, h: 2.2 }, wolf: { w: 1.8, h: 1.4 }, gen: { w: 1.4, h: 2.6 } };

export function createAreaBoss(area, spec) {
  const d = area.bossDef;
  const box = BOX[d.rig];
  const s = d.rig === "gen" ? 1 : d.scale / 1.4;
  return {
    kind: "area",
    id: "boss",
    name: area.boss,
    color: area.color || "#ffffff",
    sheet: d.sheet,
    rig: d.rig,
    scale: d.scale,
    speed: d.speed,
    range: d.range,
    specials: d.specials,
    specialIdx: 0,
    monsters: area.monsters,
    x: spec.x,
    y: spec.y,
    w: box.w * s,
    h: box.h * s,
    vx: 0,
    vy: 0,
    onGround: false,
    platId: null,
    hp: d.hp,
    maxHp: d.hp,
    facing: -1,
    active: false,
    dead: false,
    deathT: 0,
    state: "intro",
    t: 0,
    cd: 1.5,
    scd: 5,
    stagger: 0,
    flash: 0,
    phase: 1,
    alpha: 1,
    anim: "idle",
    animT: 0,
    animProg: -1,
    animFps: 8,
  };
}

function setAnim(b, role, dt, prog = -1, fps = 8) {
  const key = RIGS[b.rig][role];
  if (b.anim !== key) {
    b.anim = key;
    b.animT = 0;
  } else b.animT += dt;
  b.animProg = prog;
  b.animFps = fps;
}

export function applyAreaBossHit(state, env, hit) {
  const b = state.boss;
  if (!b || b.dead || !b.active || b.state === "intro" || b.state === "under" || b.alpha < 0.5) return false;
  const mult = b.stagger > 0 ? 1.5 : 1;
  b.hp -= hit.dmg * mult;
  b.flash = 0.12;
  addCombo(state);
  gainUlti(state, 3, env);
  if (!hit.echo) env.sfx("hit");
  env.fx("hit_spark", b.x - (hit.dir || 1) * 0.2 + (hit.echo ? 0.3 : 0), b.y - b.h * 0.6, { scale: 0.7 });
  state.hitstop = Math.max(state.hitstop, 0.05);
  if (b.phase === 1 && b.hp < b.maxHp * 0.5) {
    b.phase = 2;
    env.toast(`${b.name} mengamuk!`, 2.4);
    b.scd = 1.5;
  }
  if (b.hp <= 0) {
    b.hp = 0;
    b.dead = true;
    b.deathT = 0;
    state.score += 2000 + state.level.area * 300;
    env.sfx("win");
    env.shake(1.5);
    env.fx("shadow_burst", b.x, b.y - 1, { scale: 2.6, dur: 0.8 });
  }
  return true;
}

function startSpecial(state, b, env) {
  const kind = b.specials[b.specialIdx % b.specials.length];
  b.specialIdx++;
  b.state = kind;
  b.t = 0;
  b.fired = 0;
  if (kind === "charge") env.sfx("growl");
  if (kind === "teleport") env.sfx("transform");
}

export function updateAreaBoss(state, dt, env) {
  const b = state.boss;
  const p = state.player;
  const arena = state.level.arena;
  if (!b.active) return;
  if (b.dead) {
    b.deathT += dt;
    setAnim(b, "idle", dt, 0.5);
    return;
  }
  b.flash = Math.max(0, b.flash - dt);
  b.t += dt;
  b.cd -= dt;
  const fast = b.phase > 1 ? 1.25 : 1;
  const dx = p.x - b.x;
  const dist = Math.abs(dx);
  const front = (reach, h) => ({ l: b.x + (b.facing > 0 ? -0.3 : -reach), r: b.x + (b.facing > 0 ? reach : 0.3), t: b.y - h, b: b.y });

  if (b.stagger > 0) {
    b.stagger -= dt;
    b.vx *= 0.85;
    setAnim(b, "idle", dt, -1, 3);
    physics(state, b, dt, arena);
    return;
  }

  switch (b.state) {
    case "intro":
      b.facing = dx > 0 ? 1 : -1;
      setAnim(b, "idle", dt, -1, 6);
      if (b.t > 1.8) {
        b.state = "idle";
        b.t = 0;
      }
      break;
    case "attack": {
      setAnim(b, "attack", dt, clamp(b.t / 0.8, 0, 0.99));
      if (b.t > 0.32 && b.t < 0.55) {
        b.vx = b.facing * 3;
        if (overlap(front(b.range + 0.6, b.h + 0.3), rectOf(p))) damagePlayer(state, env, 1, b.x);
      } else b.vx *= 0.8;
      if (b.t >= 0.8) {
        b.state = "idle";
        b.t = 0;
        b.cd = 1.1 / fast;
      }
      break;
    }
    case "charge": {
      if (b.t < 0.55) {
        setAnim(b, "idle", dt, -1, 14);
        b.vx = 0;
        b.facing = dx > 0 ? 1 : -1;
      } else if (b.t < 1.35) {
        setAnim(b, "move", dt, -1, 16);
        b.vx = b.facing * 15 * fast;
        if (overlap(rectOf(b), rectOf(p))) damagePlayer(state, env, 1, b.x);
        if ((b.x <= arena.x0 + 1 && b.vx < 0) || (b.x >= arena.x1 - 1 && b.vx > 0)) {
          b.t = 1.35;
          env.shake(1);
          env.sfx("slam");
        }
      } else {
        b.state = "idle";
        b.stagger = 1.1;
        b.cd = 0.8;
        env.text("Lengah!", b.x, b.y - b.h - 0.6, "#bfe3ff");
      }
      break;
    }
    case "waves": {
      setAnim(b, "special", dt, clamp(b.t / 0.9, 0, 0.99));
      b.vx = 0;
      if (b.t > 0.55 && !b.fired) {
        b.fired = 1;
        for (const dir of [-1, 1]) state.shots.push({ id: `wv${state.nextId++}`, kind: "wave", x: b.x + dir * 1, y: b.y, vx: dir * 10 * fast, vy: 0, t: 0, life: 2.6, friendly: false });
        env.fx("ground_wave", b.x, b.y, { scale: 1.3, ground: true });
        env.shake(0.9);
        env.sfx("slam");
      }
      if (b.t >= 1) done(b);
      break;
    }
    case "swarm": {
      setAnim(b, "special", dt, clamp(b.t / 1.1, 0, 0.99));
      b.vx = 0;
      if (b.t > 0.4 && b.fired < 1) {
        b.fired = 1;
        const n = b.phase > 1 ? 8 : 6;
        for (let i = 0; i < n; i++) {
          const tx = clamp(p.x + (i - n / 2) * 1.8 + (Math.random() - 0.5), arena.x0 + 1, arena.x1 - 1);
          state.shots.push({ id: `dr${state.nextId++}`, kind: "drop", x: tx, y: -1 - i * 0.9, vx: 0, vy: 0, t: 0, friendly: false, color: b.color, wait: 0.5 + i * 0.12 });
        }
        env.sfx("thread");
      }
      if (b.t >= 1.2) done(b);
      break;
    }
    case "summon": {
      setAnim(b, "special", dt, clamp(b.t / 1, 0, 0.99));
      b.vx = 0;
      if (b.t > 0.5 && !b.fired) {
        b.fired = 1;
        const alive = state.enemies.filter((e) => !e.dead).length;
        if (alive < 4) {
          for (let i = 0; i < 2; i++) {
            const type = b.monsters[i % b.monsters.length];
            state.spawnQueue.push({ type, x: clamp(b.x + (i ? 3 : -3), arena.x0 + 2, arena.x1 - 2), y: 11.5, hpMul: state.level.hpMul * 0.6 });
          }
          env.fx("shadow_burst", b.x - 3, b.y - 1, { scale: 1 });
          env.fx("shadow_burst", b.x + 3, b.y - 1, { scale: 1 });
        }
      }
      if (b.t >= 1.1) done(b);
      break;
    }
    case "burrow": {
      if (b.t < 0.6) {
        setAnim(b, "special", dt, clamp(b.t / 0.6, 0, 0.99));
        b.vx = 0;
      } else if (b.t < 1.9) {
        b.state = "under";
      }
      break;
    }
    case "under": {
      b.alpha = 0;
      b.x += clamp(p.x - b.x, -9 * dt, 9 * dt);
      b.telegraph = b.x;
      if (b.t > 1.9) {
        b.state = "erupt";
        b.t = 0;
        b.alpha = 1;
        b.telegraph = null;
        env.shake(1.2);
        env.sfx("slam");
        env.fx("dust", b.x, b.y, { scale: 1.6, ground: true });
      }
      break;
    }
    case "erupt": {
      setAnim(b, "attack", dt, clamp(b.t / 0.7, 0, 0.99));
      if (b.t < 0.35 && overlap({ l: b.x - 1.4, r: b.x + 1.4, t: b.y - 3, b: b.y }, rectOf(p))) damagePlayer(state, env, 1, b.x);
      if (b.t >= 0.7) {
        b.state = "idle";
        b.stagger = 1.2;
        b.cd = 0.8;
        b.scd = 4.5 / fast;
      }
      break;
    }
    case "rings": {
      setAnim(b, "special", dt, clamp(b.t / 1.2, 0, 0.99));
      b.vx = 0;
      const fireRing = (off) => {
        for (let i = 0; i < 10; i++) {
          const a = off + (i / 10) * Math.PI * 2;
          state.shots.push({ id: `rg${state.nextId++}`, kind: "orb", x: b.x, y: b.y - b.h * 0.6, vx: Math.cos(a) * 6.5, vy: Math.sin(a) * 6.5, t: 0, friendly: false, color: b.color });
        }
        env.sfx("deflect");
        env.fx("howl_rings", b.x, b.y - b.h * 0.6, { scale: 1.6, dur: 0.5 });
      };
      if (b.t > 0.35 && b.fired < 1) {
        b.fired = 1;
        fireRing(0);
      }
      if (b.t > 0.9 && b.fired < 2) {
        b.fired = 2;
        fireRing(Math.PI / 10);
      }
      if (b.t >= 1.3) done(b);
      break;
    }
    case "teleport": {
      if (b.t < 0.4) {
        b.alpha = 1 - b.t / 0.4;
        setAnim(b, "special", dt, clamp(b.t / 0.4, 0, 0.99));
      } else if (b.fired < 1) {
        b.fired = 1;
        b.x = clamp(p.x - p.facing * 2.2, arena.x0 + 1, arena.x1 - 1);
        b.facing = p.x > b.x ? 1 : -1;
        env.fx("shadow_burst", b.x, b.y - 1, { scale: 1.2 });
      } else {
        b.alpha = Math.min(1, b.alpha + dt * 5);
        if (b.t > 0.6) {
          b.state = "attack";
          b.t = 0;
        }
      }
      break;
    }
    default: {
      b.alpha = 1;
      b.facing = dx > 0 ? 1 : -1;
      b.scd -= dt;
      if (b.scd <= 0) {
        b.scd = 5.5 / fast;
        startSpecial(state, b, env);
        break;
      }
      if (dist > b.range * 0.8) b.vx = b.facing * b.speed * fast;
      else b.vx *= 0.7;
      if (b.cd <= 0 && dist < b.range + 0.4 && Math.abs(p.y - b.y) < 3) {
        b.state = "attack";
        b.t = 0;
        env.sfx("attack", { rate: 0.75 });
      }
      setAnim(b, Math.abs(b.vx) > 0.5 ? "move" : "idle", dt, -1, Math.abs(b.vx) > 0.5 ? 12 : 6);
    }
  }
  physics(state, b, dt, arena);
}

function done(b) {
  b.state = "idle";
  b.t = 0;
  b.cd = 0.7;
}

function physics(state, b, dt, arena) {
  if (b.state === "under") return;
  b.vy = Math.min(b.vy + GRAVITY * dt, 20);
  moveEntity(state, b, dt, { noPlatforms: true });
  if (arena) b.x = clamp(b.x, arena.x0 + 0.8, arena.x1 - 0.8);
}
