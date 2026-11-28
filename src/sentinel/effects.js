// Effects that belong to the Sentinel rather than the framework: thruster flames on his soles
// and back, the visor's scanning beam, and the light grid on the floor in the light-line form.
import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);

function flameMesh() {
  // a cone with its base at the origin, pointing down -Y; the tip fades out
  const geo = new THREE.ConeGeometry(1, 1, 20, 6, true);
  geo.translate(0, -0.5, 0);
  geo.rotateX(Math.PI);
  geo.translate(0, -1, 0);
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color('#35d9f8') }, uTime: { value: 0 }, uPower: { value: 0 } },
    vertexShader: 'varying float vK; void main() { vK = -position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 uColor; uniform float uTime; uniform float uPower; varying float vK;
      void main() {
        float body = pow(1.0 - vK, 1.6);
        float flick = 0.8 + 0.2 * sin(vK * 26.0 - uTime * 42.0);
        vec3 c = mix(uColor, vec3(1.0), pow(1.0 - vK, 5.0) * 0.85);
        gl_FragColor = vec4(c * body * flick * uPower * 1.6, 1.0);
      }`,
  });
  return new THREE.Mesh(geo, mat);
}

export function buildEffects({ rig, stage, paint, forms, behaviour }) {
  const flames = [];
  const box = new THREE.Box3();
  const size = new THREE.Vector3();
  const centre = new THREE.Vector3();
  rig.root.updateMatrixWorld(true);

  // a flame under each sole, and two bigger ones on the back
  const addFlame = (part, at, dir, radius, length) => {
    const f = flameMesh();
    f.userData = { radius, length };
    f.position.copy(at);
    f.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
    stage.scene.add(f);
    f.updateMatrixWorld(true);
    part.body.attach(f); // keeps where it is now, then rides with the part
    f.userData.base = f.scale.clone();
    f.frustumCulled = false;
    flames.push(f);
  };
  for (const side of ['l', 'r']) {
    const boot = rig.get(`boot_${side}`);
    if (!boot) continue;
    box.setFromObject(boot.body);
    box.getSize(size);
    box.getCenter(centre);
    addFlame(boot, new THREE.Vector3(centre.x, box.min.y + 0.03, centre.z - size.z * 0.12), new THREE.Vector3(0, -1, 0), size.x * 0.34, 1.5);
  }
  const chest = rig.get('chest');
  if (chest) {
    box.setFromObject(chest.body);
    box.getSize(size);
    box.getCenter(centre);
    for (const s of [-1, 1]) addFlame(chest, new THREE.Vector3(centre.x + s * size.x * 0.17, box.min.y + size.y * 0.25, box.min.z + 0.08), new THREE.Vector3(0, -0.97, -0.24).normalize(), 0.075, 0.8);
  }

  // the visor's scan: a flat fan of light from his eyes, swept by the head
  const helm = rig.get('helm');
  let beam = null;
  if (helm) {
    const shape = new THREE.BufferGeometry();
    const reach = 4.2;
    const half = 0.24;
    shape.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, -reach * half, -1.5, reach, reach * half, -1.5, reach], 3));
    shape.setAttribute('uv', new THREE.Float32BufferAttribute([0.5, 0, 0, 1, 1, 1], 2));
    beam = new THREE.Mesh(
      shape,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: { uColor: { value: new THREE.Color('#35d9f8') }, uTime: { value: 0 }, uPower: { value: 0 } },
        vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `uniform vec3 uColor; uniform float uTime; uniform float uPower; varying vec2 vUv;
          void main() {
            float fade = pow(1.0 - vUv.y, 1.3);
            float lines = 0.55 + 0.45 * step(0.5, fract(vUv.y * 22.0 - uTime * 1.5));
            gl_FragColor = vec4(uColor * fade * lines * uPower * 0.3, 1.0);
          }`,
      }),
    );
    box.setFromObject(helm.body);
    box.getSize(size);
    box.getCenter(centre);
    beam.position.set(centre.x, centre.y + size.y * 0.05, box.max.z);
    stage.scene.add(beam);
    beam.updateMatrixWorld(true);
    helm.pivot.attach(beam);
    beam.frustumCulled = false;
  }

  // floor grid for the light-line form
  const grid = new THREE.Mesh(
    new THREE.PlaneGeometry(160, 160),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uColor: { value: new THREE.Color('#35d9f8') }, uPower: { value: 0 } },
      vertexShader: 'varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `uniform vec3 uColor; uniform float uPower; varying vec3 vW;
        float lines(vec2 p, float px) { vec2 g = abs(fract(p - 0.5) - 0.5) / fwidth(p); return 1.0 - min(min(g.x, g.y) / px, 1.0); }
        void main() {
          float fine = lines(vW.xz, 1.1);
          float bold = lines(vW.xz / 5.0, 1.8);
          float far = exp(-length(vW.xz - cameraPosition.xz) * 0.035);
          gl_FragColor = vec4(uColor, (fine * 0.35 + bold * 0.75) * far * uPower);
        }`,
    }),
  );
  grid.rotation.x = -Math.PI / 2;
  grid.position.y = 0.03;
  grid.visible = false;
  stage.scene.add(grid);

  // air streaks: specks that hang still in the air and smear into lines as he flies through them
  const N = 110;
  const SPAN = 34;
  const seeds = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) seeds.set([Math.random() * SPAN, 0.4 + Math.random() * 6.5, Math.random() * SPAN], i * 3);
  const streakPos = new Float32Array(N * 6);
  const streakGeo = new THREE.BufferGeometry();
  streakGeo.setAttribute('position', new THREE.BufferAttribute(streakPos, 3));
  const streaks = new THREE.LineSegments(streakGeo, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  streaks.frustumCulled = false;
  streaks.visible = false;
  stage.scene.add(streaks);
  const wrap = (v, c) => c + ((((v - c + SPAN / 2) % SPAN) + SPAN) % SPAN) - SPAN / 2;

  return {
    flames,
    update(dt, time) {
      const glow = paint.mats.glow.emissive;
      // flames follow the thrust the form asks for, with a kick when the user flies him
      const thrust = Math.max(0, Math.min(1.4, (paint.mats.thrust.emissiveIntensity - 0.6) / 5));
      for (const f of flames) {
        f.visible = thrust > 0.01;
        if (!f.visible) continue;
        const u = f.material.uniforms;
        u.uColor.value.copy(glow);
        u.uTime.value = time;
        u.uPower.value = Math.min(1, thrust * 1.4);
        const wob = 1 + 0.06 * Math.sin(time * 37 + f.id);
        const b = f.userData.base;
        f.scale.set(b.x * f.userData.radius, b.y * f.userData.length * thrust * wob, b.z * f.userData.radius);
      }
      if (beam) {
        const k = behaviour.cur.scan * (forms.height > 0.5 ? 0 : 1);
        beam.visible = k > 0.01;
        beam.material.uniforms.uColor.value.copy(glow);
        beam.material.uniforms.uTime.value = time;
        beam.material.uniforms.uPower.value = k;
      }
      const fly = forms.params.fly;
      streaks.visible = fly > 0.05;
      if (streaks.visible) {
        const root = rig.root;
        const hx = Math.sin(root.rotation.y);
        const hz = Math.cos(root.rotation.y);
        const len = 1.6 * fly;
        for (let i = 0; i < N; i++) {
          const x = wrap(seeds[i * 3], root.position.x);
          const z = wrap(seeds[i * 3 + 2], root.position.z);
          const y = seeds[i * 3 + 1];
          streakPos.set([x, y, z, x - hx * len, y, z - hz * len], i * 6);
        }
        streakGeo.attributes.position.needsUpdate = true;
        streaks.material.opacity = fly * 0.4;
        streaks.material.color.copy(glow).lerp(new THREE.Color('#ffffff'), 0.5);
      }
      // the floor grid shows in the light-line form, and under the starship so the ground is seen passing
      const g = Math.max(forms.params.grid * 0.6, fly * 0.4);
      grid.visible = g > 0.01;
      grid.material.uniforms.uPower.value = g;
      grid.material.uniforms.uColor.value.copy(glow);
    },
  };
}
