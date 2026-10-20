// The game's Creator Tools vocabulary: what exists (catalog), what is on
// screen (describeScene), and what the editor may drive. Commands call the
// game's real functions. Pause, step, speed and restart belong to the SDK.

const ENEMIES = [
  ["archer", "Pemanah bertopeng", "ENEMY_ARCHER", "idle"],
  ["lantern", "Pemburu lentera", "ENEMY_LANTERN", "walk"],
  ["knight", "Ksatria duri", "ENEMY_KNIGHT", "walk"],
  ["crow", "Gagak pencuri bulan", "ENEMY_CROW", "fly"],
  ["hound", "Anjing mekanik", "ENEMY_HOUND", "run"],
  ["stitcher", "Penjahit bayangan", "ENEMY_STITCHER", "float"],
  ["mimic", "Peniru kawanan", "ENEMY_MIMIC", "disguise"],
];

const HUD_PARTS = [
  ["hud-hearts", "Hati", ".hearts"],
  ["hud-ulti", "Meteran ulti", ".ulti-meter"],
  ["hud-shards", "Pecahan bulan", ".shard-badge"],
  ["hud-pause", "Tombol jeda", ".pause-btn"],
  ["hud-boss", "Darah boss", ".boss-bar"],
  ["hud-combo", "Combo", ".combo"],
  ["hud-toast", "Petunjuk", ".toast"],
  ["touch-controls", "Tombol sentuh", ".controls"],
];

export function createDevtools({ mount, game }) {
  const rectOfEl = (sel) => {
    const el = mount.querySelector(sel);
    if (!el || el.hidden || el.closest("[hidden]")) return null;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  };

  return {
    game: "Sabit & Taring",

    catalog({ level, screen, definition, keysFor }) {
      return {
        levels: [
          ...game.areas.map((a) => level(`level:area-${a.id}`, `${a.id}. ${a.name}`, { index: a.id })),
          level("level:endless", "Perjalanan Tanpa Akhir", { index: game.areas.length }),
        ],
        screens: [
          screen("screen:pause", "Jeda"),
          screen("screen:map", "Peta Perjalanan"),
          screen("screen:wardrobe", "Lemari Skin"),
          screen("screen:result", "Hasil"),
        ],
        definitions: [
          definition("def:player", "Pemburu / Serigala", { tweakKeys: keysFor("def:player"), nodeKinds: ["player"], sprite: "HERO_HUMAN_MOVE", spriteFrame: "idle", category: "characters" }),
          definition("def:eclipse", "Eclipse Form", { tweakKeys: keysFor("def:eclipse"), nodeKinds: ["eclipse"], sprite: "HERO_ECLIPSE", spriteFrame: "idle", category: "characters" }),
          ...ENEMIES.map(([id, label, sprite, frame]) =>
            definition(`def:${id}`, label, { tweakKeys: keysFor(`def:${id}`), nodeKinds: [id], sprite, spriteFrame: frame, singleton: false, category: "characters" }),
          ),
          ...Object.entries(game.variants).map(([id, v]) =>
            definition(`def:${id}`, v.name, { tweakKeys: keysFor(`def:${id}`), nodeKinds: [id], sprite: v.sheet, spriteFrame: { archer: "idle", lantern: "walk", knight: "walk", crow: "fly", hound: "run", stitcher: "float", mimic: "disguise" }[v.base], singleton: false, category: "characters" }),
          ),
          ...game.areas.filter((a) => a.bossDef).map((a) =>
            definition(`def:boss-a${a.id}`, a.boss, { tweakKeys: keysFor(`def:boss-a${a.id}`), nodeKinds: [`boss-a${a.id}`], sprite: a.bossDef.sheet, category: "characters" }),
          ),
          definition("def:boss", "Serigala Tanpa Bayangan", { tweakKeys: keysFor("def:boss"), nodeKinds: ["boss"], sprite: "BOSS_HUMAN", spriteFrame: "human_idle", category: "characters" }),
          definition("def:moon-altar", "Altar bulan", { tweakKeys: keysFor("def:moon-altar"), nodeKinds: ["moon-altar"], sprite: "PROPS_OBJECTS", spriteFrame: "moon_altar", singleton: false, category: "world" }),
          definition("def:shadow-platform", "Platform bayangan", { tweakKeys: keysFor("def:shadow-platform"), nodeKinds: ["shadow-platform"], sprite: "PROPS_WORLD", spriteFrame: "shadow_block", singleton: false, category: "world" }),
          definition("def:moon-ring", "Cincin bulan", { tweakKeys: keysFor("def:moon-ring"), nodeKinds: ["moon-ring"], sprite: "PROPS_OBJECTS", spriteFrame: "moon_ring", singleton: false, category: "world" }),
          definition("def:lever", "Tuas gerbang", { tweakKeys: keysFor("def:lever"), nodeKinds: ["lever"], sprite: "PROPS_OBJECTS", spriteFrame: "lever_off", singleton: false, category: "world" }),
          definition("def:checkpoint", "Checkpoint", { tweakKeys: keysFor("def:checkpoint"), nodeKinds: ["checkpoint"], sprite: "PROPS_OBJECTS", spriteFrame: "checkpoint_on", singleton: false, category: "world" }),
          definition("def:moon-shard", "Pecahan bulan", { tweakKeys: keysFor("def:moon-shard"), nodeKinds: ["moon-shard"], sprite: "PROPS_OBJECTS", spriteFrame: "moon_shard", singleton: false, category: "pickups" }),
          definition("def:energy-orb", "Energi bulan", { tweakKeys: keysFor("def:energy-orb"), nodeKinds: ["energy-orb"], singleton: false, category: "pickups" }),
          definition("def:terrain", "Tanah & batu", { tweakKeys: keysFor("def:terrain"), nodeKinds: ["terrain"], sprite: "TILES_VILLAGE", spriteFrame: "top", category: "world" }),
          definition("def:backdrop", "Langit & siluet", { tweakKeys: keysFor("def:backdrop"), nodeKinds: ["backdrop"], sprite: "SKY_BG", category: "world" }),
          definition("def:camera", "Kamera", { tweakKeys: keysFor("def:camera"), nodeKinds: ["camera"], category: "system" }),
          definition("def:effects", "Efek serangan", { tweakKeys: keysFor("def:effects"), nodeKinds: ["effect"], sprite: "FX_COMBAT", spriteFrame: "slash", category: "effects" }),
          ...HUD_PARTS.map(([id, label]) => definition(`def:${id}`, label, { tweakKeys: keysFor(`def:${id}`), nodeKinds: [id], category: "interface" })),
        ],
      };
    },

    describeScene() {
      const s = game.state;
      const nodes = [];
      if (!s.level || !s.player) return { nodes };
      const v = game.view;
      const cam = s.cam;
      const box = (wx, wyTop, ww, wh) => {
        const a = game.renderer.toScreen(wx - ww / 2, wyTop, cam);
        return { x: a.x, y: a.y, w: ww * v.T, h: wh * v.T };
      };
      const onScreen = (wx) => Math.abs(wx - cam.x) < v.W / v.T / 2 + 2;
      nodes.push({ id: "backdrop", defId: "def:backdrop", kind: "backdrop", label: "Langit & siluet", rect: { x: v.left, y: v.top, w: v.W, h: v.H }, instance: {} });
      const p = s.player;
      nodes.push({
        id: "player",
        defId: p.form === "eclipse" ? "def:eclipse" : "def:player",
        kind: p.form === "eclipse" ? "eclipse" : "player",
        label: p.form === "human" ? "Pemburu" : p.form === "wolf" ? "Serigala" : "Eclipse Form",
        rect: box(p.x, p.y - p.h, p.w, p.h),
        instance: { form: p.form, hp: p.hp, ulti: Math.round(p.ulti) },
      });
      for (const e of s.enemies) {
        if (e.dead || !onScreen(e.x)) continue;
        const kind = e.variant || e.type;
        nodes.push({ id: e.id, defId: `def:${kind}`, kind, label: kind, rect: box(e.x, e.y - e.h, e.w, e.h), instance: { hp: e.hp, marked: e.marked > 0 } });
      }
      const b = s.boss;
      const bossDef = b && b.kind === "area" ? `boss-a${s.level.area}` : "boss";
      if (b && b.active && !b.dead) nodes.push({ id: "boss", defId: `def:${bossDef}`, kind: bossDef, label: b.name || "Serigala Tanpa Bayangan", rect: box(b.x, b.y - b.h, b.w, b.h), instance: { hp: Math.round(b.hp), form: b.form, phase: b.phase } });
      for (const a of s.level.altars) if (onScreen(a.x)) nodes.push({ id: a.id, defId: "def:moon-altar", kind: "moon-altar", label: "Altar bulan", rect: box(a.x, a.y - 1.2, 1.3, 1.2), instance: { active: a.activeT > 0 } });
      for (const sh of s.level.shadows) if (onScreen(sh.x + sh.w / 2)) nodes.push({ id: sh.id, defId: "def:shadow-platform", kind: "shadow-platform", label: "Platform bayangan", rect: box(sh.x + sh.w / 2, sh.y, sh.w, 1), instance: { lit: sh.lit } });
      for (const r of s.level.rings) if (onScreen(r.x)) nodes.push({ id: r.id, defId: "def:moon-ring", kind: "moon-ring", label: "Cincin bulan", rect: box(r.x, r.y - 0.6, 0.9, 1.1), instance: {} });
      for (const lv of s.level.levers) if (onScreen(lv.x)) nodes.push({ id: lv.id, defId: "def:lever", kind: "lever", label: "Tuas", rect: box(lv.x, lv.y - 1, 1, 1), instance: { on: lv.on } });
      for (const cp of s.level.checkpoints) if (onScreen(cp.x)) nodes.push({ id: cp.id, defId: "def:checkpoint", kind: "checkpoint", label: cp.name, rect: box(cp.x + 0.3, cp.y - 2, 1.2, 2), instance: { on: cp.on } });
      for (const sh of s.level.shards) if (!sh.taken && onScreen(sh.x)) nodes.push({ id: sh.id, defId: "def:moon-shard", kind: "moon-shard", label: "Pecahan bulan", rect: box(sh.x, sh.y - 0.9, 0.6, 0.7), instance: { secret: sh.secret } });
      for (const o of s.orbs) if (onScreen(o.x)) nodes.push({ id: o.id, defId: "def:energy-orb", kind: "energy-orb", label: "Energi bulan", rect: box(o.x, o.y - 0.25, 0.5, 0.5), instance: {} });
      for (const [id, label, sel] of HUD_PARTS) {
        const r = rectOfEl(sel);
        if (r) nodes.push({ id, defId: `def:${id}`, kind: id, label, rect: r, instance: {} });
      }
      return { nodes };
    },

    getState: () => {
      const s = game.state;
      if (!s.player) return {};
      return {
        run: s.runKind,
        section: s.sectionName,
        hearts: s.player.hp,
        ulti: Math.round(s.player.ulti),
        score: s.score,
        shards: s.stats.shards,
        skin: s.skinId,
        level: { id: s.runKind === "endless" ? "level:endless" : `level:area-${s.level.area || 0}`, index: s.runKind === "endless" ? game.areas.length : s.level.area || 0 },
      };
    },
    getScreen: () => {
      const s = game.state;
      if (s.screen === "map") return "screen:map";
      if (s.screen === "wardrobe") return "screen:wardrobe";
      if (s.over) return "screen:result";
      if (s.paused) return "screen:pause";
      return null;
    },
    showScreen: (id) => {
      const s = game.state;
      if (id === "screen:pause") s.paused = true;
      else if (id === "screen:map") game.openMap();
      else if (id === "screen:wardrobe") game.openWardrobe();
      else if (id === null) {
        s.screen = null;
        s.paused = false;
      }
    },
    gotoLevel: (index) => game.loadLevel(index),
    commands: {
      "fill-ulti": { label: "Isi ulti", icon: "Moon", description: "Fill the crescent meter so Eclipse is ready", mutates: true, run: () => game.fillUlti() },
      heal: { label: "Pulihkan hati", icon: "Heart", description: "Refill all hearts", mutates: true, run: () => game.heal() },
      "next-checkpoint": { label: "Ke checkpoint berikutnya", icon: "SkipForward", description: "Teleport to the next checkpoint ahead", mutates: true, run: () => game.skipToNextCheckpoint() },
      "unlock-areas": { label: "Buka semua area", icon: "Map", description: "Mark every area as cleared so the whole map is open", mutates: true, run: () => game.unlockAll() },
      respawn: { label: "Bangkit di checkpoint", icon: "RotateCcw", description: "Respawn at the last checkpoint", mutates: true, run: () => game.respawn() },
    },
  };
}
