// Shared constants for the world simulation. World units are tiles: one
// terrain tile = 1 unit; y grows downward and an actor's y is its feet.

export const ROWS = 18;
export const GRAVITY = 38;

// Collision boxes per form (tiles). The wolf is low enough for 1-tile tunnels.
export const SIZES = {
  human: { w: 0.62, h: 1.5 },
  wolf: { w: 1.05, h: 0.8 },
  eclipse: { w: 1.0, h: 2.1 },
};

export const TILE = { EMPTY: 0, SOLID: 1, PLANK: 2, FRAGILE: 3, BARRICADE: 4, GATE: 5 };
export const isSolidTile = (t) => t === 1 || t === 3 || t === 4 || t === 5;

// Enemy stats: hit box (tiles) and health.
export const ENEMY_STATS = {
  archer: { w: 0.7, h: 1.6, hp: 2 },
  lantern: { w: 0.8, h: 1.7, hp: 3 },
  knight: { w: 1.0, h: 1.9, hp: 5 },
  crow: { w: 0.9, h: 0.7, hp: 1, fly: true },
  hound: { w: 1.1, h: 0.85, hp: 3 },
  stitcher: { w: 0.8, h: 1.6, hp: 2, fly: true },
  mimic: { w: 1.0, h: 0.8, hp: 3 },
};

export const ENEMY_NAMES = {
  archer: "Pemanah bertopeng",
  lantern: "Pemburu lentera",
  knight: "Ksatria duri",
  crow: "Gagak pencuri bulan",
  hound: "Anjing mekanik",
  stitcher: "Penjahit bayangan",
  mimic: "Peniru kawanan",
};

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const sign = (v) => (v < 0 ? -1 : 1);
