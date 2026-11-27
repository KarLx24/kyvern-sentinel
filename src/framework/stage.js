// Stage: renderer, camera, lights, floor and backdrop. The robot is added to stage.scene.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

const DEFAULT_THEME = {
  zenith: '#04060c',
  horizon: '#1b3a66',
  haze: '#0d1a2e',
  floor: '#0a0e14',
  grid: '#2bd9ff',
  key: '#ffffff',
  rimCool: '#35d6ff',
  rimWarm: '#ffb07a',
  windows: ['#39e1ff', '#ffb35c', '#ff4fa3', '#9d7bff'],
};

export class Stage {
  constructor(canvas, opts = {}) {
    this.theme = { ...DEFAULT_THEME, ...(opts.theme || {}) };
    this.canvas = canvas;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer = renderer;
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(this.theme.haze, 0.011);

    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 400);
    this.focus = new THREE.Vector3(0, 1.95, 0);
    this.homeDir = new THREE.Vector3(0.28, 0.1, 1).normalize();
    this.baseDistance = opts.distance || 11.5;
    this.zoom = 1;
    this.reach = 1; // the model asks for more room when it is fully taken apart
    this.camera.position.copy(this.focus).addScaledVector(this.homeDir, this.baseDistance);

    const controls = new OrbitControls(this.camera, canvas);
    controls.target.copy(this.focus);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minDistance = 4;
    controls.maxDistance = 26;
    controls.minPolarAngle = 0.25;
    controls.maxPolarAngle = Math.PI / 2 + 0.06;
    controls.rotateSpeed = 0.7;
    controls.addEventListener('start', () => {
      this.goal = null;
      this.spin = 0;
      this.dragging = true;
    });
    controls.addEventListener('end', () => (this.dragging = false));
    this.controls = controls;
    this.goal = null; // { az, el } the camera is easing toward
    this.spin = 0; // turntable speed, radians per second

    this.lights();
    this.environment();
    this.floor();
    this.backdrop();
    this.motes();

    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.16, 0.45, 1.35);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.quality = 3; // 3 full, 2 no bloom, 1 no shadows either
    this.frameMs = 16;
    this.slowFor = 0;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  lights() {
    const t = this.theme;
    this.scene.add(new THREE.HemisphereLight('#c3cede', '#0a0d12', 0.32));
    const key = new THREE.DirectionalLight(t.key, 2.4);
    key.position.set(4.5, 9, 7);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    const c = key.shadow.camera;
    c.left = c.bottom = -7;
    c.right = c.top = 7;
    c.near = 1;
    c.far = 30;
    this.key = key;
    this.keyOffset = key.position.clone();
    this.scene.add(key, key.target);
    const cool = new THREE.DirectionalLight(t.rimCool, 1.4);
    cool.position.set(-7, 5, -8);
    const warm = new THREE.DirectionalLight(t.rimWarm, 0.9);
    warm.position.set(8, 3.5, -6);
    const fill = new THREE.DirectionalLight('#7fa8ff', 0.7);
    fill.position.set(-6, 2, 6);
    this.scene.add(cool, warm, fill);
  }

  // Reflections come from a small light rig of our own, so glossy armour reads as armour.
  environment() {
    const t = this.theme;
    const env = new THREE.Scene();
    const room = new THREE.Mesh(new THREE.BoxGeometry(30, 20, 30), new THREE.MeshBasicMaterial({ color: '#06090f', side: THREE.BackSide }));
    env.add(room);
    const panel = (w, h, color, k, pos, look = [0, 2, 0]) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide }));
      m.position.set(...pos);
      m.lookAt(...look);
      env.add(m);
    };
    panel(9, 5, '#ffffff', 7, [0, 9.5, 2]);
    panel(3, 9, t.rimCool, 5, [-11, 4, -4]);
    panel(3, 9, t.rimWarm, 7, [11, 4, -5]);
    panel(12, 4, '#8db4ff', 2.2, [0, 3, 13]);
    panel(1.2, 8, '#ffffff', 6, [-7, 4, 9]);
    panel(1.2, 8, '#ffffff', 5, [8, 5, 8]);
    panel(14, 1.2, t.rimCool, 3, [0, 0.4, -12]);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(env, 0.03).texture;
    pmrem.dispose();

    // sky dome
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(300, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: { zenith: { value: new THREE.Color(t.zenith) }, horizon: { value: new THREE.Color(t.horizon) }, warm: { value: new THREE.Color(t.rimWarm) } },
        vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `varying vec3 vP; uniform vec3 zenith, horizon, warm;
          void main(){ vec3 d = normalize(vP); float h = clamp(d.y, 0.0, 1.0);
            vec3 c = mix(horizon, zenith, pow(h, 0.42));
            c += warm * 0.16 * exp(-h * 9.0) * (0.5 + 0.5 * d.x);
            gl_FragColor = vec4(c, 1.0); }`,
      }),
    );
    sky.name = 'sky';
    this.scene.add(sky);
    this.sky = sky;
  }

  floor() {
    const t = this.theme;
    // deck plates with thin lit seams
    const cv = document.createElement('canvas');
    cv.width = cv.height = 512;
    const g = cv.getContext('2d');
    g.fillStyle = '#000';
    g.fillRect(0, 0, 512, 512);
    g.strokeStyle = t.grid;
    g.globalAlpha = 0.9;
    g.lineWidth = 3;
    g.strokeRect(1.5, 1.5, 509, 509);
    g.globalAlpha = 0.28;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(256, 0);
    g.lineTo(256, 512);
    g.moveTo(0, 256);
    g.lineTo(512, 256);
    g.stroke();
    const seams = new THREE.CanvasTexture(cv);
    seams.wrapS = seams.wrapT = THREE.RepeatWrapping;
    seams.repeat.set(40, 40);
    seams.anisotropy = 8;
    seams.colorSpace = THREE.SRGBColorSpace;
    const deck = new THREE.Mesh(
      new THREE.CircleGeometry(120, 72),
      new THREE.MeshStandardMaterial({ color: t.floor, roughness: 0.92, metalness: 0.1, envMapIntensity: 0.25, emissive: '#ffffff', emissiveMap: seams, emissiveIntensity: 0.12 }),
    );
    deck.rotation.x = -Math.PI / 2;
    deck.receiveShadow = true;
    deck.name = 'deck';
    this.scene.add(deck);

    // the pad the robot stands on
    const pad = new THREE.Group();
    const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(t.grid), transparent: true, opacity: 0.38, depthWrite: false });
    const ring = (r0, r1, a0 = 0, len = Math.PI * 2) => {
      const m = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 96, 1, a0, len), ringMat);
      m.rotation.x = -Math.PI / 2;
      pad.add(m);
      return m;
    };
    ring(2.55, 2.6);
    ring(3.3, 3.32);
    this.ticks = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(new THREE.RingGeometry(2.78, 2.92, 24, 1, (i * Math.PI) / 2 + 0.2, 0.55), ringMat);
      m.rotation.x = -Math.PI / 2;
      this.ticks.add(m);
    }
    pad.add(this.ticks);
    pad.position.y = 0.012;
    this.pad = pad;
    this.scene.add(pad);
  }

  // A city of our own behind the pad: towers with lit windows, and a ring of pylons up close.
  backdrop() {
    const t = this.theme;
    const cv = document.createElement('canvas');
    cv.width = 128;
    cv.height = 512;
    const g = cv.getContext('2d');
    g.fillStyle = '#000';
    g.fillRect(0, 0, 128, 512);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let y = 4; y < 506; y += 8) {
      for (let x = 4; x < 124; x += 8) {
        if (rnd() < 0.62) continue;
        g.fillStyle = t.windows[Math.floor(rnd() * rnd() * t.windows.length)];
        g.globalAlpha = 0.25 + rnd() * 0.75;
        g.fillRect(x, y, 5, 3);
      }
    }
    const win = new THREE.CanvasTexture(cv);
    win.colorSpace = THREE.SRGBColorSpace;
    win.magFilter = THREE.NearestFilter;
    const towerMat = new THREE.MeshStandardMaterial({ color: '#0c121c', roughness: 0.5, metalness: 0.6, emissive: '#ffffff', emissiveMap: win, emissiveIntensity: 0.4 });
    const count = 150;
    const towers = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), towerMat, count);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    for (let i = 0; i < count; i++) {
      const a = rnd() * Math.PI * 2;
      const r = 55 + rnd() * 75;
      const w = 6 + rnd() * 9;
      const h = 10 + rnd() * rnd() * 60 + (r > 90 ? 16 : 0);
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, rnd() * Math.PI);
      m.compose(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r), q, new THREE.Vector3(w, h, 6 + rnd() * 9));
      towers.setMatrixAt(i, m);
    }
    towers.name = 'city';
    this.scene.add(towers);

    const pylons = new THREE.Group();
    const steel = new THREE.MeshStandardMaterial({ color: '#151c27', roughness: 0.45, metalness: 0.8 });
    const lampCool = new THREE.MeshBasicMaterial({ color: new THREE.Color(t.rimCool).multiplyScalar(0.7) });
    const lampWarm = new THREE.MeshBasicMaterial({ color: new THREE.Color(t.rimWarm).multiplyScalar(0.7) });
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + 0.31;
      if (Math.sin(a) > -0.2 || Math.abs(Math.cos(a)) < 0.3) continue; // keep the camera side clear
      const p = new THREE.Group();
      const h = 7 + (i % 3) * 1.6;
      p.add(new THREE.Mesh(new THREE.BoxGeometry(0.7, h, 0.7).translate(0, h / 2, 0), steel));
      p.add(new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.5, 1.3).translate(0, 0.25, 0), steel));
      p.add(new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.25, 0.5).translate(-0.9, h, 0), steel));
      p.add(new THREE.Mesh(new THREE.BoxGeometry(0.08, h * 0.7, 0.74).translate(-0.34, h * 0.5, 0), i % 2 ? lampCool : lampWarm));
      p.position.set(Math.cos(a) * 19, 0, Math.sin(a) * 19);
      p.lookAt(0, 0, 0);
      p.rotateY(-Math.PI / 2);
      pylons.add(p);
    }
    pylons.traverse((o) => o.isMesh && (o.castShadow = o.receiveShadow = true));
    this.scene.add(pylons);
  }

  motes() {
    const n = 110;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 1.5 + Math.random() * 10;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = Math.random() * 7;
      pos[i * 3 + 2] = Math.sin(a) * r;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ color: new THREE.Color(this.theme.grid).multiplyScalar(1.4), size: 0.03, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.dust = pts;
    this.scene.add(pts);
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(this.pixelRatio);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    // keep the whole robot in frame on tall, narrow screens
    this.fit = this.camera.aspect < 1 ? 1 / Math.max(0.5, this.camera.aspect) : 1;
    this.camera.updateProjectionMatrix();
    this.width = w;
    this.height = h;
  }

  setQuality(q) {
    this.quality = q;
    this.bloom.enabled = q >= 3;
    this.renderer.shadowMap.enabled = q >= 2;
    this.key.castShadow = q >= 2;
    if (q < 3) this.pixelRatio = Math.min(this.pixelRatio, 1.25);
    this.resize();
  }

  // Ease the camera round to a view angle. Distance is left alone on purpose.
  view(az, el) {
    this.goal = { az, el };
  }

  home() {
    this.zoom = 1;
    this._zooming = true;
    this.view(Math.atan2(this.homeDir.x, this.homeDir.z), Math.asin(this.homeDir.y));
  }

  setZoom(z) {
    this.zoom = Math.min(1.9, Math.max(0.55, z));
    return this.zoom;
  }

  // Screen position of a world point, for labels.
  project(v, out = { x: 0, y: 0, visible: false }) {
    const p = this._p || (this._p = new THREE.Vector3());
    p.copy(v).project(this.camera);
    out.x = (p.x * 0.5 + 0.5) * this.width;
    out.y = (-p.y * 0.5 + 0.5) * this.height;
    out.visible = p.z < 1 && p.z > -1;
    return out;
  }

  update(dt, focus) {
    const c = this.controls;
    // follow the robot: carry camera and target together
    if (focus) {
      const d = this._d || (this._d = new THREE.Vector3());
      d.copy(focus).sub(c.target);
      d.multiplyScalar(1 - Math.exp(-6 * dt));
      c.target.add(d);
      this.camera.position.add(d);
      this.key.position.copy(c.target).add(this.keyOffset);
      this.key.target.position.copy(c.target);
      this.pad.position.x = damp(this.pad.position.x, focus.x, 3, dt);
      this.pad.position.z = damp(this.pad.position.z, focus.z, 3, dt);
      this.dust.position.set(c.target.x, 0, c.target.z);
      this.sky.position.copy(this.camera.position);
    }
    const off = this._o || (this._o = new THREE.Vector3());
    const sph = this._s || (this._s = new THREE.Spherical());
    off.copy(this.camera.position).sub(c.target);
    sph.setFromVector3(off);
    if (this.goal) {
      let da = this.goal.az - sph.theta;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      sph.theta += da * (1 - Math.exp(-3 * dt));
      const phi = Math.PI / 2 - this.goal.el;
      sph.phi += (phi - sph.phi) * (1 - Math.exp(-3 * dt));
      if (Math.abs(da) < 0.004 && Math.abs(phi - sph.phi) < 0.004) this.goal = null;
    }
    if (this.spin) sph.theta += this.spin * dt;
    if (!this.dragging) {
      const want = (this.baseDistance * this.fit * this.reach) / this.zoom;
      if (this._want !== want) {
        this._want = want;
        this._zooming = true;
      }
      if (this._zooming) {
        sph.radius = damp(sph.radius, want, 5, dt);
        if (Math.abs(sph.radius - want) < 0.01) this._zooming = false;
      }
    }
    off.setFromSpherical(sph);
    this.camera.position.copy(c.target).add(off);
    c.update();
    this.ticks.rotation.y += dt * 0.25;
    this.dust.rotation.y += dt * 0.01;
  }

  render(dt) {
    if (this.quality >= 3) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
    // step quality down on machines that cannot keep up
    this.frameMs = this.frameMs * 0.95 + dt * 1000 * 0.05;
    if (this.frameMs > 42 && this.autoQuality !== false) {
      this.slowFor += dt;
      if (this.slowFor > 3 && this.quality > 1) {
        this.setQuality(this.quality - 1);
        this.slowFor = 0;
        this.frameMs = 20;
      }
    } else this.slowFor = 0;
  }
}
