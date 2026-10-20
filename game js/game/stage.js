// Level data. Stage 1 is authored with a tiny builder API (ground, blocks,
// planks, objects) so distances stay readable; Endless mode strings random
// chunks from the same vocabulary. The result is plain JSON kept in state.

import { ROWS } from "./config.js";

export function makeBuilder(cols) {
  const rows = ROWS;
  let nextId = 1;
  const id = (p) => `${p}${nextId++}`;
  const L = {
    cols,
    rows,
    tiles: new Array(cols * rows).fill(0),
    theme: new Array(cols).fill(0),
    altars: [],
    shadows: [],
    wheels: [],
    rings: [],
    levers: [],
    shards: [],
    checkpoints: [],
    decor: [],
    lamps: [],
    hints: [],
    enemies: [],
    boss: null,
    start: { x: 3, y: 14 },
    arena: null,
    sections: [],
    tileKeys: ["TILES_VILLAGE", "TILES_FOREST"],
    layerKeys: ["VILLAGE_LAYER", "FOREST_LAYER"],
    area: 0,
    drift: 0,
    tint: null,
  };
  const set = (x, y, v) => {
    if (x >= 0 && x < cols && y >= 0 && y < rows) L.tiles[y * cols + x] = v;
  };
  const fill = (x0, y0, w, h, v = 1) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) set(x, y, v);
  };
  return {
    L,
    id,
    fill,
    ground: (x0, x1, top = 14) => fill(x0, top, x1 - x0 + 1, rows - top, 1),
    clear: (x0, y0, w, h) => fill(x0, y0, w, h, 0),
    plank: (x, y, w) => fill(x, y, w, 1, 2),
    theme: (x0, x1, t) => {
      for (let x = Math.max(0, x0); x <= Math.min(cols - 1, x1); x++) L.theme[x] = t;
    },
    altar: (x, y = 14) => {
      const a = { id: id("altar"), x: x + 0.5, y, activeT: 0 };
      L.altars.push(a);
      return a.id;
    },
    // Shadow platforms are one-way surfaces that exist only while their altar glows.
    shadow: (altar, x, y, w, kind = "bridge") =>
      L.shadows.push({ id: id("sh"), altar, x, y, w, kind, lit: false }),
    wheel: (altar, cx, cy, r) =>
      L.wheels.push({ id: id("wh"), altar, cx, cy, r, ang: 0, lit: [false, false, false, false] }),
    ring: (x, y) => L.rings.push({ id: id("ring"), x: x + 0.5, y }),
    lever: (x, gate) => L.levers.push({ id: id("lever"), x: x + 0.5, y: 14, on: false, gate }),
    shard: (x, y, secret = false) =>
      L.shards.push({ id: id("shard"), x: x + 0.5, y, taken: false, secret }),
    checkpoint: (x, name, y = 14) =>
      L.checkpoints.push({ id: id("cp"), x: x + 0.5, y, on: false, name }),
    decor: (kind, x, y = 14, scale = 1, back = true) =>
      L.decor.push({ id: id("dc"), kind, x: x + 0.5, y, scale, back }),
    lamp: (x, y, base, amp, period) =>
      L.lamps.push({ id: id("lamp"), x: x + 0.5, y, base, amp, period, ang: base }),
    hint: (x, text) => L.hints.push({ x, text, shown: false }),
    enemy: (type, x, y = 14, extra = {}) =>
      L.enemies.push({ type, x: x + 0.5, y, ...extra }),
    section: (x, name) => L.sections.push({ x, name }),
  };
}

// ---------------------------------------------------------------- Stage 1
export function buildStage1() {
  const b = makeBuilder(323);
  const { L } = b;

  // 1. Desa Berkabut — learn moving, slashing, transforming.
  b.section(0, "Desa Berkabut");
  b.ground(0, 15);
  L.start = { x: 3.5, y: 14 };
  b.decor("lamp_post", 6);
  b.decor("signpost", 10);
  b.decor("barrel", 14);
  b.hint(1, "Geser kiri-kanan dan lompat untuk menyusuri desa");
  b.ground(19, 33);
  b.fill(25, 12, 3, 2);
  b.shard(26, 12);
  b.fill(30, 11, 4, 3);
  b.enemy("archer", 32, 11);
  b.decor("gravestone", 21);
  b.hint(21, "Attack 3x: tebasan ketiga memberi tanda bulan");
  b.ground(34, 48);
  b.fill(37, 5, 9, 8); // low tunnel roof: only the wolf fits underneath
  b.shard(41, 14);
  b.hint(34, "Ubah wujud jadi serigala untuk merayap di lorong rendah");
  b.ground(49, 62);
  b.fill(50, 9, 1, 5, 4); // cracked barricade, 5 tall
  b.hint(46, "Cakar serigala menghancurkan kayu retak");
  b.decor("lamp_post", 55);
  b.checkpoint(59, "Gerbang Desa");

  // 2. Gerbang Desa — hook rings, levers, knights, hounds and crows.
  b.section(59, "Gerbang Desa");
  b.ring(66, 8);
  b.hint(60, "Manusia: Skill mengait cincin bulan — lompat saat berayun");
  b.ground(70, 128);
  b.enemy("knight", 80);
  b.hint(74, "Ksatria duri: serang dari belakang, atau gigit lalu kait perisainya");
  b.fill(88, 5, 1, 9, 5); // gate
  b.lever(85, { x: 88, y: 5, h: 9 });
  b.hint(83, "Tebas tuas untuk membuka gerbang");
  b.plank(91, 11, 4);
  b.plank(96, 8, 4);
  b.plank(101, 8, 6);
  b.shard(104, 8);
  b.enemy("crow", 106, 5);
  b.fill(97, 12, 2, 2);
  b.enemy("archer", 98, 12);
  b.fill(108, 14, 3, 2, 3); // fragile floor over a pit
  b.clear(108, 16, 3, 2);
  b.enemy("hound", 117);
  b.hint(102, "Anjing mekanik mengejar suara — pancing ke lantai rapuh");
  b.enemy("crow", 113, 6);
  b.decor("barrel", 120);
  b.checkpoint(122, "Altar Bulan");

  // 3. Altar Bulan — howls raise shadow bridges, wheels and ladders.
  b.section(122, "Altar Bulan");
  const a1 = b.altar(126);
  b.decor("fallen_tree", 124, 14, 1.6);
  b.hint(119, "Serigala: tekan Skill di altar untuk melolong");
  b.clear(129, 14, 11, 4);
  b.shadow(a1, 129, 14, 11);
  b.ground(140, 156);
  b.enemy("lantern", 148, 14, { range: 4 });
  b.hint(138, "Sorot lentera menghapus bayangan — kait lenteranya");
  b.enemy("stitcher", 153, 11.5);
  const a2 = b.altar(154);
  b.decor("mill_wheel", 161, 12.5, 2.2);
  b.wheel(a2, 161, 9.5, 3);
  b.ground(166, 196);
  const a3 = b.altar(168);
  b.decor("iron_bars", 173.5, 14, 2.6);
  b.fill(176, 4, 2, 10);
  b.shadow(a3, 172, 11.6, 1.8, "step");
  b.shadow(a3, 174, 9.2, 1.8, "step");
  b.shadow(a3, 172, 6.8, 1.8, "step");
  b.shard(176.5, 4);
  b.lamp(176.1, 3.2, Math.PI * 0.68, Math.PI * 0.17, 4.5);
  b.decor("guard_lamp", 176.1, 4, 0.9);
  b.hint(166, "Tangga bayangan hilang saat disorot lampu penjaga");
  b.enemy("mimic", 186);
  b.hint(183, "Serigala bisa mengendus serigala palsu");
  b.fill(192, 12, 3, 2);
  b.enemy("archer", 193, 12);
  b.checkpoint(196, "Hutan Merah");

  // 4. Hutan Merah — three routes that meet again.
  b.section(196, "Hutan Merah");
  b.theme(197, 322, 1);
  b.ground(197, 290);
  b.clear(205, 14, 2, 3); // drop into the low root tunnel
  b.clear(207, 16, 41, 1);
  b.clear(248, 14, 2, 3);
  b.shard(215, 17, true);
  b.shard(228, 17, true);
  b.fill(233, 16, 1, 1, 4);
  b.shard(238, 17, true);
  b.hint(201, "Lorong akar di bawah menyimpan rahasia");
  b.plank(208, 11, 4);
  b.ring(214, 6);
  b.plank(218, 7, 5);
  b.ring(227, 5);
  b.plank(232, 8, 6);
  b.shard(235, 8);
  b.enemy("crow", 230, 4);
  b.enemy("knight", 214);
  b.fill(222, 12, 2, 2);
  b.enemy("archer", 223, 12);
  b.enemy("hound", 236);
  b.enemy("stitcher", 241, 11.5);
  b.decor("red_bush", 245);
  const a4 = b.altar(254);
  b.enemy("lantern", 250, 14, { range: 3 });
  b.clear(258, 14, 9, 4);
  b.ring(262, 8);
  b.shadow(a4, 258, 14, 9);
  b.decor("dead_tree", 269, 14, 1.4);
  b.enemy("mimic", 272);
  b.fill(275, 11, 3, 3);
  b.shard(276, 11);
  b.enemy("mimic", 281);
  b.decor("red_bush", 284);
  b.checkpoint(287, "Arena Bulan");

  // 5. Arena — the Shadowless Wolf.
  b.section(287, "Arena Bulan");
  b.ground(291, 322);
  b.fill(322, 0, 1, 14);
  const a5 = b.altar(306);
  b.shadow(a5, 296, 11, 4);
  b.shadow(a5, 312, 11, 4);
  b.shadow(a5, 304, 8, 4);
  b.decor("dead_tree", 294, 14, 1.2);
  b.decor("dead_tree", 318, 14, 1.3);
  L.arena = { gateX: 292, trigger: 296, x0: 293, x1: 321 };
  L.boss = { x: 316.5, y: 14 };

  // Scenery sprinkles on the village ground.
  b.decor("lamp_post", 74);
  b.decor("gravestone", 143);
  b.decor("signpost", 190);
  b.decor("red_bush", 200);
  b.decor("red_bush", 226);
  return L;
}

// ---------------------------------------------------------------- Endless
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ENEMY_POOL = [
  ["archer", "hound", "crow"],
  ["archer", "hound", "crow", "knight", "lantern"],
  ["archer", "hound", "crow", "knight", "lantern", "stitcher", "mimic"],
];

// Enemy types whose base AI flies (spawn height differs).
const FLYERS = new Set(["crow", "sprite", "bat", "gargoyle"]);
const HOVERERS = new Set(["stitcher", "wraith", "spider", "witch"]);

export function placeEnemy(b, type, x, r) {
  if (FLYERS.has(type)) b.enemy(type, x, 6 + Math.floor(r() * 3));
  else if (HOVERERS.has(type)) b.enemy(type, x, 11.5);
  else b.enemy(type, x, 14, { range: 3 });
}

// One playable chunk starting at x on flat ground; returns the next x.
export function addChunk(b, x, kind, r, pool, enemyCount) {
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const placeEnemies = (x0, x1, n) => {
    for (let k = 0; k < n; k++) placeEnemy(b, pick(pool), x0 + 1 + Math.floor(r() * Math.max(1, x1 - x0 - 2)), r);
  };
  if (kind === "flat") {
    const w = 16 + Math.floor(r() * 6);
    b.ground(x, x + w - 1);
    if (r() < 0.5) {
      b.fill(x + 6, 12, 3, 2);
      b.shard(x + 7, 12);
    }
    placeEnemies(x + 3, x + w - 2, enemyCount);
    return x + w;
  }
  if (kind === "gap") {
    const g = 2 + Math.floor(r() * 3);
    b.ground(x, x + 6);
    b.ground(x + 7 + g, x + 16 + g);
    b.shard(x + 7 + Math.floor(g / 2), 11);
    placeEnemies(x + 8 + g, x + 16 + g, Math.max(1, enemyCount - 1));
    return x + 17 + g;
  }
  if (kind === "ring") {
    b.ground(x, x + 5);
    b.ring(x + 9, 8);
    b.ground(x + 13, x + 21);
    placeEnemies(x + 14, x + 21, Math.max(1, enemyCount - 1));
    return x + 22;
  }
  if (kind === "bridge") {
    b.ground(x, x + 6);
    const a = b.altar(x + 3);
    b.shadow(a, x + 7, 14, 10);
    b.ground(x + 17, x + 24);
    placeEnemies(x + 18, x + 24, 1);
    return x + 25;
  }
  if (kind === "tunnel") {
    b.ground(x, x + 17);
    b.fill(x + 5, 5, 8, 8);
    b.shard(x + 9, 14, true);
    placeEnemies(x + 13, x + 17, 1);
    return x + 18;
  }
  if (kind === "barricade") {
    b.ground(x, x + 15);
    b.fill(x + 7, 9, 1, 5, 4);
    placeEnemies(x + 9, x + 15, Math.max(1, enemyCount - 1));
    return x + 16;
  }
  if (kind === "planks") {
    b.ground(x, x + 19);
    b.plank(x + 4, 11, 4);
    b.plank(x + 10, 8, 5);
    b.shard(x + 12, 8);
    placeEnemies(x + 3, x + 19, enemyCount);
    return x + 20;
  }
  if (kind === "fragile") {
    b.ground(x, x + 17);
    b.fill(x + 7, 14, 3, 2, 3);
    b.clear(x + 7, 16, 3, 2);
    placeEnemies(x + 12, x + 17, 1);
    return x + 18;
  }
  if (kind === "wheel") {
    b.ground(x, x + 5);
    const a = b.altar(x + 2);
    b.wheel(a, x + 10, 9.5, 3);
    b.ground(x + 15, x + 22);
    return x + 23;
  }
  if (kind === "lever") {
    b.ground(x, x + 17);
    b.fill(x + 9, 5, 1, 9, 5);
    b.lever(x + 6, { x: x + 9, y: 5, h: 9 });
    placeEnemies(x + 11, x + 17, enemyCount);
    return x + 18;
  }
  if (kind === "cars") {
    // train cars: short roofs with gaps, a ring over the widest gap
    let cx = x;
    for (let c = 0; c < 3; c++) {
      const w = 7 + Math.floor(r() * 3);
      b.ground(cx, cx + w - 1, 13);
      if (c === 1) placeEnemies(cx + 1, cx + w - 1, Math.max(1, enemyCount - 1));
      cx += w + 2 + (c === 1 ? 2 : 0);
    }
    b.ring(cx - 3, 8);
    b.ground(cx, cx + 4);
    return cx + 5;
  }
  b.ground(x, x + 9);
  return x + 10;
}

const KINDS = ["flat", "gap", "ring", "bridge", "tunnel", "barricade", "planks", "fragile", "wheel", "lever", "flat"];

export function buildEndless(seed = 1, extra = null) {
  const CHUNKS = 70;
  const b = makeBuilder(CHUNKS * 24 + 40);
  const { L } = b;
  const r = rng(seed);
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  b.ground(0, 13);
  L.start = { x: 3.5, y: 14 };
  b.hint(1, "Perjalanan tanpa akhir — sejauh mana kau bisa lari?");
  if (extra) {
    L.tileKeys = [...L.tileKeys, ...extra.tileKeys];
    L.layerKeys = [...L.layerKeys, ...extra.layerKeys];
  }
  let x = 14;
  for (let i = 0; i < CHUNKS; i++) {
    const tier = i < 6 ? 0 : i < 16 ? 1 : 2;
    const useExtra = extra && i >= 8 && Math.floor(i / 4) % 2 === 1;
    const pool = useExtra ? extra.pool : ENEMY_POOL[tier];
    const theme = useExtra ? 2 : Math.floor(i / 4) % 2;
    const start = x;
    const enemyCount = Math.min(4, 1 + Math.floor(i / 8) + (r() < 0.4 ? 1 : 0));
    x = addChunk(b, x, i === 0 ? "flat" : pick(KINDS), r, pool, enemyCount);
    b.theme(start, x, theme);
    if (i % 3 === 2 && !useExtra) b.decor(pick(["lamp_post", "gravestone", "red_bush", "barrel", "dead_tree"]), x - 2);
  }
  b.ground(x, L.cols - 1);
  return L;
}
