// Loads pictures on demand through the Playabl assets handle (so creator
// swaps apply) plus each sheet's .frames.json slicing contract. Only what the
// current area and skin need stays decoded; the rest is released.

// onload only means the bytes arrived. Without decode(), the browser decodes a
// big atlas (about 2000x1600) the first time it is drawn. Decoding here moves
// that cost to the loading screen.
function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      const ready = typeof img.decode === "function" ? img.decode().catch(() => {}) : Promise.resolve();
      ready.then(() => resolve(img));
    };
    img.onerror = () => reject(new Error(`image failed: ${url}`));
    img.src = url;
  });
}

export function createArt(assets, manifest) {
  const images = {};
  const frames = {};
  const pending = {};
  const urlOf = (key) => (assets ? assets.get(key) : manifest[key].src);

  function loadOne(key) {
    if (pending[key]) return pending[key];
    if (images[key] && (frames[key] || /(SKY_BG|_LAYER|^LAYER_)/.test(key))) return Promise.resolve();
    const entry = manifest[key];
    if (!entry) return Promise.reject(new Error(`unknown asset ${key}`));
    const jobs = [loadImage(urlOf(key))];
    const isSheet = !/(SKY_BG|_LAYER|^LAYER_)/.test(key);
    if (isSheet && !frames[key]) {
      // The slicing contract travels with the generated file, not the replacement.
      const url = entry.framesSrc || entry.src.replace(/\.(webp|png)$/, ".frames.json");
      jobs.push(
        fetch(url)
          .then((r) => {
            if (!r.ok) throw new Error(`frames failed: ${url}`);
            return r.json();
          })
          .then((data) => {
            const byName = {};
            for (const f of data.frames || []) byName[f.name] = f;
            const anims = {};
            for (const a of data.animations || []) {
              anims[a.name] = a.frames.map(f => byName[typeof f === 'string' ? f : f.name]);
              if (!anims[a.name].length || anims[a.name].some(f => !f)) {
                throw new Error(`invalid animation: ${key}/${a.name}`);
              }
            }
            return { byName, anims, grid: data.grid };
          }),
      );
    }
    // Commit image and slicing data together; failed loads remain retryable.
    pending[key] = Promise.all(jobs).then(([img, data]) => {
      images[key] = img;
      if (data) frames[key] = data;
    }).finally(() => delete pending[key]);
    return pending[key];
  }

  return {
    images,
    frames,
    has: (keys) => keys.every((k) => images[k] && (frames[k] || /(SKY_BG|_LAYER|^LAYER_)/.test(k))),
    ensure: (keys) => Promise.all(keys.map(loadOne)),
    // Drop decoded pictures not in `keep` so memory stays bounded.
    retain(keep) {
      const set = new Set(keep);
      for (const k of Object.keys(images)) if (!set.has(k)) delete images[k];
    },
  };
}

export const CORE_KEYS = ["FX_COMBAT", "FX_IMPACT", "FX_SPIRIT", "PROPS_OBJECTS", "PROPS_WORLD", "SKY_BG"];
