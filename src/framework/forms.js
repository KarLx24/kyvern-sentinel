// Forms: named whole-body poses. Changing form blends every joint from one pose to the next
// while the parts briefly come apart and lock back in.
//
// A form is { label, joints: { partId: [x, y, z] degrees }, tilt: [x, y, z] degrees,
//             height: hover height, params: { any numbers the model wants blended } }.
import * as THREE from 'three';

const D = Math.PI / 180;
const ease = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const euler = new THREE.Euler();
const qAdd = new THREE.Quaternion();

function toQuat(deg) {
  return new THREE.Quaternion().setFromEuler(new THREE.Euler((deg?.[0] || 0) * D, (deg?.[1] || 0) * D, (deg?.[2] || 0) * D));
}

export class Forms {
  constructor(rig, forms, first) {
    this.rig = rig;
    this.forms = forms;
    this.current = first;
    this.from = first;
    this.t = 1;
    this.duration = 2.2;
    this.params = { ...(forms[first].params || {}) };
    this.height = forms[first].height || 0;
    this.add = new Map(); // per-frame extra rotation per part, radians [x, y, z]
    this.cache = {};
    for (const [id, f] of Object.entries(forms)) {
      const joints = {};
      for (const pid of rig.parts.keys()) joints[pid] = toQuat(f.joints?.[pid]);
      this.cache[id] = { joints, tilt: toQuat(f.tilt) };
    }
  }

  get busy() {
    return this.t < 1;
  }

  set(id) {
    if (!this.forms[id] || (id === this.current && !this.busy)) return false;
    this.from = this.current;
    this.current = id;
    this.t = 0;
    return true;
  }

  // Extra rotation layered on top of the form this frame (walking, breathing, looking).
  nudge(id, x = 0, y = 0, z = 0) {
    const a = this.add.get(id);
    if (a) {
      a[0] += x;
      a[1] += y;
      a[2] += z;
    } else this.add.set(id, [x, y, z]);
  }

  update(dt, speed = 1) {
    if (this.t < 1) this.t = Math.min(1, this.t + (dt * speed) / this.duration);
    const k = ease(this.t);
    const a = this.cache[this.from];
    const b = this.cache[this.current];
    const fa = this.forms[this.from];
    const fb = this.forms[this.current];

    for (const [id, part] of this.rig.parts) {
      part.pivot.quaternion.slerpQuaternions(a.joints[id], b.joints[id], k);
      const n = this.add.get(id);
      if (n) part.pivot.quaternion.multiply(qAdd.setFromEuler(euler.set(n[0], n[1], n[2])));
    }
    this.add.clear();

    this.rig.tilt.quaternion.slerpQuaternions(a.tilt, b.tilt, k);
    this.height = (fa.height || 0) + ((fb.height || 0) - (fa.height || 0)) * k;
    for (const key of Object.keys(fb.params || {})) {
      const x = fa.params?.[key] ?? fb.params[key];
      this.params[key] = x + (fb.params[key] - x) * k;
    }
    // parts let go in the middle of the change and lock back at the end
    this.rig.pulse(this.t < 1 ? Math.sin(Math.PI * this.t) * 0.3 : 0);
  }
}
