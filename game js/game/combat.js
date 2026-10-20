// Hit resolution shared by the player, enemies and the boss. A "hit" is a
// box plus what it does: damage, moon mark, armor crack, pull, knockback.

import { tileAt, breakColumn } from "./world.js";
import { applyBossHit } from "./boss.js";

export const rectOf = (e) => ({ l: e.x - e.w / 2, r: e.x + e.w / 2, t: e.y - e.h, b: e.y });
export const overlap = (a, b) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;

export function gainUlti(state, amt, env) {
  const p = state.player;
  if (p.eclipseT > 0) return;
  const before = p.ulti;
  p.ulti = Math.min(100, p.ulti + amt * Number(env.tweak("ultiGain")) * env.buffs().ultiRate);
  if (before < 100 && p.ulti >= 100) {
    env.text("ULTI SIAP", p.x, p.y - 2.4, "#bfe3ff");
    env.sfx("ulti_ready");
  }
}

export function addCombo(state) {
  state.combo.count += 1;
  state.combo.t = 2.4;
  state.stats.bestCombo = Math.max(state.stats.bestCombo, state.combo.count);
  state.score += 10 * Math.min(state.combo.count, 30);
}

export function makeNoise(state, x, y, loud = 1) {
  state.noise = { x, y, t: 2.5 * loud };
}

// Apply a player-side hit box to everything it can touch.
export function hitEnemies(state, env, hit) {
  const box = { l: hit.x - hit.w / 2, r: hit.x + hit.w / 2, t: hit.y - hit.h / 2, b: hit.y + hit.h / 2 };
  const ids = hit.ids || (hit.ids = []);
  let hits = 0;
  let kills = 0;
  for (const e of state.enemies) {
    if (e.dead || ids.includes(e.id)) continue;
    if (!overlap(box, rectOf(e))) continue;
    ids.push(e.id);
    // Skins like Duri Mawar / Darah Bulan land every blow 2–3 times.
    const times = hit.noMulti ? 1 : env.buffs().hits;
    for (let k = 0; k < times && !e.dead; k++) {
      const res = applyEnemyHit(state, env, e, k ? { ...hit, echo: true, mark: false, lift: 0 } : hit);
      if (res === "hit" || res === "kill") hits++;
      if (res === "kill") kills++;
      if (res === "blocked") break;
    }
  }
  const boss = state.boss;
  if (boss && !boss.dead && boss.active && !ids.includes("boss") && overlap(box, rectOf(boss))) {
    ids.push("boss");
    const times = hit.noMulti ? 1 : env.buffs().hits;
    for (let k = 0; k < times && !boss.dead; k++) if (applyBossHit(state, env, k ? { ...hit, echo: true } : hit)) hits++;
  }
  // Levers answer to the sickle.
  if (hit.form === "human" && hit.kind !== "pounce") {
    for (const lv of state.level.levers) {
      if (lv.on || ids.includes(lv.id)) continue;
      if (Math.abs(lv.x - hit.x) < hit.w / 2 + 0.4 && lv.y > box.t && lv.y - 1 < box.b) {
        ids.push(lv.id);
        lv.on = true;
        const g = lv.gate;
        for (let y = g.y; y < g.y + g.h; y++) state.level.tiles[y * state.level.cols + g.x] = 0;
        env.sfx("lever");
        env.shake(0.4);
        env.text("Gerbang terbuka", lv.x, lv.y - 2, "#bfe3ff");
        env.fx("hit_spark", lv.x, lv.y - 0.6, { scale: 0.7 });
      }
    }
  }
  // Cracked wood breaks under claws (and under Eclipse slams).
  const tx0 = Math.floor(box.l);
  const tx1 = Math.floor(box.r);
  const ty0 = Math.floor(box.t);
  const ty1 = Math.floor(box.b - 0.01);
  for (let tx = tx0; tx <= tx1; tx++) {
    for (let ty = ty0; ty <= ty1; ty++) {
      const t = tileAt(state.level, tx, ty);
      if (t === 4 || (t === 3 && hit.breaksFloor)) {
        if (hit.form === "wolf" || hit.form === "eclipse") {
          const ys = breakColumn(state.level, tx, ty, t);
          for (const y of ys) env.fx("shadow_burst", tx + 0.5, y + 0.9, { scale: 0.6 });
          env.sfx("break");
          env.shake(0.5);
          if (t === 4) {
            state.score += 30;
            env.text("Hancur!", tx + 0.5, ty - 0.5, "#e8d8c0");
          }
        } else if (!ids.includes(`w${tx}`)) {
          ids.push(`w${tx}`);
          env.sfx("deflect");
          env.text("Butuh cakar serigala", tx + 0.5, ty - 0.5, "#e8d8c0");
        }
      }
    }
  }
  // A sickle swing knocks arrows back at their owners.
  if (hit.form === "human") {
    for (const s of state.shots) {
      if (s.kind !== "arrow" || s.friendly) continue;
      if (s.x > box.l - 0.3 && s.x < box.r + 0.3 && s.y > box.t - 0.3 && s.y < box.b + 0.3) {
        s.friendly = true;
        s.vx = -s.vx * 1.4;
        s.vy = 0;
        state.player.deflectFlash = 0.25;
        env.sfx("deflect");
        env.fx("hit_spark", s.x, s.y, { scale: 0.6 });
        env.text("Tangkis!", s.x, s.y - 0.8, "#bfe3ff");
        gainUlti(state, 6, env);
      }
    }
  }
  if (hits > 0) state.hitstop = Math.max(state.hitstop, hit.heavy ? 0.09 : 0.05);
  return { hits, kills };
}

export function applyEnemyHit(state, env, e, hit) {
  const p = state.player;
  if (e.type === "stitcher" && p.thread && p.thread.id === e.id && hit.kind !== "lightning" && hit.kind !== "spirit") {
    env.sfx("deflect");
    env.text("Putus benangnya dulu", e.x, e.y - e.h - 0.4, "#d9b8ff");
    return "blocked";
  }
  if (e.type === "knight" && e.shield) {
    if (hit.crack && !e.cracked) {
      e.cracked = true;
      env.fx("armor_crack", e.x + e.facing * 0.35, e.y - 1.0, { scale: 0.8 });
      env.text("Perisai retak!", e.x, e.y - 2.3, "#ffd2a8");
      env.sfx("break");
    }
    const fromFront = Math.sign(hit.fromX - e.x || 1) === e.facing;
    if (fromFront && !hit.ignoreShield) {
      env.sfx("deflect");
      env.fx("hit_spark", e.x + e.facing * 0.5, e.y - 1, { scale: 0.55 });
      e.flash = 0.05;
      return "blocked";
    }
  }
  let dmg = hit.dmg;
  if (e.marked > 0 && hit.consumeMark) {
    dmg += 1.5;
    e.marked = 0;
    gainUlti(state, 18, env);
    env.text("Jejak Perburuan!", e.x, e.y - e.h - 0.6, "#bfe3ff");
  }
  if (e.type === "knight" && hit.fromX !== undefined && Math.sign(hit.fromX - e.x || 1) !== e.facing && hit.kind === "pounce") dmg *= 2;
  if (e.type === "mimic" && e.disguised) {
    e.disguised = false;
    e.revealed = true;
    e.state = "reveal";
    e.t = 0;
  }
  e.hp -= dmg;
  e.flash = 0.12;
  e.stun = Math.max(e.stun, hit.stun ?? 0.3);
  if (!(e.type === "knight" && e.shield)) e.vx = (hit.dir || 1) * (hit.knock ?? 3);
  if (hit.lift && !e.fly) e.vy = -hit.lift;
  if (hit.mark) {
    e.marked = 8;
    env.fx("moon_mark", e.x, e.y - e.h - 0.5, { scale: 0.55, follow: e.id, dur: 0.5 });
  }
  addCombo(state);
  gainUlti(state, hit.ulti ?? 4, env);
  const buffs = env.buffs();
  if (buffs.burn) e.burn = 3;
  if (buffs.freeze) e.frozen = Math.max(e.frozen || 0, hit.kind === "hook" ? 2.5 : 0.9);
  if (hit.echo) {
    env.fx("hit_spark", e.x + (Math.random() - 0.5) * 0.6, e.y - e.h * (0.4 + Math.random() * 0.4), { scale: 0.45 });
  } else {
    env.sfx("hit");
    env.fx("hit_spark", e.x - (hit.dir || 1) * 0.2, e.y - e.h * 0.6, { scale: 0.55 + Math.min(dmg, 3) * 0.1 });
    env.haptic(12);
    if (buffs.hits > 1) env.text(`×${buffs.hits}`, e.x + 0.5, e.y - e.h - 0.2, "#ffd2a8");
  }
  // Petir Badai: pounces and dashes arc lightning to nearby enemies.
  if (buffs.lightning && !hit.echo && !hit.noChain && ["pounce", "dash", "lunge", "eclipseSlam"].includes(hit.kind)) {
    const near = state.enemies.filter((o) => o !== e && !o.dead && Math.hypot(o.x - e.x, o.y - e.y) < 6).slice(0, 3);
    for (const o of near) {
      state.bolts.push({ x1: e.x, y1: e.y - e.h * 0.5, x2: o.x, y2: o.y - o.h * 0.5, t: 0 });
      applyEnemyHit(state, env, o, { kind: "lightning", form: hit.form, dmg: 1.5, dir: Math.sign(o.x - e.x) || 1, fromX: e.x, knock: 2, noChain: true, ignoreShield: true });
    }
    if (near.length) env.sfx("snap");
  }
  if (e.vp && e.vp.splits && !e.split && e.hp > 0) {
    e.split = true;
    state.spawnQueue.push({ type: e.variant, x: e.x - (hit.dir || 1) * 1.2, y: e.y, hpMul: 0.34, split: true });
    env.text("Membelah!", e.x, e.y - e.h - 0.4, "#d9b8ff");
  }
  if (e.hp <= 0) {
    killEnemy(state, env, e);
    return "kill";
  }
  return "hit";
}

export function killEnemy(state, env, e) {
  if (e.dead) return;
  e.dead = true;
  e.deathT = 0;
  state.score += 100;
  state.stats.kills += 1;
  if (state.player.thread && state.player.thread.id === e.id) state.player.thread = null;
  spawnOrb(state, e.x, e.y - e.h * 0.6, 1);
  const p = state.player;
  if (env.buffs().lifesteal && !p.dead) {
    p.killCount = (p.killCount || 0) + 1;
    if (p.killCount % 4 === 0 && p.hp < p.maxHp) {
      p.hp += 1;
      env.text("+1 hati", p.x, p.y - 2.2, "#ff9a9a");
    }
  }
  env.sfx("enemy_die");
  env.shake(0.25);
}

export function spawnOrb(state, x, y, n = 1) {
  for (let i = 0; i < n; i++) {
    state.orbs.push({ id: `orb${state.nextId++}`, x: x + (i - (n - 1) / 2) * 0.4, y, vy: -5 - i, vx: (i - (n - 1) / 2) * 1.5, t: 0, carrier: null });
  }
}

export function damagePlayer(state, env, dmg, fromX, slow = 0) {
  const p = state.player;
  if (p.invuln > 0 || p.dead || state.over) return false;
  p.hp -= dmg;
  if (slow) p.slowT = Math.max(p.slowT || 0, slow);
  p.invuln = 1.1;
  const dir = Math.sign(p.x - fromX) || -p.facing;
  p.vx = dir * 7;
  p.vy = -6;
  p.onGround = false;
  p.hang = null;
  p.swing = null;
  p.hookShot = null;
  if (p.form !== "eclipse") p.act = { type: "hurt", t: 0, dur: 0.32 };
  state.combo.count = 0;
  state.hurtFlash = 0.35;
  env.sfx("hurt");
  if (p.hp === 1) env.sfx("low_hp");
  env.shake(0.8);
  env.haptic(40);
  if (p.hp <= 0 && env.buffs().revive && !p.reviveUsed) {
    p.hp = 2;
    p.reviveUsed = true;
    p.invuln = 2.2;
    env.text("Roh leluhur membangkitkanmu!", p.x, p.y - 2.4, "#8ff0ff");
    env.fx("moon_burst", p.x, p.y - 0.8, { scale: 1.6 });
    env.sfx("spirit");
  }
  if (p.hp <= 0) {
    p.hp = 0;
    p.dead = true;
    p.deadT = 0;
    env.sfx("death");
  }
  return true;
}
