import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { CORE_KEYS } from '../game js/game/assets.js';
import { AREAS, areaKeys, buildArea } from '../game js/game/areas.js';
import { SKINS, skinKeys } from '../game js/game/skins.js';
import { buildStage1, buildEndless } from '../game js/game/stage.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = name => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
const manifest = read('game js/assets.json');
assert.deepEqual(manifest, read('assets/json/assets.json'), 'Android and Flutter manifests differ');
assert.deepEqual(read('game js/tweaks.json'), read('assets/json/tweaks.json'), 'Tweak defaults differ');
const used = new Set([...CORE_KEYS, ...SKINS.flatMap(s => skinKeys(s.id)), ...AREAS.flatMap(a => areaKeys(a.id))]);
assert.deepEqual([...used].sort(), Object.keys(manifest).sort(), 'Unreachable or missing game assets');

function dimensions(buffer) {
  assert.equal(buffer.toString('ascii', 0, 4), 'RIFF');
  assert.equal(buffer.toString('ascii', 8, 12), 'WEBP');
  for (let offset = 12; offset + 8 < buffer.length;) {
    const type = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const data = offset + 8;
    if (type === 'VP8X') return [buffer.readUIntLE(data + 4, 3) + 1, buffer.readUIntLE(data + 7, 3) + 1];
    if (type === 'VP8 ') return [buffer.readUInt16LE(data + 6) & 0x3fff, buffer.readUInt16LE(data + 8) & 0x3fff];
    if (type === 'VP8L') {
      const bits = buffer.readUInt32LE(data + 1);
      return [(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1];
    }
    offset = data + size + (size % 2);
  }
  throw new Error('Unsupported WebP header');
}

let frameCount = 0;
let sheets = 0;
let animations = 0;
let bytes = 0;
const frameNames = {};
for (const [key, asset] of Object.entries(manifest)) {
  const filename = path.basename(asset.src);
  assert.equal(asset.kind, 'image', key);
  assert.equal(read('assets/json/data.json')[key], asset.src, `${key}: stale data.json`);
  const image = fs.readFileSync(path.join(root, 'assets/images', filename));
  bytes += image.length;
  const [width, height] = dimensions(image);
  if (/SKY_BG|_LAYER|^LAYER_/.test(key)) continue;
  const data = read(`assets/json/${filename.replace(/\.(webp|png)$/, '.frames.json')}`);
  assert.equal(path.basename(data.image), filename);
  const byName = new Map(data.frames.map(frame => [frame.name, frame]));
  assert.equal(byName.size, data.frames.length, `${key}: duplicate frame name`);
  frameNames[key] = [...byName.keys()];
  sheets++;
  for (const frame of data.frames) {
    const { x, y, w, h } = frame.source;
    assert.ok([x, y, w, h].every(Number.isFinite), `${key}/${frame.name}: invalid rectangle`);
    assert.ok(x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= width && y + h <= height,
      `${key}/${frame.name}: frame outside ${width}x${height}`);
    frameCount++;
  }
  for (const animation of data.animations || []) {
    assert.ok(animation.frames.length > 0, `${key}/${animation.name}: empty animation`);
    for (const frame of animation.frames) assert.ok(byName.has(frame.name), `${key}/${animation.name}: unknown ${frame.name}`);
    animations++;
  }
}

for (const area of AREAS) {
  const level = area.id === 0 ? buildStage1() : buildArea(area.id);
  assert.ok(level.start && level.enemies && level.checkpoints && level.boss, `Area ${area.id} cannot be built`);
}
assert.ok(buildEndless(123).start, 'Endless stage cannot be built');
const modules = fs.readdirSync(path.join(root, 'game js/game')).filter(f => f.endsWith('.js'));
for (const filename of modules) {
  const code = fs.readFileSync(path.join(root, 'game js/game', filename), 'utf8');
  for (const match of code.matchAll(/from\s+["'](\.\/.+?)["']/g)) {
    assert.ok(fs.existsSync(path.join(root, 'game js/game', match[1])), `${filename}: missing import ${match[1]}`);
  }
}
const report = {
  images: Object.keys(manifest).length, sheets, frames: frameCount, animations,
  areas: AREAS.length, skins: SKINS.length, modules: modules.length, bytes,
  areaAssets: Object.fromEntries(AREAS.map(a => [a.name, areaKeys(a.id)])),
  skinAssets: Object.fromEntries(SKINS.map(s => [s.id, skinKeys(s.id)])),
  frameNames,
};
fs.mkdirSync(path.join(root, 'build'), { recursive: true });
fs.writeFileSync(path.join(root, 'build/asset-audit.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, areaAssets: undefined, skinAssets: undefined, frameNames: undefined }, null, 2));
console.log('PASS: every manifest image is reachable; frame rectangles, animation references, imports and all stage builders are valid.');
