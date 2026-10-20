// The hunter: one character, two forms (plus the Eclipse ulti). Input is read
// from state.input (queued by input.js) and acted on here, inside update.

import { SIZES, GRAVITY, clamp } from "./config.js";
import { moveEntity } from "./physics.js";
import { boxHitsSolid, solidAt, touchFragile } from "./world.js";
import { hitEnemies, gainUlti, makeNoise, damagePlayer, applyEnemyHit } from "./combat.js";
import { applyBossHit } from "./boss.js";

export function createPlayer(x, y, maxHp) {
  return {
    x, y, vx: 0, vy: 0,
    w: SIZES.human.w, h: SIZES.human.h,
    form: "human", baseForm: "human",
    facing: 1, onGround: false, platId: null, groundTile: 0,
    coyote: 0, jumpBuf: 0, airBoost: false, dropT: 0,
    act: null, anim: "human.idle", animT: 0, animProg: -1,
    hp: maxHp, maxHp, invuln: 0, ulti: 0, eclipseT: 0,
    hang: null, grabCool: 0, grabAssist: 0, swing: null, zip: null, hookShot: null,
    thread: null, comboStep: 0, comboT: 0, comboEndT: 0, comboEndForm: null,
    pounceCool: 0, hookCool: 0, skillHold: 0, aim: null, target: null,
    lastSafe: { x, y }, idleT: 0, dead: false, deadT: 0, deflectFlash: 0,
  };
}

function setForm(p, form) {
  p.form = form;
  p.w = SIZES[form].w;
  p.h = SIZES[form].h;
}

const fits = (state, form, x, y) => !boxHitsSolid(state.level, x, y, SIZES[form].w, SIZES[form].h);

const ATTACKS = {
  human: ["slash1", "slash2", "slash3"],
  wolf: ["claw", "bite", "slam"],
};

const ACTS = {
  slash1: { dur: 0.3, win: [0.25, 0.6] },
  slash2: { dur: 0.3, win: [0.25, 0.6] },
  slash3: { dur: 0.42, win: [0.3, 0.65] },
  claw: { dur: 0.26, win: [0.25, 0.6] },
  bite: { dur: 0.3, win: [0.3, 0.6] },
  slam: { dur: 0.42, win: [0.45, 0.72] },
  eclipseClaw: { dur: 0.38, win: [0.3, 0.65] },
  eclipseSlam: { dur: 0.55, win: [0.5, 0.78] },
  aerial: { dur: 0.32, win: [0.05, 0.75] },
  rising: { dur: 0.36, win: [0.05, 0.6] },
  dash: { dur: 0.22, win: [0, 1] },
  lunge: { dur: 0.26, win: [0, 1] },
  pounce: { dur: 0.4, win: [0, 1] },
  hook: { dur: 0.3 },
  howl: { dur: 0.9 },
  transform: { dur: 0.2 },
  hurt: { dur: 0.32 },
  climb: { dur: 0.22 },
};

const LOCKS_MOVE = new Set(["slash1", "slash2", "slash3", "claw", "bite", "slam", "eclipseClaw", "eclipseSlam", "hook", "howl", "climb"]);
const OWN_VELOCITY = new Set(["dash", "lunge", "pounce", "climb"]);

function hitBox(p, type, buffs) {
  const f = p.facing;
  const base = { dir: f, fromX: p.x, form: p.form, kind: type };
  switch (type) {
    case "slash1":
    case "slash2":
      return { ...base, x: p.x + f * 0.95, y: p.y - 0.85, w: 1.8, h: 1.6, dmg: 1, knock: 3 };
    case "slash3":
      return { ...base, x: p.x + f * 1.0, y: p.y - 0.9, w: 2.1, h: 1.9, dmg: 1.5, knock: -4, mark: true, heavy: true, stun: 0.5 };
    case "claw":
      return { ...base, x: p.x + f * 1.0, y: p.y - 0.45, w: 1.7, h: 1.2, dmg: 1, knock: 3 };
    case "bite":
      return { ...base, x: p.x + f * 1.05, y: p.y - 0.45, w: 1.5, h: 1.1, dmg: 1.2, crack: true, knock: 2 };
    case "slam":
      return { ...base, x: p.x + f * 0.8, y: p.y - 0.5, w: 2.6, h: 1.5, dmg: 1.8, knock: 7, lift: 6, heavy: true, stun: 0.6 };
    case "eclipseClaw":
      return { ...base, x: p.x + f * 1.5, y: p.y - 1.2, w: 3.4, h: 2.8, dmg: 2.2, knock: 6, heavy: true, crack: true };
    case "eclipseSlam":
      return { ...base, x: p.x, y: p.y - 0.6, w: buffs && buffs.wideSlam ? 24 : 7.5, h: buffs && buffs.wideSlam ? 6 : 2.0, dmg: 3, knock: 8, lift: 8, heavy: true, ignoreShield: true, breaksFloor: true, stun: 1 };
    case "aerial":
      return { ...base, form: "human", x: p.x, y: p.y - 0.8, w: 2.8, h: 2.4, dmg: 1.5, knock: 4, heavy: true };
    case "rising":
      return { ...base, form: "human", x: p.x + f * 0.6, y: p.y - 1.4, w: 2, h: 2.8, dmg: 2, mark: true, lift: 9, heavy: true };
    case "dash":
      return { ...base, form: "wolf", x: p.x + f * 0.5, y: p.y - 0.45, w: 1.5, h: 1.0, dmg: 1, knock: 5 };
    case "lunge":
      return { ...base, form: "wolf", x: p.x + f * 0.6, y: p.y - 0.45, w: 1.7, h: 1.1, dmg: 2, knock: 6, crack: true, heavy: true };
    case "pounce":
      return { ...base, form: "wolf", x: p.x + f * 0.6, y: p.y - 0.45, w: 1.6, h: 1.2, dmg: 2, consumeMark: true, stun: 0.6, knock: 4, heavy: true, ulti: 6 };
    default:
      return null;
  }
}

function startAct(p, type, extra = {}) {
  p.act = { type, t: 0, dur: ACTS[type]?.dur ?? 0.3, ids: [], ...extra };
}

// Candidates for Moon Hook / Hunt Pounce, best first.
export function skillTargets(state) {
  const p = state.player;
  const human = p.form === "human";
  const list = [];
  const consider = (kind, id, x, y, range) => {
    const dx = x - p.x;
    const dy = y - (p.y - p.h * 0.6);
    const d = Math.hypot(dx, dy);
    if (d > range || d < 0.5) return;
    const behind = Math.sign(dx) !== p.facing && Math.abs(dx) > 0.6;
    list.push({ kind, id, x, y, score: d + (behind ? 4 : 0) + Math.abs(dy) * 0.3 });
  };
  if (human) for (const r of state.level.rings) consider("ring", r.id, r.x, r.y, 7.5);
  for (const e of state.enemies) {
    if (e.dead) continue;
    const range = human ? 7.5 : e.marked > 0 ? 9.5 : 5.5;
    consider("enemy", e.id, e.x, e.y - e.h * 0.55, range);
  }
  const b = state.boss;
  if (b && b.active && !b.dead) consider("boss", "boss", b.x, b.y - b.h * 0.55, human ? 7.5 : 7);
  list.sort((a, c) => a.score - c.score);
  return list;
}

function targetPos(state, tg) {
  if (!tg) return null;
  if (tg.kind === "ring") return state.level.rings.find((r) => r.id === tg.id) || null;
  if (tg.kind === "boss") return state.boss && !state.boss.dead ? { x: state.boss.x, y: state.boss.y - state.boss.h * 0.55 } : null;
  const e = state.enemies.find((en) => en.id === tg.id && !en.dead);
  return e ? { x: e.x, y: e.y - e.h * 0.55 } : null;
}

function onAltar(state) {
  const p = state.player;
  return state.level.altars.find((a) => Math.abs(a.x - p.x) < 1.1 && Math.abs(a.y - p.y) < 0.7) || null;
}

// ---------------------------------------------------------------- actions
function doTransform(state, env) {
  const p = state.player;
  if (p.eclipseT > 0 || p.dead || (p.act && (p.act.type === "hurt" || p.act.type === "howl"))) return;
  const f = p.facing;
  const fromHuman = p.form === "human";
  if (fromHuman) {
    if (p.swing) {
      releaseSwing(state, env, "wolf");
      return;
    }
    p.hang = null;
    setForm(p, "wolf");
    if (p.comboEndT > 0 && p.comboEndForm === "human") {
      startAct(p, "lunge");
      p.vx = f * 15;
      p.vy = 0;
      env.text("Sambungan!", p.x, p.y - 1.6, "#ffd2a8");
    } else if (!p.onGround && !p.airBoost) {
      p.airBoost = true;
      p.vx = f * 13;
      p.vy = Math.min(p.vy, -3);
      startAct(p, "transform", { dur: 0.16, quick: true });
    } else if (p.onGround && Math.abs(p.vx) > 2.5) {
      startAct(p, "dash");
      p.vx = f * 16;
      p.vy = 0;
    } else {
      startAct(p, "transform", { from: "human" });
    }
  } else {
    let x = p.x;
    if (!fits(state, "human", x, p.y)) {
      if (fits(state, "human", x + 0.35, p.y)) x += 0.35;
      else if (fits(state, "human", x - 0.35, p.y)) x -= 0.35;
      else {
        env.text("Terlalu sempit", p.x, p.y - 1.2, "#e8d8c0");
        env.sfx("buzz");
        return;
      }
    }
    p.x = x;
    const wasPounce = p.act && p.act.type === "pounce";
    setForm(p, "human");
    if (p.comboEndT > 0 && p.comboEndForm === "wolf") {
      startAct(p, "rising");
      p.vy = -10;
      env.text("Sambungan!", p.x, p.y - 2, "#ffd2a8");
    } else if (wasPounce) {
      startAct(p, "aerial");
      p.vy = Math.min(p.vy, -4);
      if (p.thread) cutThread(state, env);
    } else if (!p.onGround && p.vy > -2) {
      p.grabAssist = 0.4;
      startAct(p, "transform", { dur: 0.14, quick: true, from: "wolf" });
    } else {
      startAct(p, "transform", { from: "wolf" });
    }
  }
  p.comboEndT = 0;
  p.comboStep = 0;
  env.fx("moon_burst", p.x, p.y - 0.7, { scale: 0.9 });
  env.sfx("transform");
  makeNoise(state, p.x, p.y, 0.8);
}

function cutThread(state, env) {
  const p = state.player;
  const e = state.enemies.find((en) => en.id === p.thread.id);
  p.thread = null;
  if (e && !e.dead) {
    e.stun = 2.2;
    e.cd = 3.5;
    env.text("Benang putus!", e.x, e.y - e.h - 0.5, "#d9b8ff");
  }
  env.sfx("snap");
}

function doAttack(state, env) {
  const p = state.player;
  if (p.dead || p.hang || p.hookShot || p.zip) return;
  if (p.swing) {
    releaseSwing(state, env, null);
    return;
  }
  if (p.form === "eclipse") {
    if (!p.act) startAct(p, "eclipseClaw");
    else if (p.act.type === "eclipseClaw" && p.act.t / p.act.dur > 0.5) p.act.queued = true;
    return;
  }
  const chain = ATTACKS[p.form];
  if (p.act) {
    const idx = chain.indexOf(p.act.type);
    if (idx >= 0 && p.act.t / p.act.dur > 0.4) p.act.queued = true;
    return;
  }
  let step = p.comboT > 0 ? p.comboStep : 0;
  if (p.form === "wolf" && !p.onGround) step = 0;
  startNextAttack(state, env, step);
}

function startNextAttack(state, env, step) {
  const p = state.player;
  const chain = ATTACKS[p.form];
  const type = chain[Math.min(step, 2)];
  startAct(p, type, { step });
  p.comboStep = step + 1;
  if (p.onGround) p.vx = p.facing * (step === 2 ? 4 : 2.5);
  else p.vy = Math.min(p.vy, 1.5);
  env.sfx("attack", { rate: 0.95 + step * 0.06 });
  makeNoise(state, p.x, p.y, 0.6);
  if (p.form === "human") {
    env.fx("slash", p.x + p.facing * 1.0, p.y - 0.9, { flip: p.facing, scale: step === 2 ? 0.95 : 0.75, rot: step === 1 ? -0.5 : 0, dur: 0.22 });
    if (p.thread) cutThread(state, env);
  } else {
    env.fx("claw", p.x + p.facing * 1.05, p.y - 0.5, { flip: p.facing, scale: 0.6, dur: 0.22 });
  }
}

function fireSkill(state, env, tg) {
  const p = state.player;
  if (p.dead || p.hang || p.hookShot || p.zip || p.swing) return;
  if (p.act && !["transform", "dash", "lunge"].includes(p.act.type)) {
    if (!(p.form === "wolf" && p.pounceChain > 0 && p.act.type === "pounce")) return;
  }
  if (p.form === "eclipse") {
    startAct(p, "eclipseSlam");
    if (!p.onGround) p.vy = 18;
    return;
  }
  if (p.form === "wolf") {
    const altar = onAltar(state);
    if (altar) {
      startAct(p, "howl", { altar: altar.id });
      p.vx = 0;
      env.sfx("howl");
      return;
    }
    if (p.pounceCool > 0 && !(p.pounceChain > 0)) return;
    const pos = targetPos(state, tg);
    let vx;
    let vy;
    let dur;
    if (pos) {
      const dx = pos.x - p.x;
      const dy = pos.y + 0.3 - (p.y - 0.4);
      const d = Math.hypot(dx, dy);
      dur = clamp(d / 17, 0.16, 0.5);
      vx = dx / dur;
      vy = dy / dur;
      p.facing = dx >= 0 ? 1 : -1;
    } else {
      dur = 0.36;
      vx = p.facing * 13;
      vy = -6;
    }
    startAct(p, "pounce", { dur, pvx: vx, pvy: vy, target: tg ? tg.id : null });
    p.vx = vx;
    p.vy = vy;
    p.onGround = false;
    p.pounceCool = 0.9;
    p.pounceChain = 0;
    env.sfx("pounce");
    makeNoise(state, p.x, p.y, 0.7);
    return;
  }
  // Human: Moon Hook.
  if (p.hookCool > 0) return;
  const pos = targetPos(state, tg);
  p.hookCool = 0.45;
  startAct(p, "hook");
  env.sfx("hook");
  if (pos) {
    p.facing = pos.x >= p.x ? 1 : -1;
    const d = Math.hypot(pos.x - p.x, pos.y - (p.y - 1.1));
    p.hookShot = { kind: tg.kind, id: tg.id, t: 0, dur: Math.max(0.08, d / 34), miss: false };
  } else {
    p.hookShot = { kind: "miss", id: null, t: 0, dur: 0.18, miss: true, tx: p.x + p.facing * 5, ty: p.y - 1.2 };
  }
}

function resolveHook(state, env) {
  const p = state.player;
  const hs = p.hookShot;
  p.hookShot = null;
  if (hs.miss) return;
  const f = p.facing;
  if (hs.kind === "ring") {
    const r = state.level.rings.find((rg) => rg.id === hs.id);
    if (!r) return;
    const hx = p.x;
    const hy = p.y - p.h * 0.9;
    const d = Math.hypot(hx - r.x, hy - r.y);
    const len = clamp(d, 1.8, 3.0);
    const ang = Math.atan2(hx - r.x, hy - r.y);
    const angVel = (p.vx * Math.cos(ang) - p.vy * Math.sin(ang)) / len;
    p.swing = { id: r.id, cx: r.x, cy: r.y, len, ang, angVel, t: 0, zip: d > len + 0.05 };
    p.act = null;
    p.airBoost = false;
    env.sfx("deflect");
    env.fx("hit_spark", r.x, r.y, { scale: 0.4 });
    return;
  }
  if (hs.kind === "boss") {
    const b = state.boss;
    if (!b || b.dead) return;
    if (b.stagger > 0) {
      b.x = clamp(p.x + f * 1.4, state.level.arena.x0 + 1, state.level.arena.x1 - 1);
      applyBossHit(state, env, { kind: "hook", form: "human", dmg: 4, dir: -f, fromX: p.x });
      env.text("Tertarik!", b.x, b.y - 2.4, "#bfe3ff");
    } else {
      p.zip = { tx: b.x - Math.sign(b.x - p.x) * 1.6, ty: b.y, t: 0 };
    }
    return;
  }
  const e = state.enemies.find((en) => en.id === hs.id);
  if (!e || e.dead) return;
  env.sfx("deflect");
  if (e.type === "lantern" && e.lanternOn) {
    e.lanternOn = false;
    e.stun = 1.6;
    env.text("Lentera direbut!", e.x, e.y - 2.2, "#ffd2a8");
    env.fx("shadow_burst", e.x + e.facing * 0.5, e.y - 1.1, { scale: 0.5 });
    gainUlti(state, 8, env);
    return;
  }
  if (e.type === "knight" && e.shield) {
    if (e.cracked) {
      e.shield = false;
      e.stun = 1.4;
      env.text("Perisai dicopot!", e.x, e.y - 2.3, "#ffd2a8");
      env.fx("armor_crack", e.x + e.facing * 0.4, e.y - 1, { scale: 0.9 });
      env.sfx("break");
      gainUlti(state, 10, env);
      state.score += 50;
    } else {
      p.zip = { tx: e.x - Math.sign(e.x - p.x) * 1.3, ty: e.y, t: 0 };
      env.text("Terlalu berat — retakkan dulu", e.x, e.y - 2.3, "#e8d8c0");
    }
    return;
  }
  if (e.type === "stitcher" && p.thread && p.thread.id === e.id) {
    p.zip = { tx: e.x - Math.sign(e.x - p.x) * 1.2, ty: e.y, t: 0 };
    return;
  }
  // Light enemies are yanked in front of the hunter.
  e.pull = { tx: p.x + f * 1.1, t: 0 };
  applyEnemyHit(state, env, e, { kind: "hook", form: "human", dmg: 1, dir: -f, knock: 0, stun: 1.0, fromX: p.x, ulti: 5 });
}

function releaseSwing(state, env, asForm) {
  const p = state.player;
  const s = p.swing;
  p.swing = null;
  const v = s.angVel * s.len;
  p.vx = Math.cos(s.ang) * v * 1.12;
  p.vy = -Math.sin(s.ang) * v * 1.12 - 5;
  if (Math.abs(p.vx) < 5) p.vx = p.facing * 6;
  p.facing = p.vx >= 0 ? 1 : -1;
  p.airBoost = false;
  if (asForm === "wolf") {
    setForm(p, "wolf");
    p.vx += p.facing * 5;
    p.airBoost = true;
    env.fx("moon_burst", p.x, p.y - 0.6, { scale: 0.9 });
    env.sfx("transform");
    env.text("Lepas!", p.x, p.y - 1.4, "#bfe3ff");
  } else {
    env.sfx("jump");
  }
}

function doUlti(state, env) {
  const p = state.player;
  if (p.dead || p.ulti < 100 || p.eclipseT > 0) return;
  let x = p.x;
  if (!fits(state, "eclipse", x, p.y)) {
    if (fits(state, "eclipse", x + 0.4, p.y)) x += 0.4;
    else if (fits(state, "eclipse", x - 0.4, p.y)) x -= 0.4;
    else {
      env.text("Terlalu sempit", p.x, p.y - 1.2, "#e8d8c0");
      env.sfx("buzz");
      return;
    }
  }
  p.x = x;
  p.hang = null;
  p.swing = null;
  p.baseForm = p.form;
  setForm(p, "eclipse");
  p.eclipseT = Number(env.tweak("ultiDuration")) * env.buffs().eclipseMult;
  p.ulti = 0;
  p.invuln = Math.max(p.invuln, 0.6);
  p.act = null;
  env.fx("moon_burst", p.x, p.y - 1.2, { scale: 2 });
  env.text("ECLIPSE", p.x, p.y - 3, "#bfe3ff");
  env.sfx("ulti");
  env.shake(1.2);
  env.haptic(60);
}

function endEclipse(state, env) {
  const p = state.player;
  state.shots.push({ id: `sp${state.nextId++}`, kind: "spirit", x: p.x, y: p.y - 0.7, vx: p.facing * 17, vy: 0, t: 0, friendly: true, ids: [] });
  let back = p.baseForm === "human" && fits(state, "human", p.x, p.y) ? "human" : "wolf";
  setForm(p, back);
  p.act = null;
  env.fx("moon_burst", p.x, p.y - 0.8, { scale: 1.3 });
  env.text("Serigala roh!", p.x, p.y - 2, "#bfe3ff");
  env.sfx("spirit");
}

// ---------------------------------------------------------------- update
export function updatePlayer(state, dt, env) {
  const p = state.player;
  const input = state.input;
  const events = state.inputEvents;

  p.invuln = Math.max(0, p.invuln - dt);
  p.grabCool = Math.max(0, p.grabCool - dt);
  p.grabAssist = Math.max(0, p.grabAssist - dt);
  p.comboT = Math.max(0, p.comboT - dt);
  p.comboEndT = Math.max(0, p.comboEndT - dt);
  p.pounceCool = Math.max(0, p.pounceCool - dt);
  p.pounceChain = Math.max(0, (p.pounceChain || 0) - dt);
  p.hookCool = Math.max(0, p.hookCool - dt);
  p.dropT = Math.max(0, p.dropT - dt);
  p.deflectFlash = Math.max(0, p.deflectFlash - dt);
  p.jumpBuf = Math.max(0, p.jumpBuf - dt);
  p.coyote = Math.max(0, p.coyote - dt);

  if (p.dead) {
    p.deadT += dt;
    p.vx *= 0.9;
    p.vy = Math.min(p.vy + GRAVITY * dt, 20);
    moveEntity(state, p, dt);
    setAnim(p, p.form === "human" ? "human.hurt" : p.form === "wolf" ? "wolf.hurt" : "eclipse.idle", dt, 0.99);
    return;
  }

  if (p.thread) {
    p.thread.t -= dt;
    const e = state.enemies.find((en) => en.id === p.thread.id);
    if (!e || e.dead || p.thread.t <= 0 || Math.abs(e.x - p.x) > 11) p.thread = null;
  }

  // Eclipse timer.
  if (p.eclipseT > 0) {
    p.eclipseT -= dt;
    if (p.eclipseT <= 0) {
      p.eclipseT = 0;
      endEclipse(state, env);
    }
  }

  // ---- read queued input
  let pressed = { jump: false, attack: false, transform: false, ulti: false, skillDown: false, skillUp: false, left: false, right: false, down: false };
  for (const ev of events) pressed[ev] = true;
  state.inputEvents = [];
  if (pressed.jump) p.jumpBuf = 0.14;
  const dirIn = (input.right ? 1 : 0) - (input.left ? 1 : 0);

  // ---- skill hold / aim
  const targets = skillTargets(state);
  if (pressed.skillDown) p.skillHold = 0.0001;
  if (p.skillHold > 0) {
    p.skillHold += env.realDt;
    if (p.skillHold > 0.22 && !p.aim && p.form !== "eclipse" && !(p.form === "wolf" && onAltar(state))) {
      p.aim = { idx: 0, id: targets[0] ? targets[0].id : null };
      state.slowmo = true;
    }
  }
  if (p.aim) {
    const byX = [...targets].sort((a, c) => a.x - c.x);
    let idx = byX.findIndex((t) => t.id === p.aim.id);
    if (idx < 0) idx = byX.findIndex((t) => t.id === (targets[0] && targets[0].id));
    if (pressed.left && byX.length) idx = (idx - 1 + byX.length) % byX.length;
    if (pressed.right && byX.length) idx = (idx + 1) % byX.length;
    p.aim.id = byX[idx] ? byX[idx].id : null;
    p.target = byX[idx] || null;
  } else {
    p.target = targets[0] || null;
  }
  if (pressed.skillUp && p.skillHold > 0) {
    const tg = p.aim ? p.target : targets[0] || null;
    p.skillHold = 0;
    p.aim = null;
    state.slowmo = false;
    fireSkill(state, env, tg);
  }
  if (pressed.transform) doTransform(state, env);
  if (pressed.ulti) doUlti(state, env);
  if (pressed.attack) doAttack(state, env);

  // ---- hanging on a ledge
  if (p.hang) {
    p.vx = 0;
    p.vy = 0;
    p.x = p.hang.x;
    p.y = p.hang.top + p.h * 0.95;
    if (p.jumpBuf > 0 || (dirIn === p.hang.dir && input.up)) {
      p.jumpBuf = 0;
      const tx = p.hang.tx;
      const ex = p.hang.dir > 0 ? tx + p.w / 2 + 0.08 : tx + 1 - p.w / 2 - 0.08;
      startAct(p, "climb", { sx: p.x, sy: p.y, ex, ey: p.hang.top });
      p.hang = null;
      env.sfx("jump");
    } else if (pressed.down || dirIn === -p.hang.dir || p.form !== "human") {
      p.hang = null;
      p.grabCool = 0.35;
      p.vy = 1;
    } else {
      setAnim(p, "human.hang", dt, -1, 6);
      return;
    }
  }

  // ---- swinging from a moon ring
  if (p.swing) {
    const s = p.swing;
    s.t += dt;
    if (s.zip) {
      const hx = p.x;
      const hy = p.y - p.h * 0.9;
      const dx = s.cx - hx;
      const dy = s.cy - hy;
      const d = Math.hypot(dx, dy);
      const step = 24 * dt;
      if (d - step <= s.len) {
        s.zip = false;
        s.ang = Math.atan2(hx - s.cx, hy - s.cy);
        s.angVel = clamp(s.angVel, -4, 4) || p.facing * 2.5;
        if (Math.abs(s.angVel) < 2) s.angVel = (Math.sign(s.angVel) || p.facing) * 2.5;
      } else {
        p.x += (dx / d) * step;
        p.y += (dy / d) * step;
      }
    } else {
      const acc = -(GRAVITY / s.len) * Math.sin(s.ang) * 0.85 + dirIn * 3.2;
      s.angVel = (s.angVel + acc * dt) * (1 - 0.15 * dt);
      s.ang = clamp(s.ang + s.angVel * dt, -1.45, 1.45);
      const nx = s.cx + Math.sin(s.ang) * s.len;
      const ny = s.cy + Math.cos(s.ang) * s.len + p.h * 0.9;
      if (boxHitsSolid(state.level, nx, ny, p.w, p.h)) {
        p.swing = null;
        p.vx = 0;
        p.vy = 0;
      } else {
        p.x = nx;
        p.y = ny;
      }
    }
    if (p.swing) {
      if (Math.abs(s.angVel) > 0.2) p.facing = s.angVel * Math.cos(s.ang) >= 0 ? 1 : -1;
      if (p.jumpBuf > 0 && !s.zip) {
        p.jumpBuf = 0;
        releaseSwing(state, env, null);
      } else if (s.t > 3.2) {
        releaseSwing(state, env, null);
      } else {
        setAnim(p, "human.fall", dt, -1, 8);
        return;
      }
    }
  }

  // ---- hook in flight / zipping to a heavy target
  if (p.hookShot) {
    p.hookShot.t += dt;
    p.vx *= 0.8;
    p.vy = Math.min(p.vy + GRAVITY * 0.3 * dt, 4);
    moveEntity(state, p, dt);
    if (p.hookShot.t >= p.hookShot.dur) resolveHook(state, env);
    setAnim(p, "human.hook", dt, clamp((p.act ? p.act.t / p.act.dur : 0.5), 0, 0.99));
    if (p.act) p.act.t = Math.min(p.act.t + dt, p.act.dur * 0.7);
    return;
  }
  if (p.zip) {
    p.zip.t += dt;
    const dx = p.zip.tx - p.x;
    const dy = p.zip.ty - p.y;
    const d = Math.hypot(dx, dy);
    p.vx = (dx / (d || 1)) * 20;
    p.vy = (dy / (d || 1)) * 20;
    moveEntity(state, p, dt);
    if (d < 0.6 || p.zip.t > 0.6 || p.hitWall) {
      p.zip = null;
      p.vx *= 0.3;
      p.vy = -3;
    }
    setAnim(p, "human.jump", dt, 0.5);
    return;
  }

  // ---- actions in progress
  const a = p.act;
  if (a) {
    a.t += dt;
    const prog = a.t / a.dur;
    const def = ACTS[a.type];
    if (def && def.win && prog >= def.win[0] && prog <= def.win[1]) {
      const hb = hitBox(p, a.type, env.buffs());
      if (hb) {
        hb.ids = a.ids;
        const res = hitEnemies(state, env, hb);
        if (a.type === "pounce" && res.hits > 0 && !a.landed) {
          a.landed = true;
          p.vx = -p.facing * 3;
          p.vy = -6;
          a.t = Math.max(a.t, a.dur * 0.75);
          if (res.kills > 0) {
            p.pounceChain = 1.3;
            p.pounceCool = 0;
            env.text("Terkam lagi!", p.x, p.y - 1.5, "#bfe3ff");
          }
        }
        if (a.type === "eclipseSlam" && !a.waved) {
          a.waved = true;
          env.fx("ground_wave", p.x - 2, p.y, { scale: 1.2, flip: -1, ground: true });
          env.fx("ground_wave", p.x + 2, p.y, { scale: 1.2, flip: 1, ground: true });
          env.shake(1.2);
          env.sfx("slam");
          makeNoise(state, p.x, p.y, 1.2);
        }
        if (a.type === "slam" && !a.waved) {
          a.waved = true;
          env.fx("dust", p.x + p.facing * 0.9, p.y, { scale: 1, ground: true });
          env.shake(0.5);
          env.sfx("slam", { volume: 0.6 });
        }
      }
    }
    if (a.type === "howl" && prog > 0.35 && !a.done) {
      a.done = true;
      const altar = state.level.altars.find((al) => al.id === a.altar);
      if (altar) {
        altar.activeT = Number(env.tweak("shadowDuration"));
        env.fx("howl_rings", p.x + p.facing * 1, p.y - 1.2, { scale: 1.4, flip: p.facing, dur: 0.6 });
        env.text("Bayangan bangkit!", altar.x, altar.y - 2.4, "#bfe3ff");
        env.shake(0.4);
        makeNoise(state, p.x, p.y, 1.5);
        gainUlti(state, 5, env);
      }
    }
    if (a.type === "climb") {
      const k = clamp(prog, 0, 1);
      p.x = a.sx + (a.ex - a.sx) * k;
      p.y = a.sy + (a.ey - a.sy) * (1 - (1 - k) * (1 - k));
      p.vx = 0;
      p.vy = 0;
    }
    if (a.type === "dash" || a.type === "lunge") {
      p.vx = p.facing * (a.type === "dash" ? 16 : 15);
      p.vy = 0;
    }
    if (a.type === "pounce" && !a.landed) {
      p.vx = a.pvx;
      p.vy = a.pvy;
    }
    if (prog >= 1) {
      p.act = null;
      if (a.type === "climb") {
        p.onGround = true;
        p.y = a.ey;
      }
      if (ATTACKS.human.includes(a.type) || ATTACKS.wolf.includes(a.type)) {
        p.comboT = 0.35;
        if (a.step === 2) {
          p.comboEndT = 0.45;
          p.comboEndForm = p.form;
          p.comboStep = 0;
        }
        if (a.queued && a.step < 2 && (p.form !== "wolf" || p.onGround)) startNextAttack(state, env, a.step + 1);
        else if (a.queued && a.step === 2) startNextAttack(state, env, 0);
      }
      if (a.type === "eclipseClaw" && a.queued) startAct(p, "eclipseClaw");
      if (a.type === "pounce" && !a.landed) p.vx *= 0.5;
    }
  }

  // ---- movement
  const act = p.act;
  const locked = act && LOCKS_MOVE.has(act.type) && (p.onGround || act.type === "howl" || act.type === "climb");
  const owned = act && OWN_VELOCITY.has(act.type);
  const crawling = p.form === "wolf" && solidAt(state.level, Math.floor(p.x), Math.floor(p.y - 1.25));
  const buffs = env.buffs();
  let speed = (p.form === "human" ? Number(env.tweak("humanSpeed")) : p.form === "wolf" ? Number(env.tweak("wolfSpeed")) : 7.5) * buffs.speed;
  if (crawling) speed *= 0.65;
  if (p.thread) speed *= 0.45;
  p.slowT = Math.max(0, (p.slowT || 0) - dt);
  if (p.slowT > 0) speed *= 0.55;
  const hurt = act && act.type === "hurt";
  p.respawnLock = Math.max(0, (p.respawnLock || 0) - dt);
  const moveDir = p.aim || p.respawnLock > 0 ? 0 : dirIn;
  if (!owned) {
    if (!locked && !hurt) {
      const target = moveDir * speed;
      const accel = p.onGround ? 70 : 38;
      if (p.vx < target) p.vx = Math.min(target, p.vx + accel * dt);
      else if (p.vx > target) p.vx = Math.max(target, p.vx - accel * dt);
      if (moveDir !== 0 && !(act && (ATTACKS.human.includes(act.type) || ATTACKS.wolf.includes(act.type)))) p.facing = moveDir;
    } else {
      p.vx *= p.onGround ? Math.pow(0.0005, dt) : 1;
    }
  }

  // ---- jumping
  const jumpH = Number(env.tweak("jumpHeight")) * (p.form === "wolf" ? 1.18 : p.form === "eclipse" ? 1.4 : 1);
  const jumpV = Math.sqrt(2 * GRAVITY * jumpH);
  if (p.jumpBuf > 0 && (p.onGround || p.coyote > 0) && !locked && !owned && !hurt) {
    if (pressed.jump && input.down && p.groundTile === 2) {
      p.dropT = 0.25;
      p.jumpBuf = 0;
    } else if (!crawling || !solidAt(state.level, Math.floor(p.x), Math.floor(p.y - p.h - 0.2))) {
      p.vy = -jumpV;
      p.onGround = false;
      p.coyote = 0;
      p.jumpBuf = 0;
      p.airBoost = false;
      if (act && (act.type === "transform")) p.act = null;
      env.sfx("jump");
      env.fx("dust", p.x, p.y, { scale: 0.55, ground: true, dur: 0.3 });
    }
  } else if (pressed.jump && !p.onGround && p.coyote <= 0 && buffs.doubleJump && !p.airJumped && !locked && !owned && !hurt) {
    // Bayang Gagak and up: a second jump in mid-air.
    p.airJumped = true;
    p.jumpBuf = 0;
    p.vy = -jumpV * 0.92;
    env.sfx("jump");
    env.fx("moon_burst", p.x, p.y - 0.2, { scale: 0.45, dur: 0.25 });
  }
  if (input.down && p.onGround && p.groundTile === 2 && pressed.down) p.dropT = 0.25;

  // ---- gravity
  if (!owned) {
    let g = GRAVITY;
    if (p.vy < 0 && !input.jump) g *= 2.2;
    if (act && (act.type === "slash1" || act.type === "slash2" || act.type === "claw") && !p.onGround) g *= 0.55;
    p.vy = Math.min(p.vy + g * dt, 22);
  } else if (act && act.type === "pounce" && act.landed) {
    p.vy = Math.min(p.vy + GRAVITY * dt, 22);
  }

  const prevVy = p.vy;
  const wasGround = p.onGround;
  moveEntity(state, p, dt, { dropThrough: p.dropT > 0 });
  if (p.onGround) {
    p.coyote = 0.1;
    if (!wasGround && prevVy > 9) {
      env.fx("dust", p.x, p.y, { scale: 0.7, ground: true, dur: 0.3 });
      env.sfx("land", { volume: clamp(prevVy / 20, 0.3, 1) });
      makeNoise(state, p.x, p.y, 0.5);
    }
    if (!wasGround) p.airBoost = false;
    p.airJumped = false;
    if (p.groundTile === 3) touchFragile(state, p.x, p.y, 0.45);
    if (act && act.type === "pounce") {
      p.act = null;
      p.vx *= 0.4;
    }
    // Remember the last safe footing for pit recovery.
    if (p.groundTile === 1 && solidAt(state.level, Math.floor(p.x - 1.4), Math.floor(p.y + 0.1)) && solidAt(state.level, Math.floor(p.x + 1.4), Math.floor(p.y + 0.1))) {
      p.lastSafe = { x: p.x, y: p.y };
    }
  }
  if (act && (act.type === "dash" || act.type === "lunge") && p.hitWall) p.act = null;

  // ---- ledge grab (human, falling)
  if (p.form === "human" && !p.onGround && p.vy > 0 && p.grabCool <= 0 && (!p.act || p.act.type === "transform")) {
    if (tryGrab(state, env, dirIn)) p.act = null;
  }

  // ---- fell into a pit
  if (p.y > state.level.rows + 2.5) {
    p.invuln = 0;
    damagePlayer(state, env, 1, p.x);
    if (!p.dead) {
      p.x = p.lastSafe.x;
      p.y = p.lastSafe.y - 0.05;
      p.vx = 0;
      p.vy = 0;
      p.invuln = 1.3;
      p.respawnLock = 0.6;
      p.act = null;
      env.text("Jatuh!", p.x, p.y - 2, "#ffb0a0");
    } else {
      p.y = state.level.rows + 2;
    }
  }

  // ---- animation
  pickAnim(state, p, dt, crawling);
}

function tryGrab(state, env, dirIn) {
  const p = state.player;
  const level = state.level;
  const dirs = dirIn !== 0 ? [dirIn] : [p.facing];
  const range = p.grabAssist > 0 ? 1.1 : 0.45;
  for (const dir of dirs) {
    const tx = Math.floor(p.x + dir * (p.w / 2 + 0.2));
    const handY = p.y - p.h;
    for (let ty = Math.floor(handY - range); ty <= Math.floor(handY + range); ty++) {
      if (Math.abs(ty - handY) > range) continue;
      if (!solidAt(level, tx, ty) || solidAt(level, tx, ty - 1) || solidAt(level, tx, ty - 2)) continue;
      const px = dir > 0 ? tx - p.w / 2 - 0.02 : tx + 1 + p.w / 2 + 0.02;
      if (boxHitsSolid(level, px, ty + p.h * 0.95, p.w, p.h)) continue;
      p.hang = { x: px, top: ty, tx, dir };
      p.facing = dir;
      p.vx = 0;
      p.vy = 0;
      p.x = px;
      p.y = ty + p.h * 0.95;
      env.sfx("grab");
      return true;
    }
  }
  return false;
}

function setAnim(p, key, dt, prog = -1, fps = 10) {
  if (p.anim !== key) {
    p.anim = key;
    p.animT = 0;
  } else {
    p.animT += dt;
  }
  p.animProg = prog;
  p.animFps = fps;
}

function pickAnim(state, p, dt, crawling) {
  const a = p.act;
  const f = p.form;
  if (a) {
    const prog = clamp(a.t / a.dur, 0, 0.999);
    const map = {
      slash1: "human.slash1", slash2: "human.slash2", slash3: "human.slash3",
      claw: "wolf.claw", bite: "wolf.bite", slam: "wolf.slam",
      eclipseClaw: "eclipse.claw", eclipseSlam: "eclipse.slam",
      aerial: "human.slash3", rising: "human.slash2",
      dash: "wolf.pounce", lunge: "wolf.pounce", pounce: "wolf.pounce",
      hook: "human.hook", howl: "wolf.howl", climb: "human.jump",
      hurt: f === "human" ? "human.hurt" : f === "wolf" ? "wolf.hurt" : "eclipse.idle",
    };
    if (a.type === "transform") {
      if (a.quick) {
        // mid-air swap: fall straight into the new form's air pose
      } else if (a.from === "human") return setAnim(p, "human.transform", dt, prog);
      else if (a.from === "wolf") return setAnim(p, "human.untransform", dt, prog);
    } else if (map[a.type]) {
      return setAnim(p, map[a.type], dt, a.type === "pounce" || a.type === "dash" || a.type === "lunge" ? clamp(0.2 + prog * 0.7, 0, 0.99) : prog);
    }
  }
  if (p.deflectFlash > 0 && f === "human") return setAnim(p, "human.deflect", dt, 1 - p.deflectFlash / 0.25);
  const moving = Math.abs(p.vx) > 0.6;
  if (!p.onGround) {
    if (f === "eclipse") return setAnim(p, "eclipse.run", dt, 0.4);
    if (p.vy < 0) return setAnim(p, `${f}.jump`, dt, f === "wolf" ? 0.5 : 0.45);
    return setAnim(p, f === "wolf" ? "wolf.jump" : "human.fall", dt, f === "wolf" ? 0.75 : -1, 8);
  }
  if (f === "wolf" && crawling) return setAnim(p, "wolf.crawl", dt, -1, moving ? 10 : 0);
  if (moving) {
    p.idleT = 0;
    return setAnim(p, `${f}.run`, dt, -1, f === "wolf" ? 14 : 12);
  }
  p.idleT += dt;
  if (f === "wolf" && p.idleT > 0.8) return setAnim(p, "wolf.sniff", dt, -1, 6);
  return setAnim(p, `${f}.idle`, dt, -1, 6);
}

