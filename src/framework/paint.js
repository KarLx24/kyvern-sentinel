// Paint: one material per role (armour, frame, trim, glow ...) shared by the whole robot,
// and colour lines that repaint those roles. A change of line spreads the new colour
// slowly outward from the rim of the reactor as a ring of light instead of snapping.
import * as THREE from 'three';

const SWEEP_TIME = 5.5; // the colour spreads out slowly
const START = 0.19; // it starts at the rim of the reactor shell, not inside it
const REACH = 5.2; // how far from the core the colour has to travel

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
      uTime: { value: 0 },
      uGrid: { value: 0 }, // 0..1 the light-line look: armour goes dark, edges and contour lines light up
    };
    this.t = 1;
    this.spread = 0; // 0..1 while the colour is travelling
    const line = lines.find((l) => l.id === first);
    for (const [role, base] of Object.entries(roles)) {
      const c = line.roles[role] || base.color || '#888888';
      // armour is lacquered like car paint: a clear coat over the colour gives the long smooth highlights
      const mat = new (base.coat ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial)({
        ...(base.coat ? { clearcoat: base.coat, clearcoatRoughness: base.coatRough ?? 0.14 } : {}),
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
      mat.userData.wear = base.glow ? 0 : base.wear ?? 0;
      mat.userData.to = { uToColor: { value: mat.color.clone() }, uToEmissive: { value: mat.emissive.clone() } };
      this.patch(mat);
      this.mats[role] = mat;
    }
    // the light lines take the colour of the glow role, old and new, so they follow a colour sweep
    this.shared.uGlowA = { value: this.mats.glow.emissive };
    this.shared.uGlowB = { value: this.mats.glow.userData.to.uToEmissive.value };
  }

  patch(mat) {
    const shared = this.shared;
    const to = mat.userData.to;
    const wear = mat.userData.wear || 0;
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, shared, to);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vSwp;\nattribute vec3 aRest;\nvarying vec3 vRest;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvSwp = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvRest = aRest;');
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          varying vec3 vSwp;
          uniform float uSweep; uniform float uSwOn; uniform vec3 uSwOrigin; uniform vec3 uSwDir; uniform vec3 uSwEdge;
          uniform vec3 uToColor; uniform vec3 uToEmissive; uniform float uTime;
          uniform float uGrid; uniform vec3 uGlowA; uniform vec3 uGlowB; float gridGlow = 0.0;
          // Worn metal: grime, fine scratches and bare edges, drawn from where each point sat
          // in the rest pose (aRest) so the marks stay put when he moves.
          varying vec3 vRest;
          float wHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
          float wNoise(vec3 x) {
            vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
            return mix(mix(mix(wHash(i), wHash(i + vec3(1, 0, 0)), f.x), mix(wHash(i + vec3(0, 1, 0)), wHash(i + vec3(1, 1, 0)), f.x), f.y),
                       mix(mix(wHash(i + vec3(0, 0, 1)), wHash(i + vec3(1, 0, 1)), f.x), mix(wHash(i + vec3(0, 1, 1)), wHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
          }
          float wFbm(vec3 p) { return wNoise(p) * 0.5 + wNoise(p * 2.1) * 0.3 + wNoise(p * 4.3) * 0.2; }
          float wGrime = 0.5; float wBare = 0.0;`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          #ifdef USE_COLOR_ALPHA
            diffuseColor.a = opacity; // the model's colour alpha marks panel lines, it is not transparency
          #endif
          float swS = length(vSwp - uSwOrigin);
          float swK = 1.0 - smoothstep(uSweep - 0.03, uSweep + 0.03, swS);
          vec3 swTo = uToColor;
          #ifdef USE_COLOR
            swTo *= vColor.rgb; // keep the model's painted shading under the new colour
          #endif
          diffuseColor.rgb = mix(diffuseColor.rgb, swTo, swK);
          #if ${mat.userData.glow ? 0 : 1}
            if (uGrid > 0.001) {
              float gEdge = smoothstep(0.1, 0.55, length(fwidth(normalize(vNormal))) * 2.4);
              vec3 gp = abs(fract(vRest * vec3(2.5, 2.5, 3.5)) - 0.5);
              float gLine = smoothstep(0.482, 0.496, max(gp.x, gp.z));
              #ifdef USE_COLOR_ALPHA
                // the model has real panel lines: light those as circuits and leave only a faint edge glint
                gLine = smoothstep(0.3, 0.85, 1.0 - vColor.a);
                gridGlow = clamp(gLine + gEdge * 0.1, 0.0, 1.0) * uGrid;
              #else
                gridGlow = clamp(gEdge + gLine * 0.85, 0.0, 1.0) * uGrid;
              #endif
              diffuseColor.rgb *= mix(1.0, 0.07, uGrid);
            }
          #endif
          #if ${wear > 0 ? 1 : 0}
            wGrime = wFbm(vRest * 7.0);
            float wScr = smoothstep(0.7, 0.95, wNoise(vec3(vRest.x * 70.0 + vRest.y * 22.0, vRest.y * 5.0, vRest.z * 70.0)))
                       + smoothstep(0.76, 0.96, wNoise(vec3(vRest.x * 9.0, vRest.y * 80.0 - vRest.x * 30.0, vRest.z * 9.0 + 4.0)));
            float wEdge = smoothstep(0.25, 0.9, length(fwidth(normalize(vNormal))) * 3.2) * smoothstep(0.3, 0.75, wNoise(vRest * 23.0));
            wBare = clamp(wScr * 0.18 * smoothstep(0.35, 0.7, wGrime) + wEdge * 0.85, 0.0, 1.0) * ${wear.toFixed(2)};
            vec3 wMetal = mix(vec3(0.5, 0.52, 0.55), diffuseColor.rgb * 3.0 + 0.12, 0.5);
            diffuseColor.rgb *= mix(1.0, 0.62 + 0.7 * wGrime, ${wear.toFixed(2)});
            diffuseColor.rgb = mix(diffuseColor.rgb, wMetal, wBare);
          #endif`,
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
          roughnessFactor = clamp(roughnessFactor + (wGrime - 0.5) * 0.4 * ${wear.toFixed(2)} - wBare * 0.2, 0.08, 1.0);`,
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          totalEmissiveRadiance = mix(totalEmissiveRadiance, uToEmissive * ${mat.emissiveIntensity.toFixed(2)}, swK);
          // lights breathe: a soft pulse travels out from the core along every lit line
          totalEmissiveRadiance *= ${mat.userData.glow ? '0.7 + 0.55 * pow(0.5 + 0.5 * sin(swS * 2.4 - uTime * 2.6), 3.0)' : '1.0'};
          totalEmissiveRadiance += mix(uGlowA, uGlowB, swK) * gridGlow * (1.1 + 0.9 * pow(0.5 + 0.5 * sin(swS * 2.4 - uTime * 2.6), 3.0));
          totalEmissiveRadiance += uSwEdge * exp(-abs(swS - uSweep) * 22.0) * uSwOn * 1.8;`,
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
    this.spread = 0;
    this.shared.uSweep.value = -99;
    this.shared.uSwOn.value = 0;
  }

  update(dt, origin) {
    if (origin) this.shared.uSwOrigin.value.copy(origin);
    this.shared.uTime.value += dt;
    if (this.t >= 1) return;
    this.t = Math.min(1, this.t + dt / SWEEP_TIME);
    this.spread = this.t;
    this.shared.uSweep.value = START + (REACH - START) * this.t; // steady pace, so it never rushes
    this.shared.uSwOn.value = 1;
    if (this.t >= 1) this.finish();
  }
}
