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
import { ROLES, LINES, FORMS, STATES, CHAPTERS, CARDS } from './sentinel/config.js';

const query = new URLSearchParams(location.search);
const pick = (key, table, fallback) => (table[query.get(key)] ? query.get(key) : fallback);
const SPEEDS = [1, 0.5, 0.25, 2];

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

const chapters = CHAPTERS.map((c) => {
  const s = SECTIONS.find((x) => x.id === c.section);
  return { ...c, label: c.label || s.label, lines: c.lines || s.lines, view: c.view || s.view };
});

const app = {
  state: pick('state', STATES, 'idle'),
  speed: 1,
  section: 'overview', // what the left list shows as open
  openPart: null,
  teardownLevel: 0,
  caption: '',
  wings: query.get('wings') !== 'folded',
};
let wingVel = 0; // how fast the wings are moving, so they ease in and out and can turn round mid-way
let wing = 0; // 0 folded away, 1 spread. Starts folded so he opens them as the page loads.

// ---- HUD -------------------------------------------------------------------------------
const hud = new Hud(
  document.getElementById('hud'),
  {
    name: 'Kyvern Sentinel',
    code: 'SENTINEL · SN-01',
    banner: 'S E N T I N E L · S N - 0 1',
    credit: 'Kyvern Sentinel SN-01 · design and direction by Karl Salvador · built with Claude · <a href="./portrait/">portrait render</a>',
    chapters,
    sections: SECTIONS,
    forms: FORMS,
    lines: LINES,
    states: STATES,
    cards: CARDS,
  },
  {
    chapter: (id) => tour.play(id),
    tourAll: () => (tour.active ? tour.stop() : tour.playAll()),
    section: (id) => api.open(id === app.section && id !== 'teardown' ? 'overview' : id),
    form: (id) => api.setForm(id),
    line: (id) => api.setLine(id),
    state: (id) => api.setState(id),
    wings: (open) => api.setWings(open),
    zoom: (d) => hud.setZoom(stage.setZoom(stage.zoom * (d > 0 ? 1.15 : 1 / 1.15))),
    speed: () => {
      app.speed = SPEEDS[(SPEEDS.indexOf(app.speed) + 1) % SPEEDS.length];
      hud.setSpeed(app.speed);
    },
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
    }
    hud.setForm(id, FORMS[id].caption);
  },
  setLine(id) {
    if (paint.set(id)) hud.setLine(id, paint.line().roles.glow);
  },
  setState(id) {
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
    app.caption = `${ch.label}`;
  },
  line(ch, i) {
    app.caption = `${ch.label} · ${ch.lines[i]}`;
  },
  end(ch, more) {
    hud.setChapter(null);
    stage.spin = 0;
    if (ch.form) api.setForm('sentinel');
    app.caption = '';
    if (!more) {
      openThing('overview');
      stage.home();
    }
  },
  progress: (k) => hud.setProgress(k),
});
walker.onStart = () => {
  tour.stop();
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
function labels() {
  const out = [];
  const push = (text, v, sub, alpha) => {
    stage.project(v, scr);
    if (scr.visible && alpha > 0.05) out.push({ text, ax: scr.x, ay: scr.y, sub, alpha });
  };
  for (const p of rig.parts.values()) {
    if (p.sub > 0.05) {
      for (const s of p.subs) push(s.name, anchor(s, [s.object], tmp), true, Math.min(1, p.sub * 1.4));
    } else if (p.sep > 0.25 && p.sepTarget > 0) push(p.label, anchor(p, p.subs.map((s) => s.object), tmp), false, Math.min(1, (p.sep - 0.25) * 2));
  }
  if (out.length) {
    // names go out to the side their part is on, then spread down so they do not collide
    const mid = out.reduce((s, it) => s + it.ax, 0) / out.length;
    const reach = out.length > 8 ? 64 : 48;
    for (const dir of [-1, 1]) {
      const side = out.filter((it) => (it.ax >= mid ? 1 : -1) === dir).sort((a, b) => a.ay - b.ay);
      let last = -Infinity;
      for (const it of side) {
        it.dir = dir;
        it.lx = it.ax + dir * reach;
        it.ly = Math.max(it.ay, last + 21);
        last = it.ly;
      }
      // if the stack ran long, slide it back up so it stays centred on its parts
      const over = side.reduce((s, it) => s + (it.ly - it.ay), 0) / (side.length || 1);
      for (const it of side) it.ly -= over / 2;
    }
  }
  hud.drawLabels(out);
}

// ---- telemetry ----------------------------------------------------------------------------
let battery = 87;
let load = [0.2, 0.2, 0.2, 0.2, 0.2, 0.2];
let cardClock = 0;
function telemetry(dt) {
  cardClock += dt;
  battery = Math.max(5, battery - dt * (0.004 + forms.params.thrust * 0.01 + walker.gait * 0.01));
  if (cardClock < 0.12) return;
  cardClock = 0;
  const busy = Math.min(1, walker.gait * 0.7 + (forms.busy ? 0.8 : 0) + forms.params.thrust * 0.08 + (rig.isOpen() ? 0.25 : 0));
  load = load.map((v, i) => v + (0.12 + busy * (0.55 + 0.4 * Math.sin(performance.now() / 300 + i * 1.7)) - v) * 0.35);
  const core = Math.min(1.2, behaviour.core * 0.62);
  const span = (forms.params.fanTop - forms.params.fanBottom) * wing;
  hud.setCards([
    { value: Math.round(core * 100), unit: '%', level: Math.min(1, core * 0.8) },
    { value: Math.round(span), unit: '°', level: span / 110 },
    { value: Math.round(busy * 100), unit: '%', bars: load },
    { value: Math.round(battery), unit: '%', level: battery / 100 },
  ]);
}

// ---- frame -----------------------------------------------------------------------------
const clock = new THREE.Clock();
const focus = new THREE.Vector3();
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

  walker.update(dt, flying);
  behaviour.update(dt, STATES[app.state], flying ? 0.3 : 1);
  forms.update(dt);
  rig.update(dt);

  // the model's own moving pieces
  const p = forms.params;
  // wings: flight always needs them out; otherwise they follow the Wings switch
  const wingGoal = app.wings || forms.current === 'flight' ? 1 : 0;
  const wingMax = wingGoal ? 0.46 : 0.52; // top speed, in spreads per second
  const wingWant = Math.max(-wingMax, Math.min(wingMax, (wingGoal - wing) * 3.2));
  wingVel += (wingWant - wingVel) * (1 - Math.exp(-5 * dt));
  wing = Math.max(0, Math.min(1, wing + wingVel * dt));
  if (Math.abs(wingGoal - wing) < 0.0015 && Math.abs(wingVel) < 0.01) { wing = wingGoal; wingVel = 0; }
  model.wings(wing, p.fanTop, p.fanBottom, time * 2.2 * p.wingBeat, forms);
  model.orbit.forEach((r, i) => {
    r.rotation.x += dt * (0.9 + i * 0.5) * behaviour.spin;
    r.rotation.y += dt * (0.6 - i * 0.35) * behaviour.spin;
  });
  model.reactor.scale.setScalar(1 + 0.06 * Math.sin(time * 3) + behaviour.surge * 0.25);
  paint.mats.core.emissiveIntensity = glowBase.core * behaviour.core;
  paint.mats.glow.emissiveIntensity = glowBase.glow * behaviour.seam;
  paint.mats.thrust.emissiveIntensity = p.thrust * (0.85 + 0.15 * Math.sin(time * 31)) + Math.abs(walker.fwd) * (flying ? 3 : 0);

  const hover = flying ? Math.sin(time * 1.6) * 0.06 : 0;
  rig.tilt.position.y = (model.hip || 1.98) + forms.height + rig.lift + (walker.bob || 0) + hover;
  focus.set(rig.root.position.x, 1.95 + forms.height * 0.85 + rig.lift * 0.7, rig.root.position.z);
  model.reactor.getWorldPosition(corePos);
  paint.update(real, corePos);
  // a full teardown is taller and wider than the robot, so the camera gives it room.
  // Opening a single part or section never moves the camera.
  stage.reach = 1 + 0.55 * Math.min(1, rig.lift / 1.1) * (app.section === 'teardown' ? 1 : 0);
  stage.update(real, focus);

  // words under the robot
  let caption = app.caption;
  if (!caption) {
    if (forms.busy) caption = `${FORMS[forms.from].label} form · changing to ${FORMS[forms.current].label}`;
    else if (app.openPart) caption = `${app.openPart.label} · ${app.openPart.subs.length} pieces`;
    else if (app.section === 'teardown') caption = app.teardownLevel > 1 ? 'Teardown · every piece' : `Teardown · ${rig.parts.size} parts`;
    else if (app.section !== 'overview') caption = `${rig.sections.get(app.section).label} · ${rig.sections.get(app.section).parts.length} parts`;
    else if (wing > 0.02 && wing < 0.98) caption = wingGoal ? 'Wings · spreading' : 'Wings · folding away';
    else if (walker.moving) caption = flying ? 'Flight form · under control' : 'Walking · under control';
    else caption = `${FORMS[forms.current].label} form · ${STATES[app.state].label.toLowerCase()}`;
  }
  hud.setCaption(caption);
  labels();
  if (hovered && !walker.moving) hud.setHover(app.openPart === hovered.hit.part ? hovered.hit.sub.name : hovered.hit.part.label, hovered.x, hovered.y);
  else hud.setHover(null);
  telemetry(real);

  stage.render(real);
}

hud.setForm(forms.current, FORMS[forms.current].caption);
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
