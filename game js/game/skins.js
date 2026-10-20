// Ten skins. Each is a full set (human, wolf, Eclipse) whose sheets share the
// main hero's exact rows and frame counts, so any skin drops straight in.
// Buffs grow from skin 1 (balanced) to skin 10 (overpowered).

export const SKIN_ROLES = ["HUMAN_MOVE", "HUMAN_COMBAT", "HUMAN_ACTION", "WOLF_MOVE", "WOLF_COMBAT", "WOLF_ACTION", "ECLIPSE"];

export const skinKey = (id, role) => (id === 1 ? `HERO_${role}` : `SKIN${id}_${role}`);
export const skinKeys = (id) => SKIN_ROLES.map((r) => skinKey(id, r));

const BASE = {
  speed: 1, hits: 1, burn: false, doubleJump: false, lifesteal: false, freeze: false,
  lightning: false, extraHeart: 0, ultiRate: 1, spirit: false, revive: false,
  eclipseMult: 1, startUlti: false, wideSlam: false,
};

export const SKINS = [
  { id: 1, name: "Pemburu Malam", color: "#c23a3a", buffs: ["Seimbang, tanpa buff"], b: {} },
  { id: 2, name: "Kabut Perak", color: "#cfe0ff", buffs: ["+20% kecepatan lari"], b: { speed: 1.2 } },
  { id: 3, name: "Taring Bara", color: "#ff8a3d", buffs: ["Serangan membakar musuh", "+10% kecepatan"], b: { burn: true, speed: 1.1 } },
  { id: 4, name: "Bayang Gagak", color: "#a77bff", buffs: ["Lompat ganda di kedua wujud", "Membakar musuh"], b: { doubleJump: true, burn: true, speed: 1.1 } },
  { id: 5, name: "Duri Mawar", color: "#ff5c8a", buffs: ["Tiap serangan kena 2×", "Pulih 1 hati tiap 4 musuh kalah", "Lompat ganda"], b: { hits: 2, lifesteal: true, doubleJump: true, speed: 1.1 } },
  { id: 6, name: "Es Utara", color: "#7fe0ff", buffs: ["Serangan membekukan musuh", "Kait membekukan target", "2× hit, lompat ganda"], b: { freeze: true, hits: 2, doubleJump: true, speed: 1.15 } },
  { id: 7, name: "Petir Badai", color: "#ffe14a", buffs: ["Terkaman menyambar 3 musuh", "Terjangan meninggalkan petir", "2× hit, lompat ganda, +25% cepat"], b: { lightning: true, hits: 2, doubleJump: true, speed: 1.25, ultiRate: 1.25 } },
  { id: 8, name: "Darah Bulan", color: "#ff2b3a", buffs: ["Tiap serangan kena 3×", "+1 hati", "Ulti terisi 50% lebih cepat", "Pulih nyawa saat membunuh"], b: { hits: 3, extraHeart: 1, ultiRate: 1.5, lifesteal: true, doubleJump: true, speed: 1.2 } },
  { id: 9, name: "Roh Leluhur", color: "#8ff0ff", buffs: ["Serigala roh pendamping ikut menyerang", "Bangkit sekali per checkpoint", "3× hit, +1 hati"], b: { spirit: true, revive: true, hits: 3, extraHeart: 1, ultiRate: 1.5, doubleJump: true, speed: 1.2, lifesteal: true } },
  { id: 10, name: "Gerhana Abadi", color: "#ffcf4a", buffs: ["3× hit + membakar & membekukan", "Eclipse 2× lebih lama", "Mulai tiap nyawa dengan ulti penuh", "Hantaman Eclipse menyapu satu layar", "Serigala roh, bangkit, +2 hati"], b: { hits: 3, burn: true, freeze: true, lightning: true, eclipseMult: 2, startUlti: true, wideSlam: true, spirit: true, revive: true, extraHeart: 2, ultiRate: 2, doubleJump: true, speed: 1.3, lifesteal: true } },
];

export function skinBuffs(id) {
  const s = SKINS.find((k) => k.id === id) || SKINS[0];
  return { ...BASE, ...s.b };
}
