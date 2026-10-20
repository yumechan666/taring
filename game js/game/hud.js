// DOM HUD and touch controls: hearts, crescent ulti meter, shards, boss bar,
// combo, toasts, and the pause / result overlays. Icons share one 24-unit
// viewBox and one stroke weight.

const svg = (body, extra = "") => `<svg viewBox="0 0 24 24" aria-hidden="true" ${extra}>${body}</svg>`;
const ICONS = {
  left: svg('<path d="M15 5l-7 7 7 7"/>'),
  right: svg('<path d="M9 5l7 7-7 7"/>'),
  down: svg('<path d="M5 9l7 7 7-7"/>'),
  jump: svg('<path d="M12 20V6"/><path d="M6 11l6-6 6 6"/>'),
  sickle: svg('<path d="M5 21l6-6"/><path d="M11 15c5-.5 8.5-4.5 8.5-11-4 .5-8 4-8.5 11z"/>'),
  claw: svg('<path d="M8 3L5 21"/><path d="M13 3l-3 18"/><path d="M18 3l-3 18"/>'),
  hook: svg('<path d="M12 2v10"/><path d="M12 12a5 5 0 1 0 5 5"/><path d="M17 17l2.5-2.5"/><circle cx="12" cy="2.5" r="0.6"/>'),
  pounce: svg('<path d="M4 20L15 9"/><path d="M9 8h7v7"/><circle cx="19" cy="5" r="2"/>'),
  howl: svg('<path d="M15 3a8 8 0 1 0 6 13 6.5 6.5 0 0 1-6-13z"/><path d="M4 21l3-3"/><path d="M2 17l3-1"/>'),
  slam: svg('<path d="M12 3v10"/><path d="M7 9l5 5 5-5"/><path d="M3 20h18"/>'),
  wolf: svg('<path d="M5 3l3 6h8l3-6v10l-7 8-7-8z"/><path d="M9.5 12.5h.01"/><path d="M14.5 12.5h.01"/>'),
  hood: svg('<path d="M5 21c0-9 3-17 7-17s7 8 7 17"/><path d="M9 13c1 1.5 5 1.5 6 0"/>'),
  moon: svg('<path d="M15 3a9 9 0 1 0 6 15A7 7 0 0 1 15 3z"/>'),
  pause: svg('<path d="M9 5v14"/><path d="M15 5v14"/>'),
};

export function createHud({ mount, handlers }) {
  const root = document.createElement("div");
  root.className = "game-root form-human";
  root.innerHTML = `
    <canvas class="game-canvas"></canvas>
    <div class="hud">
      <div class="hud-row hud-top">
        <div class="hud-left">
          <div class="pip-row hearts" aria-label="Nyawa"></div>
          <div class="ulti-meter" aria-label="Energi ulti">
            <span class="ulti-icon">${ICONS.moon}</span>
            <span class="ulti-track"><span class="ulti-fill"></span></span>
          </div>
        </div>
        <div class="hud-right">
          <div class="badge shard-badge"><span class="shard-icon"></span><span class="shard-count">0</span></div>
          <button class="icon-btn pause-btn" type="button" aria-label="Jeda">${ICONS.pause}</button>
        </div>
      </div>
      <div class="boss-bar" hidden>
        <span class="boss-name">Serigala Tanpa Bayangan</span>
        <span class="boss-track"><span class="boss-fill"></span></span>
      </div>
      <div class="combo" hidden><span class="combo-n">0</span><span class="combo-l">combo</span></div>
      <div class="toast" hidden></div>
    </div>
    <div class="controls">
      <div class="pad pad-left">
        <div class="stick" role="group" aria-label="Joystick: geser ke kiri atau kanan untuk bergerak, tarik ke bawah untuk merunduk atau turun">
          <span class="stick-arrow stick-l">${ICONS.left}</span>
          <span class="stick-arrow stick-r">${ICONS.right}</span>
          <span class="stick-arrow stick-d">${ICONS.down}</span>
          <span class="stick-knob"></span>
        </div>
      </div>
      <div class="pad pad-right">
        <button class="ctl ctl-skill" type="button" data-act="skill" aria-label="Skill">
          <span class="ico ico-human">${ICONS.hook}</span><span class="ico ico-wolf">${ICONS.pounce}</span><span class="ico ico-altar">${ICONS.howl}</span><span class="ico ico-eclipse">${ICONS.slam}</span>
        </button>
        <button class="ctl ctl-transform" type="button" data-act="transform" aria-label="Ubah wujud">
          <span class="ico ico-human">${ICONS.wolf}</span><span class="ico ico-wolf">${ICONS.hood}</span><span class="ico ico-eclipse">${ICONS.wolf}</span>
        </button>
        <button class="ctl ctl-ulti" type="button" data-act="ulti" aria-label="Ulti Eclipse">${ICONS.moon}</button>
        <button class="ctl ctl-attack" type="button" data-act="attack" aria-label="Attack">
          <span class="ico ico-human">${ICONS.sickle}</span><span class="ico ico-wolf">${ICONS.claw}</span><span class="ico ico-eclipse">${ICONS.claw}</span>
        </button>
        <button class="ctl ctl-jump" type="button" data-act="jump" aria-label="Lompat">${ICONS.jump}</button>
      </div>
    </div>
    <div class="overlay pause-overlay" hidden>
      <div class="panel">
        <h2 class="panel-title">Jeda</h2>
        <button class="menu-btn primary" type="button" data-menu="resume"><span class="control-label">Lanjut</span></button>
        <button class="menu-btn" type="button" data-menu="map"><span class="control-label">Peta Perjalanan</span></button>
        <button class="menu-btn" type="button" data-menu="wardrobe"><span class="control-label">Lemari Skin</span></button>
        <button class="menu-btn" type="button" data-menu="checkpoint"><span class="control-label">Ulang dari checkpoint</span></button>
        <button class="menu-btn" type="button" data-menu="restart"><span class="control-label">Mulai area dari awal</span></button>
        <button class="menu-btn endless-btn" type="button" data-menu="endless"><span class="control-label">Perjalanan Tanpa Akhir</span></button>
      </div>
    </div>
    <div class="overlay result-overlay" hidden>
      <div class="panel">
        <h2 class="panel-title result-title">Bulan Terbebas</h2>
        <div class="result-sub"></div>
        <dl class="stats"></dl>
        <button class="menu-btn primary next-btn" type="button" data-menu="next"><span class="control-label">Area berikutnya</span></button>
        <button class="menu-btn" type="button" data-menu="again"><span class="control-label">Main lagi</span></button>
        <button class="menu-btn" type="button" data-menu="map"><span class="control-label">Peta Perjalanan</span></button>
        <button class="menu-btn" type="button" data-menu="wardrobe"><span class="control-label">Lemari Skin</span></button>
      </div>
    </div>
    <div class="overlay map-overlay" hidden>
      <div class="panel wide">
        <div class="panel-head">
          <h2 class="panel-title">Peta Perjalanan</h2>
          <button class="icon-btn close-btn" type="button" data-menu="close" aria-label="Tutup">${svg('<path d="M6 6l12 12"/><path d="M18 6L6 18"/>')}</button>
        </div>
        <div class="map-grid"></div>
        <button class="menu-btn endless-btn" type="button" data-menu="endless"><span class="control-label">Perjalanan Tanpa Akhir</span></button>
      </div>
    </div>
    <div class="overlay wardrobe-overlay" hidden>
      <div class="panel wide">
        <div class="panel-head">
          <h2 class="panel-title">Lemari Skin</h2>
          <button class="icon-btn close-btn" type="button" data-menu="close" aria-label="Tutup">${svg('<path d="M6 6l12 12"/><path d="M18 6L6 18"/>')}</button>
        </div>
        <div class="wardrobe-stage">
          <button class="icon-btn" type="button" data-menu="skin-prev" aria-label="Skin sebelumnya">${ICONS.left}</button>
          <canvas class="skin-preview"></canvas>
          <button class="icon-btn" type="button" data-menu="skin-next" aria-label="Skin berikutnya">${ICONS.right}</button>
        </div>
        <div class="skin-name"></div>
        <ul class="skin-buffs"></ul>
        <button class="menu-btn primary equip-btn" type="button" data-menu="skin-equip"><span class="control-label">Pakai</span></button>
      </div>
    </div>
    <div class="loading"><div class="loading-moon"></div><span class="loading-text">Bulan terbit…</span></div>
  `;
  mount.replaceChildren(root);

  const $ = (sel) => root.querySelector(sel);
  const el = {
    root,
    canvas: $(".game-canvas"),
    controls: $(".controls"),
    hearts: $(".hearts"),
    ultiFill: $(".ulti-fill"),
    ultiMeter: $(".ulti-meter"),
    ultiBtn: $(".ctl-ulti"),
    shardCount: $(".shard-count"),
    shardIcon: $(".shard-icon"),
    bossBar: $(".boss-bar"),
    bossFill: $(".boss-fill"),
    combo: $(".combo"),
    comboN: $(".combo-n"),
    toast: $(".toast"),
    pause: $(".pause-overlay"),
    result: $(".result-overlay"),
    resultTitle: $(".result-title"),
    resultSub: $(".result-sub"),
    stats: $(".stats"),
    loading: $(".loading"),
    loadingText: $(".loading-text"),
    map: $(".map-overlay"),
    mapGrid: $(".map-grid"),
    wardrobe: $(".wardrobe-overlay"),
    preview: $(".skin-preview"),
    skinName: $(".skin-name"),
    skinBuffs: $(".skin-buffs"),
    equip: $(".equip-btn"),
  };

  $(".pause-btn").addEventListener("click", () => handlers.pause());
  root.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-menu]");
    if (b) handlers.menu(b.dataset.menu);
  });

  let sprite = null; // { url, w, h, heart, empty, shard }
  const cache = {};
  const bgFor = (c) => {
    if (!sprite) return "";
    const sizeX = (sprite.w / c.w) * 100;
    const sizeY = (sprite.h / c.h) * 100;
    const px = (c.x / (sprite.w - c.w)) * 100;
    const py = (c.y / (sprite.h - c.h)) * 100;
    return `background-image:url("${sprite.url}");background-size:${sizeX}% ${sizeY}%;background-position:${px}% ${py}%`;
  };

  return {
    el,
    setArt(art, url) {
      const fr = art.frames.PROPS_OBJECTS.byName;
      sprite = { url, w: art.images.PROPS_OBJECTS.width, h: art.images.PROPS_OBJECTS.height, heart: fr.heart.content, empty: fr.heart_empty.content, shard: fr.moon_shard.content };
      el.shardIcon.setAttribute("style", bgFor(sprite.shard));
      cache.hp = null;
      el.loading.hidden = true;
    },
    loadFailed() {
      el.loading.hidden = false;
      el.loadingText.textContent = "Gagal memuat — muat ulang halaman";
    },
    setLoading(text) {
      el.loading.hidden = !text;
      if (text) el.loadingText.textContent = text;
    },
    // Animated preview of a skin (human + wolf idle) inside the wardrobe.
    drawPreview(art, keys, frameNo) {
      const c = el.preview;
      const r = c.getBoundingClientRect();
      if (!r.width) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (c.width !== Math.round(r.width * dpr)) {
        c.width = Math.round(r.width * dpr);
        c.height = Math.round(r.height * dpr);
      }
      const ctx = c.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, r.width, r.height);
      const g = ctx.createRadialGradient(r.width / 2, r.height * 0.7, 4, r.width / 2, r.height * 0.7, r.width * 0.6);
      g.addColorStop(0, "rgba(120,150,230,0.35)");
      g.addColorStop(1, "rgba(120,150,230,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, r.width, r.height);
      const draw = (key, row, x, hTiles, unit) => {
        const fr = art.frames[key] && art.frames[key].anims[row];
        const img = art.images[key];
        if (!fr || !img) return false;
        const f = fr[Math.floor(frameNo / 8) % fr.length];
        const cc = f.content || f.source;
        const k = (hTiles * unit) ;
        ctx.drawImage(img, cc.x, cc.y, cc.w, cc.h, x - (f.anchor.x - cc.x) * k, r.height * 0.9 - (f.anchor.y - cc.y) * k, cc.w * k, cc.h * k);
        return true;
      };
      const hpx = r.height * 0.78;
      const okA = draw(keys[0], "idle", r.width * 0.3, hpx, 1 / 300);
      const okB = draw(keys[1], "idle", r.width * 0.7, hpx * 0.72, 1 / 258);
      if (!okA && !okB) {
        ctx.fillStyle = "#cfe4ff";
        ctx.font = "600 14px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Memuat…", r.width / 2, r.height / 2);
      }
    },
    update(state, meta) {
      const p = state.player;
      if (!p) return;
      const form = p.form;
      const onAltar = form === "wolf" && state.level.altars.some((a) => Math.abs(a.x - p.x) < 1.1 && Math.abs(a.y - p.y) < 0.7);
      const cls = `game-root form-${form}${onAltar ? " on-altar" : ""}${p.ulti >= 100 && p.eclipseT <= 0 ? " ulti-ready" : ""}${state.slowmo ? " aiming" : ""}`;
      if (cache.cls !== cls) {
        root.className = cls;
        cache.cls = cls;
      }
      const hpKey = `${Math.ceil(p.hp)}/${p.maxHp}`;
      if (cache.hp !== hpKey && sprite) {
        cache.hp = hpKey;
        let html = "";
        for (let i = 0; i < p.maxHp; i++) html += `<span class="pip" style='${bgFor(i < p.hp ? sprite.heart : sprite.empty)}'></span>`;
        el.hearts.innerHTML = html;
      }
      const u = p.eclipseT > 0 ? (p.eclipseT / Math.max(1, meta.ultiDuration)) * 100 : p.ulti;
      const uKey = Math.round(u);
      if (cache.u !== uKey) {
        cache.u = uKey;
        el.ultiFill.style.transform = `scaleX(${Math.max(0, Math.min(100, uKey)) / 100})`;
        el.ultiBtn.style.setProperty("--u", `${uKey * 3.6}deg`);
      }
      const shards = `${state.stats.shards}`;
      if (cache.shards !== shards) {
        cache.shards = shards;
        el.shardCount.textContent = shards;
      }
      const b = state.boss;
      const showBoss = Boolean(b && b.active && !b.dead);
      if (cache.boss !== showBoss) {
        cache.boss = showBoss;
        el.bossBar.hidden = !showBoss;
      }
      if (showBoss) {
        const bossK = Math.max(0, Math.min(1, b.hp / b.maxHp));
        const bossKey = Math.round(bossK * 500);
        if (cache.bossK !== bossKey) {
          cache.bossK = bossKey;
          el.bossFill.style.transform = `scaleX(${bossK})`;
        }
        const nm = b.name || "Serigala Tanpa Bayangan";
        if (cache.bossName !== nm) {
          cache.bossName = nm;
          root.querySelector(".boss-name").textContent = nm;
        }
      }
      const showCombo = state.combo.count >= 3;
      if (cache.combo !== showCombo) {
        cache.combo = showCombo;
        el.combo.hidden = !showCombo;
      }
      if (showCombo && cache.comboN !== state.combo.count) {
        cache.comboN = state.combo.count;
        el.comboN.textContent = `${state.combo.count}`;
        el.combo.classList.remove("bump");
        void el.combo.offsetWidth;
        el.combo.classList.add("bump");
      }
      const toast = state.toast && state.toast.t < state.toast.dur ? state.toast.text : "";
      if (cache.toast !== toast) {
        cache.toast = toast;
        el.toast.hidden = !toast;
        el.toast.textContent = toast;
      }
      const screen = state.screen || null;
      if (cache.screen !== screen || (screen === "map" && cache.mapKey !== meta.mapKey) || (screen === "wardrobe" && cache.wKey !== `${state.wardrobeIdx}/${meta.skin}`)) {
        cache.screen = screen;
        el.map.hidden = screen !== "map";
        el.wardrobe.hidden = screen !== "wardrobe";
        if (screen === "map") {
          cache.mapKey = meta.mapKey;
          el.mapGrid.innerHTML = meta.areas
            .map((a) => {
              const rec = meta.records[a.id];
              const lock = !a.unlocked;
              return `<button class="area-card${lock ? " locked" : ""}${a.cleared ? " cleared" : ""}" type="button" ${lock ? "disabled" : `data-menu="area:${a.id}"`} style="--accent:${a.color || "#c23a3a"}">
                <span class="area-num">${a.id}</span>
                <span class="area-info"><span class="area-name">${a.name}</span><span class="area-sub">${lock ? "Terkunci — kalahkan boss sebelumnya" : `Boss: ${a.boss}`}</span></span>
                <span class="area-rec">${rec ? `${rec.score}` : a.cleared ? svg('<path d="M5 12l5 5 9-10"/>', 'class="check"') : ""}</span>
              </button>`;
            })
            .join("");
        }
        if (screen === "wardrobe") {
          cache.wKey = `${state.wardrobeIdx}/${meta.skin}`;
          const sk = meta.skins[state.wardrobeIdx];
          el.skinName.textContent = `${sk.id}. ${sk.name}`;
          el.skinName.style.color = sk.color;
          el.skinBuffs.innerHTML = sk.buffs.map((b) => `<li>${b}</li>`).join("");
          const on = sk.id === meta.skin;
          el.equip.disabled = on;
          el.equip.querySelector(".control-label").textContent = on ? "Sedang dipakai" : "Pakai";
        }
      }
      const paused = Boolean(state.paused) && !state.over && !screen;
      if (cache.paused !== paused) {
        cache.paused = paused;
        el.pause.hidden = !paused;
      }
      const unlocked = Boolean(meta.endlessUnlocked);
      if (cache.unlocked !== unlocked) {
        cache.unlocked = unlocked;
        for (const btn of root.querySelectorAll(".endless-btn")) btn.hidden = !unlocked;
      }
      const overKey = state.over ? `${state.over}:${state.overT > 0.9}:${screen}` : "";
      if (cache.over !== overKey) {
        cache.over = overKey;
        const show = Boolean(state.over) && state.overT > 0.9 && !screen;
        el.result.hidden = !show;
        if (show) this.fillResult(state, meta);
      }
    },
    fillResult(state, meta) {
      const s = state.stats;
      const stage = state.runKind === "stage";
      const area = state.level.area || 0;
      el.resultTitle.textContent = stage ? (area === 10 ? "Bulan Terbebas!" : `${meta.areas[area].boss} Tumbang`) : "Perburuan Usai";
      const time = Math.floor(s.time);
      const mm = String(Math.floor(time / 60));
      const ss = String(time % 60).padStart(2, "0");
      el.resultSub.textContent = state.newBest ? "Rekor baru!" : stage ? (area < 10 ? `${meta.areas[area + 1].name} terbuka` : "Bulan kembali bersinar bebas") : "Sejauh ini kau berlari";
      const rows = stage
        ? [["Skor", state.score], ["Waktu", `${mm}:${ss}`], ["Pecahan bulan", `${s.shards}/${s.shardsTotal}`], ["Combo terbaik", s.bestCombo], ["Skor terbaik", meta.bestScore]]
        : [["Skor", state.score], ["Jarak", `${Math.floor(s.distance)} m`], ["Combo terbaik", s.bestCombo], ["Skor terbaik", meta.endlessBest]];
      el.stats.innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");
      root.querySelector(".next-btn").hidden = !stage || area >= 10;
      root.querySelector('[data-menu="again"] .control-label').textContent = stage ? "Main lagi" : "Coba lagi";
    },
  };
}
