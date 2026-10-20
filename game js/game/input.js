// Keyboard + on-screen buttons. Handlers only record intent: held flags in
// state.input and one-shot events in state.inputEvents, which update() reads.

const KEYMAP = {
  ArrowLeft: "left", KeyA: "left",
  ArrowRight: "right", KeyD: "right",
  ArrowDown: "down", KeyS: "down",
  ArrowUp: "up", KeyW: "up",
  Space: "jump", KeyZ: "jump",
  KeyJ: "attack", KeyX: "attack",
  KeyK: "skill", KeyC: "skill",
  KeyL: "transform", KeyV: "transform", ShiftLeft: "transform",
  KeyU: "ulti", KeyB: "ulti",
};

// Fallback by key value, for keyboards/tools that leave `code` empty.
const KEYMAP_BY_KEY = {
  arrowleft: "left", a: "left", arrowright: "right", d: "right",
  arrowdown: "down", s: "down", arrowup: "up", w: "up",
  " ": "jump", z: "jump", j: "attack", x: "attack", k: "skill", c: "skill",
  l: "transform", v: "transform", shift: "transform", u: "ulti", b: "ulti",
};
const actionOf = (ev) => KEYMAP[ev.code] || KEYMAP_BY_KEY[(ev.key || "").toLowerCase()];
const keyId = (ev) => ev.code || (ev.key || "").toLowerCase();

export function createInput({ root, getState, onPause }) {
  const held = new Map();
  const blocked = () => {
    const s = getState();
    return !s.input || s.paused || s.screen || s.loading || s.over;
  };
  const isHeld = action => [...held.values()].includes(action) || [...active.values()].some(btn => btn.dataset.act === action) || stick.acts.has(action);

  function press(action) {
    const s = getState();
    if (!s.input) return;
    if (action === "left" || action === "right" || action === "down" || action === "up") {
      s.input[action] = true;
      s.inputEvents.push(action);
      if (action === "up") {
        s.input.jump = true;
        s.inputEvents.push("jump");
      }
    } else if (action === "jump") {
      s.input.jump = true;
      s.inputEvents.push("jump");
    } else if (action === "skill") {
      s.input.skill = true;
      s.inputEvents.push("skillDown");
    } else s.inputEvents.push(action);
  }
  function release(action) {
    const s = getState();
    if (!s.input) return;
    if (isHeld(action)) return;
    if (action === "left" || action === "right" || action === "down") s.input[action] = false;
    else if (action === "up") {
      s.input.up = false;
      s.input.jump = isHeld("jump");
    } else if (action === "jump") s.input.jump = isHeld("up");
    else if (action === "skill") {
      s.input.skill = false;
      s.inputEvents.push("skillUp");
    }
  }

  const onKeyDown = (ev) => {
    if (ev.code === "Escape" || ev.code === "KeyP" || ev.key === "Escape" || ev.key === "p") {
      if (!ev.repeat) onPause();
      return;
    }
    const a = actionOf(ev);
    if (!a) return;
    ev.preventDefault();
    if (blocked()) return;
    const id = keyId(ev);
    if (held.has(id)) return;
    held.set(id, a);
    press(a);
  };
  const onKeyUp = (ev) => {
    const id = keyId(ev);
    const a = held.get(id) || actionOf(ev);
    if (!a) return;
    held.delete(id);
    release(a);
  };
  const onBlur = () => {
    for (const a of held.values()) release(a);
    held.clear();
    for (const btn of active.values()) {
      btn.classList.remove("is-down");
      release(btn.dataset.act);
    }
    active.clear();
    endStick();
    const s = getState();
    if (s.input) for (const key of Object.keys(s.input)) s.input[key] = false;
    if (s.inputEvents) s.inputEvents.length = 0;
    if (s.player) { s.player.skillHold = 0; s.player.aim = null; }
    s.slowmo = false;
  };
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);

  // Virtual joystick (.stick). Tilting sideways holds left or right, pulling down
  // holds down. The axes are independent, so one thumb can crawl (down plus a
  // direction). Pointer capture keeps the release paired, like the buttons.
  const stick = { id: null, el: null, acts: new Set() };
  const STICK_X = 0.25; // fraction of the radius before left/right register
  const STICK_Y = 0.45; // fraction of the radius before down registers
  const showStick = (dx, dy, rad) => {
    const len = Math.hypot(dx, dy) || 1;
    const k = Math.min(1, (rad * 0.6) / len);
    stick.el.style.setProperty("--kx", `${dx * k}px`);
    stick.el.style.setProperty("--ky", `${dy * k}px`);
    stick.el.dataset.dir = [...stick.acts].join(" ");
  };
  function moveStick(ev) {
    const r = stick.el.getBoundingClientRect();
    const rad = r.width / 2 || 1;
    const dx = ev.clientX - (r.left + rad);
    const dy = ev.clientY - (r.top + r.height / 2);
    const next = new Set();
    if (dx < -rad * STICK_X) next.add("left");
    else if (dx > rad * STICK_X) next.add("right");
    if (dy > rad * STICK_Y) next.add("down");
    for (const a of [...stick.acts]) {
      if (!next.has(a)) {
        stick.acts.delete(a);
        release(a);
      }
    }
    for (const a of next) {
      if (!stick.acts.has(a)) {
        stick.acts.add(a);
        press(a);
      }
    }
    showStick(dx, dy, rad);
  }
  function endStick() {
    if (stick.id === null) return;
    for (const a of [...stick.acts]) {
      stick.acts.delete(a);
      release(a);
    }
    stick.el.classList.remove("is-down");
    stick.el.style.removeProperty("--kx");
    stick.el.style.removeProperty("--ky");
    delete stick.el.dataset.dir;
    stick.id = null;
  }

  // Touch buttons: [data-act]. Pointer capture keeps the release paired.
  const active = new Map();
  const onDown = (ev) => {
    if (blocked()) return;
    const btn = ev.target.closest("[data-act]");
    if (btn && root.contains(btn)) {
      ev.preventDefault();
      btn.setPointerCapture?.(ev.pointerId);
      active.set(ev.pointerId, btn);
      btn.classList.add("is-down");
      press(btn.dataset.act);
      return;
    }
    const pad = ev.target.closest(".stick");
    if (pad && root.contains(pad) && stick.id === null) {
      ev.preventDefault();
      pad.setPointerCapture?.(ev.pointerId);
      stick.id = ev.pointerId;
      stick.el = pad;
      pad.classList.add("is-down");
      moveStick(ev);
    }
  };
  const onMove = (ev) => {
    if (ev.pointerId !== stick.id) return;
    if (blocked()) endStick();
    else moveStick(ev);
  };
  const onUp = (ev) => {
    if (ev.pointerId === stick.id) {
      endStick();
      return;
    }
    const btn = active.get(ev.pointerId);
    if (!btn) return;
    active.delete(ev.pointerId);
    if (![...active.values()].includes(btn)) btn.classList.remove("is-down");
    release(btn.dataset.act);
  };
  root.addEventListener("pointerdown", onDown);
  root.addEventListener("pointermove", onMove);
  root.addEventListener("pointerup", onUp);
  root.addEventListener("pointercancel", onUp);
  root.addEventListener("lostpointercapture", onUp);
  const noMenu = (ev) => ev.preventDefault();
  root.addEventListener("contextmenu", noMenu);

  return {
    reset: onBlur,
    destroy() {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      root.removeEventListener("pointerdown", onDown);
      root.removeEventListener("pointermove", onMove);
      root.removeEventListener("pointerup", onUp);
      root.removeEventListener("pointercancel", onUp);
      root.removeEventListener("lostpointercapture", onUp);
      root.removeEventListener("contextmenu", noMenu);
    },
  };
}
