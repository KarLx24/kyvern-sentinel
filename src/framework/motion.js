// Motion: walking under control, and the small idle movements that keep the robot alive.
// Both only add rotation on top of the current form (forms.nudge), so they work in any form.

const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
const KEYS = {
  KeyW: ['fwd', 1], ArrowUp: ['fwd', 1], KeyS: ['fwd', -1], ArrowDown: ['fwd', -1],
  KeyA: ['turn', 1], ArrowLeft: ['turn', 1], KeyD: ['turn', -1], ArrowRight: ['turn', -1],
};

export class Walker {
  constructor(rig, forms, opts = {}) {
    this.rig = rig;
    this.forms = forms;
    this.range = opts.range || 24;
    this.held = new Set();
    this.pad = { fwd: 0, turn: 0 };
    this.fwd = 0;
    this.turn = 0;
    this.heading = 0;
    this.phase = 0;
    this.gait = 0; // 0 standing, 1 full stride
    this.speed = 0;
    this.onStart = null;
    window.addEventListener('keydown', (e) => {
      if (!KEYS[e.code] || e.metaKey || e.ctrlKey || e.altKey || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      this.held.add(e.code);
      e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.held.delete(e.code));
    window.addEventListener('blur', () => this.held.clear());
  }

  get moving() {
    return Math.abs(this.fwd) > 0.05 || Math.abs(this.turn) > 0.05;
  }

  update(dt, flying) {
    let fwd = this.pad.fwd;
    let turn = this.pad.turn;
    for (const code of this.held) {
      const [axis, v] = KEYS[code];
      if (axis === 'fwd') fwd += v;
      else turn += v;
    }
    fwd = Math.max(-1, Math.min(1, fwd));
    turn = Math.max(-1, Math.min(1, turn));
    if ((fwd || turn) && !this.moving && this.onStart) this.onStart();
    this.fwd = damp(this.fwd, fwd, 6, dt);
    this.turn = damp(this.turn, turn, 7, dt);

    const root = this.rig.root;
    const pace = flying ? 5.2 : fwd < 0 ? 1.0 : 1.7;
    this.heading += this.turn * (flying ? 1.3 : 1.7) * dt;
    this.speed = this.fwd * pace;
    root.position.x += Math.sin(this.heading) * this.speed * dt;
    root.position.z += Math.cos(this.heading) * this.speed * dt;
    const r = Math.hypot(root.position.x, root.position.z);
    if (r > this.range) root.position.multiplyScalar(this.range / r);
    root.rotation.y = this.heading;

    const walking = !flying && this.moving;
    this.gait = damp(this.gait, walking ? Math.max(Math.abs(this.fwd), Math.abs(this.turn) * 0.6) : 0, 6, dt);
    const stride = Math.abs(this.speed) > 0.05 ? this.speed * 3.6 : this.turn * 3.2;
    if (this.gait > 0.01) this.phase += stride * dt;
    else this.phase = damp(this.phase, Math.round(this.phase / Math.PI) * Math.PI, 8, dt);

    const f = this.forms;
    const g = this.gait;
    const s = Math.sin(this.phase);
    const c = Math.cos(this.phase);
    if (g > 0.001) {
      for (const [side, k] of [['l', 1], ['r', -1]]) {
        const hip = -0.48 * s * k * g;
        const bend = 0.95 * Math.max(0, c * k) * g;
        f.nudge(`thigh_${side}`, hip - bend * 0.35, 0, 0);
        f.nudge(`knee_${side}`, bend, 0, 0);
        f.nudge(`boot_${side}`, -hip * 0.5 - bend * 0.55, 0, 0);
        f.nudge(`shoulder_${side}`, 0.34 * s * k * g, 0, 0);
        f.nudge(`forearm_${side}`, -0.25 * g - 0.2 * Math.max(0, s * k) * g, 0, 0);
      }
      f.nudge('abdomen', 0.03 * g, 0.07 * s * g, 0);
      f.nudge('chest', 0, -0.11 * s * g, 0);
      f.nudge('helm', 0, 0.04 * s * g, 0);
    }
    // step bounce, and banking into turns while flying
    this.bob = (-0.035 + 0.05 * Math.abs(c)) * g;
    if (flying) f.nudge('pelvis', -0.12 * this.fwd, 0, -0.45 * this.turn);
  }
}

// Idle life and the four assistant states. `state` is one entry of the model's STATES.
export class Behaviour {
  constructor(forms) {
    this.forms = forms;
    this.t = 0;
    this.look = { x: 0, y: 0 };
    this.pointer = { x: 0, y: 0, at: -1e9 };
    this.cur = { pulse: 1, level: 1, look: 1, sway: 1, lean: 0, spin: 1, tiltHead: 0, talk: 0 };
    this.voice = 0;
    this.surge = 0;
    window.addEventListener('pointermove', (e) => {
      this.pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
      this.pointer.at = performance.now();
    });
  }

  update(dt, state, calm = 1) {
    this.t += dt;
    const t = this.t;
    const cur = this.cur;
    for (const k of Object.keys(cur)) cur[k] = damp(cur[k], state[k] ?? (k === 'spin' ? 1 : k === 'lean' || k === 'tiltHead' || k === 'talk' ? 0 : 1), 4, dt);
    this.surge = damp(this.surge, 0, 1.4, dt);

    // look at the pointer; drift on his own when nobody has moved it for a while
    const away = performance.now() - this.pointer.at > 3500;
    const tx = away ? Math.sin(t * 0.31) * 0.5 : this.pointer.x;
    const ty = away ? Math.sin(t * 0.23 + 1) * 0.3 : this.pointer.y;
    this.look.x = damp(this.look.x, tx, 3.5, dt);
    this.look.y = damp(this.look.y, ty, 3.5, dt);
    const w = cur.look * calm;
    const f = this.forms;
    this.voice = cur.talk * (0.5 + 0.5 * Math.sin(t * 9.1) * Math.sin(t * 5.3 + 1) + 0.25 * Math.sin(t * 17));
    f.nudge('helm', this.look.y * 0.22 * w + this.voice * 0.03, this.look.x * 0.5 * w, (cur.tiltHead * Math.PI) / 180);
    f.nudge('chest', Math.sin(t * 1.25) * 0.012 * cur.sway, this.look.x * 0.08 * w, 0);
    f.nudge('abdomen', (cur.lean * Math.PI) / 180 + Math.sin(t * 1.25 + 0.6) * 0.008 * cur.sway, this.look.x * 0.05 * w, 0);
    for (const side of ['l', 'r']) {
      f.nudge(`shoulder_${side}`, 0, 0, Math.sin(t * 1.25 + 0.4) * 0.014 * cur.sway);
      f.nudge(`wingdrive_${side}`, 0, 0, Math.sin(t * 0.8) * 0.012 * cur.sway);
    }
    // light levels the model reads
    this.core = cur.level * (0.82 + 0.18 * Math.sin(t * cur.pulse * 2)) + this.voice * 0.5 + this.surge * 1.6;
    this.seam = 0.9 + 0.1 * Math.sin(t * cur.pulse * 2 - 1) + this.surge * 0.9 + this.voice * 0.25;
    this.spin = cur.spin;
  }
}
