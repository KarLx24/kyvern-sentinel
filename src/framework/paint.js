// Paint: one material per role (armour, frame, trim, glow ...) shared by the whole robot,
// and colour lines that repaint those roles. A change of line sweeps across the robot
// as a moving edge of light instead of snapping.
import * as THREE from 'three';

const SWEEP_TIME = 1.7;
const REACH = 3.4;

export class Paint {
  constructor(roles, lines, first) {
    this.lines = lines;
    this.current = first;
    this.mats = {};
    this.shared = {
      uSweep: { value: -99 },
      uSwOn: { value: 0 },
      uSwOrigin: { value: new THREE.Vector3(0, 1.9, 0) },
      uSwDir: { value: new THREE.Vector3(0.3, 1, 0.25).normalize() },
      uSwEdge: { value: new THREE.Color('#ffffff') },
    };
    this.t = 1;
    const line = lines.find((l) => l.id === first);
    for (const [role, base] of Object.entries(roles)) {
      const c = line.roles[role] || base.color || '#888888';
      const mat = new THREE.MeshStandardMaterial({
        color: base.glow ? '#000000' : c,
        emissive: base.glow ? c : '#000000',
        emissiveIntensity: base.glow || 1,
        roughness: base.rough ?? 0.5,
        metalness: base.metal ?? 0.5,
        envMapIntensity: base.env ?? 1,
        flatShading: !!base.flat,
      });
      mat.name = role;
      mat.userData.glow = !!base.glow;
      mat.userData.to = { uToColor: { value: mat.color.clone() }, uToEmissive: { value: mat.emissive.clone() } };
      this.patch(mat);
      this.mats[role] = mat;
    }
  }

  patch(mat) {
    const shared = this.shared;
    const to = mat.userData.to;
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, shared, to);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vSwp;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvSwp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          varying vec3 vSwp;
          uniform float uSweep; uniform float uSwOn; uniform vec3 uSwOrigin; uniform vec3 uSwDir; uniform vec3 uSwEdge;
          uniform vec3 uToColor; uniform vec3 uToEmissive;`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          float swS = dot(vSwp - uSwOrigin, uSwDir);
          float swK = 1.0 - smoothstep(uSweep - 0.03, uSweep + 0.03, swS);
          diffuseColor.rgb = mix(diffuseColor.rgb, uToColor, swK);`,
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          totalEmissiveRadiance = mix(totalEmissiveRadiance, uToEmissive * ${mat.emissiveIntensity.toFixed(2)}, swK);
          totalEmissiveRadiance += uSwEdge * exp(-abs(swS - uSweep) * 34.0) * uSwOn * 1.4;`,
        );
    };
  }

  line(id = this.current) {
    return this.lines.find((l) => l.id === id);
  }

  set(id, instant = false) {
    const line = this.line(id);
    if (!line || id === this.current) return false;
    this.finish(); // land any sweep still running
    this.current = id;
    for (const [role, mat] of Object.entries(this.mats)) {
      const c = line.roles[role];
      if (!c) continue;
      const to = mat.userData.to;
      if (mat.userData.glow) to.uToEmissive.value.set(c);
      else to.uToColor.value.set(c);
    }
    this.shared.uSwEdge.value.set(line.roles.glow);
    this.t = 0;
    if (instant) this.finish();
    return true;
  }

  finish() {
    for (const mat of Object.values(this.mats)) {
      mat.color.copy(mat.userData.to.uToColor.value);
      mat.emissive.copy(mat.userData.to.uToEmissive.value);
    }
    this.t = 1;
    this.shared.uSweep.value = -99;
    this.shared.uSwOn.value = 0;
  }

  update(dt, origin) {
    if (origin) this.shared.uSwOrigin.value.copy(origin);
    if (this.t >= 1) return;
    this.t = Math.min(1, this.t + dt / SWEEP_TIME);
    this.shared.uSweep.value = -REACH + 2 * REACH * this.t;
    this.shared.uSwOn.value = 1;
    if (this.t >= 1) this.finish();
  }
}
