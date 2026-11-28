// Kyvern Sentinel: wires the framework (stage, rig, paint, forms, motion, tour, HUD)
// to the Sentinel model and config, and exposes window.sentinel so Kyvern can drive him.
import * as THREE from 'three';
import { Stage } from './framework/stage.js';
import { Rig } from './framework/rig.js';
import { Paint } from './framework/paint.js';
import { Forms } from './framework/forms.js';
import { Walker, Behaviour } from './framework/motion.js';
import { Tour } from './framework/tour.js';
import { Hud } from './framework/hud.js';
import { loadPartModels } from './framework/partmodels.js';
import { buildSentinel, SECTIONS } from './sentinel/model.js';
import { loadBlenderSentinel, buildFromBlender, blenderForms } from './sentinel/blender.js';
import { buildEffects } from './sentinel/effects.js';
import { ROLES, LINES, FORMS, STATES, STATE_ALIAS, CHAPTERS, SPEC } from './sentinel/config.js';

const query = new URLSearchParams(location.search);
const pick = (key, table, fallback) => (table[query.get(key)] ? query.get(key) : fallback);
const SPEEDS = [0.25, 0.5, 1, 2];
const METERS = [
  { id: 'core', label: 'Reactor output', unit: 'MW', wave: true },
  { id: 'temp', label: 'Core temperature', unit: 'K' },
  { id: 'servo', label: 'Servo load', unit: '%', bars: true },
  { id: 'hyd', label: 'Hydraulic pressure', unit: 'bar' },
  { id: 'thrust', label: 'Thrust', unit: 'kN' },
  { id: 'span', label: 'Wing span', unit: 'm' },
  { id: 'alt', label: 'Altitude', unit: 'm' },
  { id: 'speed', label: 'Airspeed', unit: 'km/h' },
  { id: 'cell', label: 'Reserve cell', unit: '%' },
];

const canvas = document.getElementById('gl');
const stage = new Stage(canvas, { theme: { backdrop: new URLSearchParams(location.search).get('scene') === 'city' ? 'city' : 'studio' } });
const rig = new Rig();
const firstLine = LINES.some((l) => l.id === query.get('line')) ? query.get('line') : LINES[0].id;
const paint = new Paint(ROLES, LINES, firstLine);
// The Blender-built model is the default. ?model=coded shows the one drawn in code, and the
// page falls back to it if the model file cannot be loaded.
const gltf = query.get('model') === 'coded' ? null : await loadBlenderSentinel('./models/sentinel.glb').catch((err) => (console.warn('Blender model did not load, using the coded Sentinel', err), null));
const model = gltf ? buildFromBlender(rig, paint.mats, gltf) : buildSentinel(rig, paint.mats);
const forms = new Forms(rig, gltf ? blenderForms(FORMS) : FORMS, pick('form', FORMS, 'sentinel'));
const walker = new Walker(rig, forms);
const behaviour = new Behaviour(forms);
stage.scene.add(rig.root);
const effects = buildEffects({ rig, stage, paint, forms, behaviour });

const chapters = CHAPTERS.map((c) => {
  const s = SECTIONS.find((x) => x.id === c.section);
  return { ...c, label: c.label || s.label, lines: c.lines || s.lines, view: c.view || s.view };
});

const app = {
  state: pick('state', STATES, STATE_ALIAS[query.get('state')] || 'guard'),
  speed: 1,
  section: 'overview', // what the left list shows as open
  openPart: null,
  teardownLevel: 0,
  caption: null,
  wings: query.get('wings') !== 'folded',
};
let wingVel = 0; // how fast the wings are moving, so they ease in and out and can turn round mid-way
let homing = false; // true while he flies himself back to the pad
let wing = 0; // 0 folded away, 1 spread. Starts folded so he opens them as the page loads.

// ---- HUD -------------------------------------------------------------------------------
const hud = new Hud(
  document.getElementById('hud'),
  {
    name: 'Kyvern Sentinel',
    code: 'SENTINEL · SN-01',
    banner: 'S E N T I N E L · S N - 0 1',
    credit: 'Kyvern Sentinel SN-01 · design and direction by Karl Salvador · built with Claude · <a href="./portrait/">portrait render</a>',
    sections: SECTIONS,
    forms: FORMS,
    lines: LINES,
    states: STATES,
    spec: SPEC,
    meters: METERS,
    speeds: SPEEDS,
  },
  {
    tourAll: () => (tour.active ? tour.stop() : tour.playAll()),
    section: (id) => api.open(id === app.section && id !== 'teardown' ? 'overview' : id),
    form: (id) => api.setForm(id),
    line: (id) => api.setLine(id),
    state: (id) => api.setState(id),
    wings: (open) => api.setWings(open),
    zoom: (d) => hud.setZoom(stage.setZoom(stage.zoom * (d > 0 ? 1.15 : 1 / 1.15))),
    speed: (s) => {
      app.speed = s;
      hud.setSpeed(s);
    },
    home: () => stage.home(),
    pad: (axis, v) => (walker.pad[axis] = v),
  },
);
if (query.get('hud') === '0') document.body.classList.add('bare');

// ---- the public controls (also used by the HUD) ---------------------------------------------
const api = {
  // 'overview', 'teardown', a section id or a part id
  open(id) {
    tour.stop();
    openThing(id);
  },
  openPart(id) {
    tour.stop();
    showPart(id);
  },
  close() {
    api.open('overview');
  },
  teardown(level = 1) {
    tour.stop();
    showTeardown(level > 1 ? 2 : 1);
  },
  setForm(id) {
    if (!FORMS[id]) return;
    if (forms.set(id)) {
      rig.closeAll();
      setOpen('overview', null);
      behaviour.surge = 1;
      if (id !== 'vehicle') homing = true; // fly back to the pad and land
      // the starship is best seen from above and behind; every other form from the front
      if (id !== 'vehicle') stage.view(Math.atan2(stage.homeDir.x, stage.homeDir.z), Math.asin(stage.homeDir.y));
    }
    hud.setForm(id);
  },
  setLine(id) {
    if (paint.set(id)) hud.setLine(id, paint.line().roles.glow);
  },
  setState(id) {
    id = STATE_ALIAS[id] || id;
    if (!STATES[id]) return;
    app.state = id;
    hud.setState(id);
  },
  tour(id) {
    if (id) tour.play(id);
    else tour.playAll();
  },
  // true spreads the wings, false folds them away behind his back
  setWings(open) {
    app.wings = !!open;
    hud.setWings(app.wings);
    if (app.wings) behaviour.surge = Math.max(behaviour.surge, 0.6);
  },
  powerUp() {
    behaviour.surge = 1;
  },
  walk(fwd = 0, turn = 0) {
    walker.pad.fwd = fwd;
    walker.pad.turn = turn;
  },
  get parts() {
    return [...rig.parts.keys()];
  },
  // advance n frames of dt seconds by hand (used with ?manual=1 to record clips)
  step(dt = 1 / 30, n = 1) {
    for (let i = 0; i < n; i++) tick(dt);
  },
  rig,
  stage,
};
window.sentinel = api;

// Kyvern's own UI can drive him from another frame: postMessage({ sentinel: ['setState', 'thinking'] })
window.addEventListener('message', (e) => {
  const call = e.data && e.data.sentinel;
  if (Array.isArray(call) && typeof api[call[0]] === 'function' && call[0] !== 'rig') api[call[0]](...call.slice(1));
});

function setOpen(section, part) {
  app.section = section;
  app.openPart = part;
  hud.setSection(section);
  if (part) {
    const s = rig.sections.get(part.section);
    hud.showPart({ label: part.label, note: part.note, sectionLabel: s ? s.label : '', pieces: part.subs.map((x) => x.name) });
  } else hud.showPart(null);
}

function showTeardown(level) {
  app.teardownLevel = level;
  rig.teardown(level);
  setOpen('teardown', null);
}

function openThing(id) {
  if (id === 'overview' || !id) {
    rig.closeAll();
    app.teardownLevel = 0;
    setOpen('overview', null);
    stage.spin = 0;
  } else if (id === 'teardown') {
    // first click: every part apart. Second click: every piece of every part too.
    showTeardown(app.section === 'teardown' && app.teardownLevel === 1 ? 2 : 1);
  } else if (rig.sections.has(id)) {
    rig.openSection(id);
    app.teardownLevel = 0;
    setOpen(id, null);
  } else if (rig.parts.has(id)) showPart(id);
}

// Open one part to show its pieces. (The core is both a section and a part, so this is separate.)
function showPart(id) {
  const p = rig.get(id);
  if (!p) return;
  rig.openPart(id);
  app.teardownLevel = 0;
  setOpen(p.section, p);
  if (id === 'core') behaviour.surge = 1;
}

// ---- tour ------------------------------------------------------------------------------
const tour = new Tour(chapters, {
  begin(ch) {
    hud.setChapter(ch.id);
    if (ch.view) stage.view(ch.view[0] + walker.heading, ch.view[1]);
    if (ch.teardown) {
      showTeardown(1);
      stage.spin = (Math.PI * 2 * (330 / 360)) / (ch.seconds - 1);
      stage.goal = null;
    } else if (ch.section) openThing(ch.section);
    else openThing('overview');
    if (ch.form) api.setForm(ch.form);
    if (ch.surge) behaviour.surge = 1;
    app.caption = [`Tour · ${ch.label}`, ''];
  },
  line(ch, i) {
    app.caption = [`Tour · ${ch.label}`, ch.lines[i]];
  },
  end(ch, more) {
    hud.setChapter(null);
    stage.spin = 0;
    if (ch.form) api.setForm('sentinel');
    app.caption = null;
    if (!more) {
      openThing('overview');
      stage.home();
    }
  },
  progress: (k) => hud.setProgress(k),
});
walker.onStart = () => {
  tour.stop();
  homing = false;
  if (rig.isOpen()) openThing('overview');
};

// ---- picking: click a part to open it. The camera is never moved by a click. -------------------
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let down = null;
let hovered = null;
function partAt(e) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, stage.camera);
  const hit = ray.intersectObjects(rig.pickables, false)[0];
  return hit ? hit.object.userData : null;
}
canvas.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY, t: performance.now() }));
canvas.addEventListener('pointerup', (e) => {
  if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6 || performance.now() - down.t > 500) return;
  const hit = partAt(e);
  tour.stop();
  if (!hit) openThing('overview');
  else if (app.openPart === hit.part) openThing('overview');
  else showPart(hit.part.id);
});
canvas.addEventListener('pointermove', (e) => {
  if (e.buttons || e.pointerType === 'touch') return (hovered = null);
  const hit = partAt(e);
  hovered = hit ? { hit, x: e.clientX, y: e.clientY } : null;
  canvas.style.cursor = hit ? 'pointer' : 'grab';
});
canvas.addEventListener('pointerleave', () => (hovered = null));
canvas.addEventListener('dblclick', () => stage.home());

// ---- labels -----------------------------------------------------------------------------
const tmp = new THREE.Vector3();

const corePos = new THREE.Vector3();
// the core throws its own light on his chest, arms and wings
const coreLight = new THREE.PointLight('#ffffff', 0, 3.2, 2);
stage.scene.add(coreLight);
const box = new THREE.Box3();
const scr = { x: 0, y: 0, visible: false };
// Each label is tied to its part: a dot sits on the part's own metal and a leader line runs
// out to the name. Names are pushed apart so two never sit on top of each other.
const meshCache = new Map();
function anchor(key, objects, out) {
  let list = meshCache.get(key);
  if (!list) {
    list = [];
    for (const o of objects) o.traverse((m) => m.isMesh && list.push(m));
    for (const m of list) if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
    meshCache.set(key, list);
  }
  box.makeEmpty();
  for (const o of objects) box.expandByObject(o);
  box.getCenter(out);
  // the centre of a part can be empty air (a ring, a fan of blades): snap to its nearest piece of metal
  let best = Infinity;
  for (const m of list) {
    const c = tmp2.copy(m.geometry.boundingSphere.center).applyMatrix4(m.matrixWorld);
    const d = c.distanceToSquared(out);
    if (d < best) {
      best = d;
      tmp3.copy(c);
    }
  }
  return list.length ? out.copy(tmp3) : out;
}
const tmp2 = new THREE.Vector3();
const tmp3 = new THREE.Vector3();
// Labels keep their side and glide to their slot, so they never jump or swap while parts move.
const slots = new Map(); // label key -> { dir, ly }
let labelClock = 0;
function labels(dt) {
  const out = [];
  const push = (key, text, v, sub, alpha) => {
    stage.project(v, scr);
    if (scr.visible && alpha > 0.05) out.push({ key, text, ax: scr.x, ay: scr.y, sub, alpha });
  };
  for (const p of rig.parts.values()) {
    // the pieces of a part are only named when that one part is open, never in a full teardown
    if (p === app.openPart && p.sub > 0.05) {
      for (const s of p.subs) push(`${p.id}/${s.name}`, s.name, anchor(s, [s.object], tmp), true, Math.min(1, p.sub * 1.4));
    } else if (p.sep > 0.25 && p.sepTarget > 0 && !(app.openPart && p.subTarget > 0)) push(p.id, p.label, anchor(p, p.subs.map((s) => s.object), tmp), false, Math.min(1, (p.sep - 0.25) * 2));
  }
  labelClock++;
  if (out.length) {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const wide = W > 900;
    const mid = out.reduce((s, it) => s + it.ax, 0) / out.length;
    for (const it of out) {
      let slot = slots.get(it.key);
      if (!slot || slot.seen < labelClock - 1) slots.set(it.key, (slot = { dir: it.ax < mid ? -1 : 1, ly: null }));
      slot.seen = labelClock;
      it.slot = slot;
      it.dir = slot.dir;
    }
    const top = wide ? 150 : 90;
    const bottom = H - (parseFloat(getComputedStyle(hud.root).getPropertyValue('--dock-h')) || 60) - 70;
    for (const dir of [-1, 1]) {
      const side = out.filter((it) => it.dir === dir).sort((a, b) => a.ay - b.ay);
      if (!side.length) continue;
      // one straight column of names per side, just outside the outermost part on that side
      const edge = dir < 0 ? Math.min(...side.map((it) => it.ax)) : Math.max(...side.map((it) => it.ax));
      const col = Math.max(wide ? 330 : 96, Math.min(W - (wide ? 330 : 96), edge + dir * 56));
      const gap = Math.min(22, Math.max(15, (bottom - top) / side.length));
      let last = -Infinity;
      for (const it of side) {
        it.ty = Math.max(it.ay, last + gap);
        last = it.ty;
      }
      const over = side.reduce((s, it) => s + (it.ty - it.ay), 0) / side.length;
      const shift = Math.min(0, bottom - (last - over / 2)) - over / 2;
      const lift = Math.max(0, top - (side[0].ty + shift));
      for (const it of side) {
        const want = it.ty + shift + lift;
        it.slot.ly = it.slot.ly == null ? want : it.slot.ly + (want - it.slot.ly) * (1 - Math.exp(-10 * dt));
        it.slot.lx = it.slot.lx == null ? col : it.slot.lx + (col - it.slot.lx) * (1 - Math.exp(-10 * dt));
        it.ly = it.slot.ly;
        it.lx = it.slot.lx;
      }
    }
  }
  hud.drawLabels(out);
}

// ---- telemetry ----------------------------------------------------------------------------
let battery = 87;
let load = [0.2, 0.2, 0.2, 0.2, 0.2, 0.2];
let cardClock = 0;
let heat = 0.3;
function telemetry(dt) {
  cardClock += dt;
  battery = Math.max(5, battery - dt * (0.004 + forms.params.thrust * 0.01 + walker.gait * 0.01));
  if (cardClock < 0.12) return;
  cardClock = 0;
  const busy = Math.min(1, walker.gait * 0.7 + (forms.busy ? 0.8 : 0) + forms.params.thrust * 0.08 + (rig.isOpen() ? 0.25 : 0) + behaviour.cur.beat * 0.5 + behaviour.cur.flare * 0.2 + Math.abs(wingVel) * 0.8);
  load = load.map((v, i) => v + (0.12 + busy * (0.55 + 0.4 * Math.sin(performance.now() / 300 + i * 1.7)) - v) * 0.35);
  const core = Math.min(2.4, behaviour.core) / 2.4;
  heat += (core - heat) * 0.04; // the core takes a while to heat up and cool down
  const thrust = Math.max(0, paint.mats.thrust.emissiveIntensity - 0.2) / 6;
  const spanDeg = Math.max(0, wingNow.top - wingNow.bottom) * wing;
  const speed = Math.abs(walker.speed) * (forms.height > 0.5 ? 172 : 3.6);
  hud.setMeters({
    core: { value: (core * 4.2 * 1.6).toFixed(1), level: core },
    temp: { value: Math.round(1900 + heat * 2600), level: heat, hot: heat > 0.72 },
    servo: { value: Math.round(busy * 100), bars: load },
    hyd: { value: Math.round(182 + busy * 46 + Math.sin(performance.now() / 900) * 3), level: 0.55 + busy * 0.4 },
    thrust: { value: Math.round(Math.min(1, thrust) * 76), level: thrust },
    span: { value: (1.3 + 6.1 * Math.min(1, spanDeg / 86) * wing).toFixed(1), level: (spanDeg / 110) * wing },
    alt: { value: (forms.height * 34 + rig.lift).toFixed(1), level: forms.height / 2.5 },
    speed: { value: Math.round(speed), level: speed / 900 },
    cell: { value: Math.round(battery), level: battery / 100 },
  });
}

// ---- frame -----------------------------------------------------------------------------
const clock = new THREE.Clock();
const focus = new THREE.Vector3();
const wingNow = { top: 0, bottom: 0 };
const glowBase = { glow: ROLES.glow.glow, core: ROLES.core.glow };
let time = 0;
const manual = query.get('manual') === '1'; // frames are advanced by sentinel.step(), for captures
function frame() {
  tick(Math.min(0.05, clock.getDelta()));
  if (!manual) requestAnimationFrame(frame);
}
function tick(real) {
  const dt = real * app.speed;
  time += dt;
  const flying = forms.height > 0.5;
  const st = STATES[app.state];

  // Starship form flies a patrol circuit on its own; leaving it, he flies back to the pad and lands
  const cruise = forms.current === 'vehicle' && forms.params.fly > 0.85 ? 1 : 0;
  walker.auto.fwd = cruise * 0.8;
  walker.auto.turn = cruise * 0.42;
  if (homing && !cruise) {
    const k = 1 - Math.exp(-1.6 * dt);
    rig.root.position.x -= rig.root.position.x * k;
    rig.root.position.z -= rig.root.position.z * k;
    const turns = Math.round(walker.heading / (Math.PI * 2)) * Math.PI * 2;
    walker.heading += (turns - walker.heading) * k;
    if (Math.hypot(rig.root.position.x, rig.root.position.z) < 0.01 && Math.abs(turns - walker.heading) < 0.01 && !forms.busy) homing = false;
  }
  // chase view while he cruises: behind and above, so the ground and air rush past him
  if (cruise && !stage.dragging && !walker.steering) stage.goal = { az: walker.heading + Math.PI - 0.62, el: 0.36 };
  stage.padHold = flying;
  walker.update(dt, flying);
  behaviour.update(dt, st, flying ? 0.3 : 1);
  forms.update(dt);
  rig.update(dt);

  // the model's own moving pieces
  const p = forms.params;
  // wings: the starship always needs them out; otherwise they follow the Wings switch and the state
  const wingGoal = forms.current === 'vehicle' || (app.wings && st.wings !== false) ? 1 : 0;
  // a critically damped spring: no top-speed clamp and no snap, so the fold starts and lands softly
  const wingRate = 2.6;
  const wingAcc = wingRate * wingRate * (wingGoal - wing) - 2 * wingRate * wingVel;
  wingVel += wingAcc * dt;
  wing = Math.max(0, Math.min(1, wing + wingVel * dt));
  // states add to the fan: combat flares it wider, overdrive beats it
  const calmW = flying ? 0 : 1;
  const beat = Math.sin(time * 4.6) * behaviour.cur.beat * calmW;
  wingNow.top = p.fanTop + (behaviour.cur.flare * 16 + beat * 10) * calmW;
  wingNow.bottom = p.fanBottom + (behaviour.cur.flare * -6 + beat * 16) * calmW;
  model.wings(wing, wingNow.top, wingNow.bottom, time * 2.2 * p.wingBeat, forms);
  if (behaviour.cur.beat > 0.02) for (const side of ['l', 'r']) forms.nudge(`wingdrive_${side}`, 0, beat * 0.1, beat * 0.2 * wing);
  model.orbit.forEach((r, i) => {
    r.rotation.x += dt * (0.9 + i * 0.5) * behaviour.spin;
    r.rotation.y += dt * (0.6 - i * 0.35) * behaviour.spin;
  });
  model.reactor.scale.setScalar(1 + 0.06 * Math.sin(time * 3) + behaviour.surge * 0.25);
  paint.mats.core.emissiveIntensity = glowBase.core * behaviour.core;
  paint.mats.glow.emissiveIntensity = glowBase.glow * behaviour.seam;
  paint.mats.thrust.emissiveIntensity = p.thrust * (0.85 + 0.15 * Math.sin(time * 31)) + Math.abs(walker.fwd) * (flying ? 3 : 0) + behaviour.cur.beat * 1.2;
  effects.update(dt, time);

  const hover = flying ? Math.sin(time * 1.6) * 0.06 : 0;
  rig.tilt.position.y = (model.hip || 1.98) + forms.height + rig.lift + (walker.bob || 0) + hover - behaviour.cur.drop * calmW + behaviour.cur.beat * calmW * (0.1 + 0.05 * Math.sin(time * 4.6 + 1.2));
  focus.set(rig.root.position.x, 1.95 + forms.height * 0.85 + rig.lift * 0.7, rig.root.position.z);
  model.reactor.getWorldPosition(corePos);
  coreLight.position.copy(corePos).addScaledVector(tmp.set(0, 0, 1).applyQuaternion(rig.root.quaternion), 0.45);
  coreLight.color.copy(paint.mats.core.emissive);
  coreLight.intensity = 1.6 * behaviour.core;
  paint.shared.uGrid.value = p.grid;
  stage.bloom.strength = 0.16 + 0.3 * p.grid;
  paint.update(real, corePos);
  // a full teardown is taller and wider than the robot, so the camera gives it room.
  // Opening a single part or section never moves the camera.
  stage.reach = 1 + 0.55 * Math.min(1, rig.lift / 1.1) * (app.section === 'teardown' ? 1 : 0);
  stage.update(real, focus);

  // the line under the data plate
  let caption = app.caption;
  if (!caption) {
    const sec = rig.sections.get(app.section);
    if (forms.busy) caption = ['Transforming', `${FORMS[forms.from].label} to ${FORMS[forms.current].label}`];
    else if (app.openPart) caption = [app.openPart.label, `${app.openPart.note} ${app.openPart.subs.length} pieces.`];
    else if (app.section === 'teardown') caption = ['Teardown', app.teardownLevel > 1 ? 'Every piece of every part spread out' : `All ${rig.parts.size} parts apart, each split at its joint`];
    else if (sec) caption = [sec.label, `${sec.lines.join(' · ')} · ${sec.parts.length} parts`];
    else if (Math.abs(wingVel) > 0.03) caption = ['Wings', wingGoal ? 'Arm swinging up, blades fanning out' : 'Blades stacking, arm stowing behind his back'];
    else if (walker.steering) caption = [flying ? 'Flying' : 'Walking', 'Under your control'];
    else if (homing && flying) caption = ['Returning', 'Flying back to the pad'];
    else caption = [`${FORMS[forms.current].label} form`, flying ? FORMS[forms.current].caption : `${FORMS[forms.current].caption} · ${st.label}: ${st.note.toLowerCase()}`];
  }
  hud.setCaption(caption[0], caption[1]);
  labels(real);
  if (hovered && !walker.moving) hud.setHover(app.openPart === hovered.hit.part ? hovered.hit.sub.name : hovered.hit.part.label, hovered.x, hovered.y);
  else hud.setHover(null);
  telemetry(real);

  stage.render(real);
}

hud.setForm(forms.current);
hud.setSpeed(app.speed);
hud.setParts(rig.parts.size, [...rig.parts.values()].reduce((n, q) => n + q.subs.length, 0));
hud.setLine(paint.current, paint.line().roles.glow);
hud.setState(app.state);
hud.setWings(app.wings);
hud.setSection('overview');
if (query.get('quality')) {
  stage.autoQuality = false;
  stage.setQuality(+query.get('quality'));
}
if (query.get('spin')) stage.spin = +query.get('spin') || 0.25;
loadPartModels(rig, './parts/manifest.json');
if (manual) tick(1 / 30);
else requestAnimationFrame(frame);
