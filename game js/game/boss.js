// Serigala Tanpa Bayangan — a shadow twin that copies your form a beat late.
// Hitting it with the SAME form it wears barely scratches it; switch forms
// during the copy delay to punish. Phase 2 adds ground waves (dodge on the
// altar's shadow platforms); phase 3 adds its own Eclipse slams.

import { GRAVITY, clamp } from "./config.js";
import { moveEntity } from "./physics.js";
import { rectOf, overlap, damagePlayer, addCombo, gainUlti } from "./combat.js";
import { applyAreaBossHit } from "./areaBoss.js";

const BOSS_SIZES = { human: { w: 0.7, h: 1.7 }, wolf: { w: 1.2, h: 0.95 }, eclipse: { w: 1.2, h: 2.6 } };

export function createBoss(spec, hp) {
  return {
    id: "boss",
    x: spec.x,
    y: spec.y,
    w: BOSS_SIZES.human.w,
    h: BOSS_SIZES.human.h,
    vx: 0,
    vy: 0,
    onGround: false,
    platId: null,
    hp,
    maxHp: hp,
    form: "human",
    facing: -1,
    active: false,
    dead: false,
    deathT: 0,
    state: "intro",
    t: 0,
    cd: 1.5,
    stagger: 0,
    flash: 0,
    phase: 1,
    waveCd: 5,
    eclipseCd: 6,
    sameWarnT: 0,
    anim: "human_idle",
    animT: 0,
    animProg: -1,
    animFps: 8,
    toForm: null,
  };
}

function setForm(b, form) {
  b.form = form;
  b.w = BOSS_SIZES[form].w;
  b.h = BOSS_SIZES[form].h;
}

function setAnim(b, key, dt, prog = -1, fps = 8) {
  if (b.anim !== key) {
    b.anim = key;
    b.animT = 0;
  } else b.animT += dt;
  b.animProg = prog;
  b.animFps = fps;
}

function spawnWaves(state, b, speed, env) {
  const y = b.y;
  for (const dir of [-1, 1]) {
    state.shots.push({ id: `wv${state.nextId++}`, kind: "wave", x: b.x + dir * 0.8, y, vx: dir * speed, vy: 0, t: 0, life: 2.6, friendly: false });
  }
  env.fx("ground_wave", b.x, y, { scale: 1.2, ground: true });
  env.shake(0.9);
  env.sfx("slam");
}

export function applyBossHit(state, env, hit) {
  const b = state.boss;
  if (b && b.kind === "area") return applyAreaBossHit(state, env, hit);
  if (!b || b.dead || !b.active || b.state === "intro") return false;
  let mult = 1;
  const pf = hit.form;
  const same = pf !== "eclipse" && b.form !== "eclipse" && pf === b.form;
  if (same) {
    mult = 0.3;
    if (b.sameWarnT <= 0) {
      b.sameWarnT = 3;
      env.text("Wujud sama — ganti wujud!", b.x, b.y - b.h - 0.6, "#ffb0a0");
    }
    env.sfx("deflect");
  }
  if (b.stagger > 0 || b.state === "transform") mult *= 1.6;
  // A sickle swing into its lunge parries it.
  if (b.state === "lunge" && b.t > 0.35 && pf === "human" && hit.kind !== "hook") {
    b.state = "stagger";
    b.stagger = 1.6;
    b.vx = -b.facing * 6;
    env.text("Tangkis! Kait sekarang!", b.x, b.y - 2, "#bfe3ff");
    env.sfx("deflect");
    env.fx("hit_spark", b.x, b.y - 0.6, { scale: 0.9 });
  }
  const dmg = hit.dmg * mult;
  b.hp -= dmg;
  b.flash = 0.12;
  addCombo(state);
  gainUlti(state, same ? 1 : 3, env);
  env.fx("hit_spark", b.x - (hit.dir || 1) * 0.2, b.y - b.h * 0.6, { scale: same ? 0.4 : 0.7 });
  if (!same) env.sfx("hit");
  state.hitstop = Math.max(state.hitstop, same ? 0.02 : 0.06);
  const frac = b.hp / b.maxHp;
  if (b.phase === 1 && frac < 0.66) {
    b.phase = 2;
    b.waveCd = 2;
    env.toast("Gelombang bayangan! Lolong di altar untuk pijakan");
  } else if (b.phase === 2 && frac < 0.33) {
    b.phase = 3;
    b.eclipseCd = 2;
    env.toast("Ia memakai Eclipse-nya sendiri!");
  }
  if (b.hp <= 0) {
    b.hp = 0;
    b.dead = true;
    b.deathT = 0;
    state.score += 2000;
    env.sfx("win");
    env.shake(1.5);
    env.fx("shadow_burst", b.x, b.y - 1, { scale: 2.4, dur: 0.8 });
  }
  return true;
}

export function updateBoss(state, dt, env) {
  const b = state.boss;
  if (!b || !b.active) return;
  const p = state.player;
  if (b.dead) {
    b.deathT += dt;
    setAnim(b, b.form === "wolf" ? "wolf_idle" : "human_idle", dt, 0.5);
    return;
  }
  b.flash = Math.max(0, b.flash - dt);
  b.sameWarnT = Math.max(0, b.sameWarnT - dt);
  b.cd -= dt;
  b.t += dt;
  const dx = p.x - b.x;
  const dist = Math.abs(dx);
  const arena = state.level.arena;

  if (b.state === "intro") {
    setAnim(b, "human_idle", dt, -1, 6);
    b.facing = dx > 0 ? 1 : -1;
    if (b.t > 1.8) {
      b.state = "idle";
      b.t = 0;
    }
    applyPhysics(state, b, dt, arena);
    return;
  }

  // Mirror: copy the player's base form after a delay.
  const delay = Number(env.tweak("bossMirrorDelay"));
  const seen = [...state.formLog].reverse().find((f) => state.time - f.t >= delay);
  const wantForm = seen ? seen.form : "human";
  const busy = ["slash", "lunge", "wave", "eclipse", "transform", "stagger"].includes(b.state);
  if (!busy && (wantForm === "human" || wantForm === "wolf") && wantForm !== b.form) {
    b.state = "transform";
    b.t = 0;
    b.toForm = wantForm;
  }

  if (b.stagger > 0) {
    b.stagger -= dt;
    b.vx *= 0.88;
    setAnim(b, b.form === "wolf" ? "wolf_idle" : "human_idle", dt, -1, 3);
    if (b.stagger <= 0) {
      b.state = "idle";
      b.cd = 0.6;
      if (b.form === "eclipse") setForm(b, wantForm === "wolf" ? "wolf" : "human");
    }
    applyPhysics(state, b, dt, arena);
    return;
  }

  switch (b.state) {
    case "transform": {
      const from = b.form;
      setAnim(b, "transform", dt, from === "human" ? clamp(b.t / 0.6, 0, 0.99) : clamp(1 - b.t / 0.6, 0, 0.99));
      b.reverse = from !== "human";
      b.vx *= 0.8;
      if (b.t >= 0.6) {
        setForm(b, b.toForm);
        b.state = "idle";
        b.t = 0;
        b.cd = 0.5;
      }
      break;
    }
    case "slash": {
      setAnim(b, "human_slash", dt, clamp(b.t / 0.75, 0, 0.99));
      if (b.t > 0.3 && b.t < 0.5) {
        b.vx = b.facing * (b.dash ? 10 : 3);
        if (overlap({ l: b.x + (b.facing > 0 ? 0 : -2.2), r: b.x + (b.facing > 0 ? 2.2 : 0), t: b.y - 1.8, b: b.y }, rectOf(p))) damagePlayer(state, env, 1, b.x);
      } else b.vx *= 0.8;
      if (b.t >= 0.75) {
        b.state = "idle";
        b.t = 0;
        b.cd = b.phase > 1 ? 0.7 : 1.1;
        b.dash = false;
      }
      break;
    }
    case "lunge": {
      if (b.t < 0.35) {
        setAnim(b, "wolf_lunge", dt, clamp(b.t / 0.35, 0, 0.99) * 0.35);
        b.vx = 0;
      } else if (b.t < 0.75) {
        setAnim(b, "wolf_lunge", dt, 0.4 + ((b.t - 0.35) / 0.4) * 0.5);
        b.vx = b.facing * 15;
        if (overlap(rectOf(b), rectOf(p))) damagePlayer(state, env, 1, b.x);
      } else {
        setAnim(b, "wolf_lunge", dt, 0.95);
        b.vx *= 0.8;
      }
      if (b.t >= 1.05) {
        b.state = "idle";
        b.t = 0;
        b.cd = b.phase > 1 ? 1.1 : 1.6;
      }
      break;
    }
    case "wave": {
      setAnim(b, b.form === "wolf" ? "wolf_lunge" : "human_slash", dt, clamp(b.t / 0.7, 0, 0.99));
      b.vx = 0;
      if (b.t >= 0.5 && !b.fired) {
        b.fired = true;
        spawnWaves(state, b, 9, env);
      }
      if (b.t >= 0.8) {
        b.state = "idle";
        b.t = 0;
        b.cd = 0.8;
      }
      break;
    }
    case "eclipse": {
      setAnim(b, "eclipse_slam", dt, ((b.t % 1.1) / 1.1) * 0.99);
      b.vx = 0;
      if (b.t >= 0.7 && b.slams < 1) {
        b.slams = 1;
        spawnWaves(state, b, 11, env);
      }
      if (b.t >= 1.8 && b.slams < 2) {
        b.slams = 2;
        spawnWaves(state, b, 12, env);
      }
      if (b.t >= 2.4) {
        b.state = "stagger";
        b.stagger = 2.2;
        env.text("Ia lengah!", b.x, b.y - 3, "#bfe3ff");
      }
      break;
    }
    default: {
      // idle / chase
      b.facing = dx > 0 ? 1 : -1;
      if (b.phase >= 2) b.waveCd -= dt;
      if (b.phase >= 3) b.eclipseCd -= dt;
      if (b.phase >= 3 && b.eclipseCd <= 0) {
        b.state = "eclipse";
        b.t = 0;
        b.slams = 0;
        b.eclipseCd = 9;
        setForm(b, "eclipse");
        env.sfx("ulti");
        env.text("ECLIPSE", b.x, b.y - 3.2, "#ffb0a0");
        break;
      }
      if (b.phase >= 2 && b.waveCd <= 0) {
        b.state = "wave";
        b.t = 0;
        b.fired = false;
        b.waveCd = 6.5;
        break;
      }
      if (b.form === "human") {
        if (dist > 1.8) b.vx = b.facing * 4.2;
        else b.vx *= 0.7;
        if (b.cd <= 0 && (dist < 2.2 || (b.phase > 1 && dist < 6 && Math.random() < 0.02))) {
          b.state = "slash";
          b.t = 0;
          b.dash = dist >= 2.2;
          env.sfx("attack", { rate: 0.8 });
        }
        setAnim(b, Math.abs(b.vx) > 0.5 ? "human_run" : "human_idle", dt, -1, Math.abs(b.vx) > 0.5 ? 12 : 6);
      } else {
        if (dist < 3.5) b.vx = -b.facing * 4;
        else if (dist > 6.5) b.vx = b.facing * 5;
        else b.vx *= 0.8;
        if (b.cd <= 0 && dist < 9) {
          b.state = "lunge";
          b.t = 0;
          env.sfx("growl");
        }
        setAnim(b, Math.abs(b.vx) > 0.5 ? "wolf_run" : "wolf_idle", dt, -1, Math.abs(b.vx) > 0.5 ? 14 : 6);
      }
    }
  }
  applyPhysics(state, b, dt, arena);
}

function applyPhysics(state, b, dt, arena) {
  b.vy = Math.min(b.vy + GRAVITY * dt, 20);
  moveEntity(state, b, dt, { noPlatforms: true });
  if (arena) b.x = clamp(b.x, arena.x0 + 0.6, arena.x1 - 0.6);
}
