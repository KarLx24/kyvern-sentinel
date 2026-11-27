// Rig: the parts tree. Every part is its own joint, split where the real robot would split.
//
//   pivot  (where the part joins its parent; the pose rotates this)
//     shift  (moves the part away from its parent when its section is opened)
//       body   (the sub-parts; they spread when the part itself is opened)
//       ...child parts hang here, so a whole limb travels with its parent
//
// Nothing in here knows what a Sentinel is. A model file calls rig.section() and rig.part().
import * as THREE from 'three';

const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
const v3 = (a) => (a && a.isVector3 ? a.clone() : new THREE.Vector3(...(a || [0, 0, 0])));

export class Part {
  constructor(rig, def) {
    this.rig = rig;
    this.id = def.id;
    this.label = def.label || def.id;
    this.section = def.section || null;
    this.note = def.note || '';
    this.parent = def.parent || null;
    this.home = v3(def.at);
    this.explode = v3(def.explode);
    this.subs = [];
    this.sep = 0;
    this.sepTarget = 0;
    this.sub = 0;
    this.subTarget = 0;
    this.offset = new THREE.Vector3(); // extra pivot offset set by behaviours each frame

    this.pivot = new THREE.Group();
    this.pivot.name = `${this.id}:pivot`;
    this.pivot.position.copy(this.home);
    this.shift = new THREE.Group();
    this.body = new THREE.Group();
    this.pivot.add(this.shift);
    this.shift.add(this.body);
  }

  // A sub-part: one real piece of this part. `dir` is where it travels when the part opens.
  add(name, object, dir = [0, 0, 0]) {
    const sub = { name, object, home: object.position.clone(), dir: v3(dir), part: this };
    object.traverse((o) => {
      o.userData.part = this;
      o.userData.sub = sub;
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        this.rig.pickables.push(o);
      }
    });
    this.body.add(object);
    this.subs.push(sub);
    return object;
  }

  // Swap the coded body for a finished model (for example a GLB made from a part drawing).
  replaceBody(object, name = this.label) {
    for (const s of this.subs) {
      this.body.remove(s.object);
      s.object.traverse((o) => {
        const i = this.rig.pickables.indexOf(o);
        if (i >= 0) this.rig.pickables.splice(i, 1);
      });
    }
    this.subs = [];
    this.add(name, object);
  }

  // Centre of the part in world space, for labels.
  worldCentre(out = new THREE.Vector3()) {
    if (!this._box) this._box = new THREE.Box3();
    this._box.makeEmpty();
    for (const s of this.subs) this._box.expandByObject(s.object);
    return this._box.isEmpty() ? this.body.getWorldPosition(out) : this._box.getCenter(out);
  }
}

export class Rig {
  constructor() {
    this.root = new THREE.Group(); // where the robot stands on the floor
    this.root.name = 'rig:root';
    this.tilt = new THREE.Group(); // whole-body lean, used by forms
    this.root.add(this.tilt);
    this.parts = new Map();
    this.sections = new Map();
    this.pickables = [];
    this.lift = 0; // how far the robot rises so opened legs never sink through the floor
    this.spread = 1; // scales every separation, for small screens
  }

  section(def) {
    const s = { id: def.id, label: def.label, lines: def.lines || [], view: def.view || null, parts: [] };
    this.sections.set(s.id, s);
    return s;
  }

  part(def) {
    const p = new Part(this, def);
    const parent = def.parent ? this.parts.get(def.parent) : null;
    if (def.parent && !parent) throw new Error(`part "${def.id}": parent "${def.parent}" is not defined yet`);
    if (def.mirror) {
      // A mirrored side: build it once as the left side, flip it for the right.
      const flip = new THREE.Group();
      flip.scale.x = -1;
      (parent ? parent.shift : this.tilt).add(flip);
      flip.add(p.pivot);
    } else {
      (parent ? parent.shift : this.tilt).add(p.pivot);
    }
    this.parts.set(p.id, p);
    const s = this.sections.get(p.section);
    if (s) s.parts.push(p);
    return p;
  }

  get(id) {
    return this.parts.get(id);
  }

  // ---- teardown state -------------------------------------------------------------------
  closeAll() {
    for (const p of this.parts.values()) {
      p.sepTarget = 0;
      p.subTarget = 0;
    }
  }

  // Open one section: its parts step away from the body so each joint shows.
  openSection(id) {
    this.closeAll();
    const s = this.sections.get(id);
    if (!s) return;
    for (const p of s.parts) p.sepTarget = 1;
  }

  // Open one part: it steps out a little and its own pieces spread.
  openPart(id) {
    const p = this.parts.get(id);
    if (!p) return;
    const keep = p.section;
    for (const q of this.parts.values()) {
      q.subTarget = 0;
      if (q.section !== keep) q.sepTarget = 0;
    }
    p.subTarget = 1;
    p.sepTarget = Math.max(p.sepTarget, 0.55);
  }

  // Every part apart. level 2 also spreads the pieces inside each part.
  teardown(level = 1) {
    for (const p of this.parts.values()) {
      p.sepTarget = 1;
      p.subTarget = level > 1 ? 1 : 0;
    }
  }

  // A short pulse of separation, used while changing form.
  pulse(amount) {
    this._pulse = amount;
  }

  isOpen() {
    for (const p of this.parts.values()) if (p.sepTarget > 0 || p.subTarget > 0) return true;
    return false;
  }

  update(dt) {
    const pulse = this._pulse || 0;
    let lowest = 0;
    for (const p of this.parts.values()) {
      p.sep = damp(p.sep, p.sepTarget, 5.5, dt);
      p.sub = damp(p.sub, p.subTarget, 6.5, dt);
      const k = Math.max(p.sep, pulse) * this.spread;
      p.pivot.position.copy(p.home).add(p.offset);
      p.shift.position.copy(p.explode).multiplyScalar(k);
      for (const s of p.subs) s.object.position.copy(s.home).addScaledVector(s.dir, p.sub * this.spread);
      // running total of downward travel along the chain
      const parent = p.parent ? this.parts.get(p.parent) : null;
      p._down = (parent ? parent._down : 0) + p.explode.y * p.sep * this.spread;
      if (p._down < lowest) lowest = p._down;
    }
    this.lift = damp(this.lift, -lowest, 6, dt);
  }
}
