// The journey map: Area 0 (the original stage) plus ten new areas. Each new
// area brings two monsters (re-themed variants of the base AIs with their own
// twist), a boss, terrain, a skyline and its own music key.

import { makeBuilder, rng, addChunk } from "./stage.js";

// New monsters: art + stats + twist on top of a base AI.
export const VARIANTS = {
  gunner: { base: "archer", sheet: "MON_GUNNER", name: "Penembak gerbong", hp: 3, burst: 3, interval: 1.8 },
  rat: { base: "hound", sheet: "MON_RAT", name: "Tikus besi", hp: 1.5, speed: 8.5, hunter: true, scale: 0.8, w: 0.9, h: 0.65 },
  toad: { base: "mimic", sheet: "MON_TOAD", name: "Kodok rawa", hp: 4, slowOnHit: 2 },
  wraith: { base: "stitcher", sheet: "MON_WRAITH", name: "Hantu lumpur", hp: 3 },
  stag: { base: "hound", sheet: "MON_STAG", name: "Rusa duri", hp: 4, speed: 11, hunter: true, scale: 1.35, w: 1.4, h: 1.2 },
  sprite: { base: "crow", sheet: "MON_SPRITE", name: "Peri ranting", hp: 2 },
  frost: { base: "knight", sheet: "MON_FROST", name: "Prajurit es", hp: 6, slowOnHit: 1.5 },
  bat: { base: "crow", sheet: "MON_BAT", name: "Kelelawar beku", hp: 2, swoopSpeed: 12, slowOnHit: 1 },
  dancer: { base: "lantern", sheet: "MON_DANCER", name: "Penari topeng", hp: 3, noLight: true, splits: true },
  knifer: { base: "archer", sheet: "MON_KNIFER", name: "Pelempar pisau", hp: 3, fan: 3 },
  golem: { base: "knight", sheet: "MON_GOLEM", name: "Golem kristal", hp: 9 },
  spider: { base: "stitcher", sheet: "MON_SPIDER", name: "Laba-laba gua", hp: 3 },
  monk: { base: "lantern", sheet: "MON_MONK", name: "Biarawan lonceng", hp: 4 },
  gargoyle: { base: "crow", sheet: "MON_GARGOYLE", name: "Gargoyle", hp: 4, swoopSpeed: 13 },
  pirate: { base: "archer", sheet: "MON_PIRATE", name: "Bajak laut tenggelam", hp: 4, shotSpeed: 15 },
  octopus: { base: "mimic", sheet: "MON_OCTOPUS", name: "Gurita bayangan", hp: 5, slowOnHit: 1.5 },
  ashwolf: { base: "hound", sheet: "MON_ASHWOLF", name: "Serigala abu", hp: 4, speed: 9, hunter: true },
  witch: { base: "stitcher", sheet: "MON_WITCH", name: "Penyihir bara", hp: 4, fire: true },
  moonguard: { base: "knight", sheet: "MON_MOONGUARD", name: "Penjaga bulan", hp: 10 },
  mirror: { base: "mimic", sheet: "MON_MIRROR", name: "Bayangan cermin", hp: 6 },
};

const BASE_KEYS = ["ENEMY_ARCHER", "ENEMY_LANTERN", "ENEMY_KNIGHT", "ENEMY_CROW", "ENEMY_HOUND", "ENEMY_STITCHER", "ENEMY_MIMIC"];

export const AREAS = [
  { id: 0, name: "Jalan Menuju Bulan Terkurung", place: "Desa berkabut & hutan merah", boss: "Serigala Tanpa Bayangan", tiles: ["TILES_VILLAGE", "TILES_FOREST"], layers: ["VILLAGE_LAYER", "FOREST_LAYER"], monsters: [], extraKeys: [...BASE_KEYS, "BOSS_HUMAN", "BOSS_WOLF"], tint: null },
  { id: 1, name: "Kereta Pemburu", place: "Atap gerbong yang melaju", boss: "Lokomotif Pemburu", tiles: ["TILES_A1"], layers: ["LAYER_A1"], monsters: ["gunner", "rat"], kinds: ["cars", "cars", "flat", "gap", "ring", "lever"], tint: "rgba(255,140,60,0.10)", drift: 10, color: "#ff8a3d",
    bossDef: { sheet: "BOSS_A1", rig: "wolf", hp: 55, scale: 1.55, speed: 6, range: 2.6, specials: ["charge", "waves"] } },
  { id: 2, name: "Rawa Lentera", place: "Rawa bercahaya", boss: "Ratu Kunang", tiles: ["TILES_A2"], layers: ["LAYER_A2"], monsters: ["toad", "wraith"], kinds: ["flat", "bridge", "gap", "planks", "fragile", "ring"], tint: "rgba(120,255,120,0.08)", color: "#b8ff6a",
    bossDef: { sheet: "BOSS_A2", rig: "human", hp: 60, scale: 1.35, speed: 4.5, range: 2.4, specials: ["swarm", "summon"] } },
  { id: 3, name: "Menara Rusa", place: "Hutan raksasa", boss: "Rusa Menara", tiles: ["TILES_A3"], layers: ["LAYER_A3"], monsters: ["stag", "sprite"], kinds: ["flat", "planks", "ring", "wheel", "tunnel", "gap"], tint: "rgba(255,210,120,0.07)", color: "#ffd27a",
    bossDef: { sheet: "BOSS_A3", rig: "wolf", hp: 70, scale: 1.8, speed: 5.5, range: 3.2, specials: ["charge", "waves", "swarm"] } },
  { id: 4, name: "Makam Salju", place: "Kuburan beku", boss: "Raja Mayat Beku", tiles: ["TILES_A4"], layers: ["LAYER_A4"], monsters: ["frost", "bat"], kinds: ["flat", "barricade", "gap", "bridge", "lever", "planks"], tint: "rgba(160,220,255,0.12)", color: "#9fe6ff",
    bossDef: { sheet: "BOSS_A4", rig: "human", hp: 80, scale: 1.45, speed: 4.2, range: 2.8, specials: ["swarm", "summon", "waves"] } },
  { id: 5, name: "Pasar Topeng", place: "Pasar malam karnaval", boss: "Dalang Seribu Topeng", tiles: ["TILES_A5"], layers: ["LAYER_A5"], monsters: ["dancer", "knifer"], kinds: ["flat", "planks", "ring", "gap", "lever", "fragile"], tint: "rgba(200,120,255,0.09)", color: "#d9a0ff",
    bossDef: { sheet: "BOSS_A5", rig: "human", hp: 85, scale: 1.4, speed: 5, range: 2.6, specials: ["teleport", "summon", "swarm"] } },
  { id: 6, name: "Tambang Kristal", place: "Gua bercahaya", boss: "Cacing Kristal", tiles: ["TILES_A6"], layers: ["LAYER_A6"], monsters: ["golem", "spider"], kinds: ["tunnel", "flat", "barricade", "wheel", "gap", "bridge"], tint: "rgba(80,255,230,0.08)", color: "#6af0e0",
    bossDef: { sheet: "BOSS_A6", rig: "gen", hp: 95, scale: 1.45, speed: 4, range: 2.6, specials: ["burrow", "swarm", "burrow"] } },
  { id: 7, name: "Biara Lonceng", place: "Biara runtuh", boss: "Lonceng Kutukan", tiles: ["TILES_A7"], layers: ["LAYER_A7"], monsters: ["monk", "gargoyle"], kinds: ["flat", "bridge", "planks", "lever", "ring", "wheel"], tint: "rgba(255,190,110,0.08)", color: "#ffb36a",
    bossDef: { sheet: "BOSS_A7", rig: "human", hp: 105, scale: 1.55, speed: 3.6, range: 2.8, specials: ["rings", "waves", "rings"] } },
  { id: 8, name: "Pelabuhan Kabut", place: "Kapal hantu", boss: "Kapten Tanpa Wajah", tiles: ["TILES_A8"], layers: ["LAYER_A8"], monsters: ["pirate", "octopus"], kinds: ["gap", "flat", "ring", "planks", "bridge", "fragile"], tint: "rgba(90,220,210,0.09)", color: "#6ae0d8",
    bossDef: { sheet: "BOSS_A8", rig: "human", hp: 115, scale: 1.4, speed: 5.5, range: 2.7, specials: ["teleport", "waves", "summon"] } },
  { id: 9, name: "Hutan Abu", place: "Hutan terbakar", boss: "Pemburu Agung", tiles: ["TILES_A9"], layers: ["LAYER_A9"], monsters: ["ashwolf", "witch"], kinds: ["flat", "barricade", "fragile", "ring", "lever", "gap"], tint: "rgba(255,110,50,0.12)", color: "#ff7a3a",
    bossDef: { sheet: "BOSS_A9", rig: "human", hp: 130, scale: 1.4, speed: 5.5, range: 2.8, specials: ["swarm", "teleport", "waves", "summon"] } },
  { id: 10, name: "Istana Bulan", place: "Istana di atas awan", boss: "Penjaga Bulan Terkurung", tiles: ["TILES_A10"], layers: ["LAYER_A10"], monsters: ["moonguard", "mirror"], kinds: ["bridge", "wheel", "flat", "ring", "planks", "tunnel"], tint: "rgba(210,230,255,0.10)", color: "#e8f2ff",
    bossDef: { sheet: "BOSS_A10", rig: "wolf", hp: 160, scale: 1.75, speed: 6, range: 3, specials: ["charge", "rings", "swarm", "waves"] } },
];

// Asset keys an area needs on screen.
export function areaKeys(id) {
  const a = AREAS[id];
  const keys = [...a.tiles, ...a.layers, ...a.extraKeys || []];
  for (const m of a.monsters) keys.push(VARIANTS[m].sheet);
  if (a.bossDef) keys.push(a.bossDef.sheet);
  return keys;
}

// A new area: 3 sections of chunks with checkpoints, then a sealed arena.
export function buildArea(id, seed = id * 977 + 13) {
  const a = AREAS[id];
  const r = rng(seed);
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const W = 560;
  const b = makeBuilder(W);
  const { L } = b;
  L.tileKeys = [...a.tiles];
  L.layerKeys = [...a.layers];
  L.area = id;
  L.drift = a.drift || 0;
  L.tint = a.tint;
  L.hpMul = 1 + id * 0.15;
  b.ground(0, 13);
  L.start = { x: 3.5, y: 14 };
  b.section(0, a.name);
  b.hint(2, `${a.place} — waspadai ${VARIANTS[a.monsters[0]].name} & ${VARIANTS[a.monsters[1]].name}`);
  let x = 14;
  const sections = ["Bagian 1", "Bagian 2", "Bagian 3"];
  for (let s = 0; s < 3; s++) {
    const chunks = 4 + (id > 5 ? 1 : 0);
    for (let c = 0; c < chunks; c++) {
      const n = Math.min(3, 1 + s + Math.floor(id / 5) + (r() < 0.35 ? 1 : 0));
      x = addChunk(b, x, c === 0 && s === 0 ? "flat" : pick(a.kinds), r, a.monsters, n);
    }
    b.ground(x, x + 7);
    if (s < 2) {
      b.checkpoint(x + 3, `${a.name} — ${sections[s + 1]}`);
      b.section(x, `${a.name} — ${sections[s + 1]}`);
    } else {
      b.checkpoint(x + 3, `Arena ${a.boss}`);
      b.section(x, `Arena ${a.boss}`);
    }
    x += 8;
  }
  // Arena
  const ax = x;
  b.ground(ax, ax + 30);
  b.fill(ax + 30, 0, 1, 14);
  const alt = b.altar(ax + 15);
  b.shadow(alt, ax + 4, 11, 4);
  b.shadow(alt, ax + 22, 11, 4);
  b.shadow(alt, ax + 13, 8, 4);
  L.arena = { gateX: ax - 1, trigger: ax + 3, x0: ax, x1: ax + 29 };
  L.boss = { x: ax + 25.5, y: 14 };
  L.cols = Math.min(L.cols, ax + 31);
  // trim tiles to the new width
  const cols = L.cols;
  const tiles = [];
  for (let y = 0; y < L.rows; y++) for (let xx = 0; xx < cols; xx++) tiles.push(L.tiles[y * W + xx]);
  L.tiles = tiles;
  L.theme = L.theme.slice(0, cols);
  return L;
}
