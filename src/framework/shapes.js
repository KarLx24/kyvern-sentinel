// Shapes: small helpers for hard-surface parts. Everything is flat-faced on purpose,
// so plates read as cut metal instead of soft blobs.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const D = Math.PI / 180;

export function mesh(geo, mat, pos, rot, scale) {
  const m = new THREE.Mesh(geo, mat);
  if (pos) m.position.set(pos[0], pos[1], pos[2]);
  if (rot) m.rotation.set(rot[0] * D, rot[1] * D, rot[2] * D);
  if (scale) m.scale.set(scale[0], scale[1], scale[2]);
  return m;
}

export function group(children, pos, rot) {
  const g = new THREE.Group();
  for (const c of children) if (c) g.add(c);
  if (pos) g.position.set(pos[0], pos[1], pos[2]);
  if (rot) g.rotation.set(rot[0] * D, rot[1] * D, rot[2] * D);
  return g;
}

// Box with a small chamfer.
export function box(w, h, d, r = 0.012) {
  return new RoundedBoxGeometry(w, h, d, 1, Math.min(r, w / 2.01, h / 2.01, d / 2.01));
}

// Cylinder along 'x', 'y' or 'z'. r can be [top, bottom] for a cone.
export function disc(r, len, axis = 'y', seg = 28) {
  const [r0, r1] = Array.isArray(r) ? r : [r, r];
  const g = new THREE.CylinderGeometry(r0, r1, len, seg);
  if (axis === 'x') g.rotateZ(Math.PI / 2);
  if (axis === 'z') g.rotateX(Math.PI / 2);
  return g;
}

export function ring(R, r, axis = 'z', arc = Math.PI * 2) {
  const g = new THREE.TorusGeometry(R, r, 10, 48, arc);
  if (axis === 'x') g.rotateY(Math.PI / 2);
  if (axis === 'y') g.rotateX(Math.PI / 2);
  return g;
}

// A flat plate cut from an outline in the XY plane, with a bevelled edge. Centred on z.
export function plate(pts, depth, bevel = 0.012) {
  const s = new THREE.Shape();
  pts.forEach((p, i) => (i ? s.lineTo(p[0], p[1]) : s.moveTo(p[0], p[1])));
  s.closePath();
  const inner = Math.max(0.001, depth - bevel * 2);
  const g = new THREE.ExtrudeGeometry(s, { depth: inner, steps: 1, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 1 });
  g.translate(0, 0, -inner / 2);
  return g;
}

// A faceted limb section: chamfered rectangles stacked along y and skinned with flat faces.
// sections: [{ y, w, d, c (chamfer), x, z }]
export function loft(sections) {
  const rings = sections.map((s) => {
    const w = s.w / 2;
    const d = s.d / 2;
    const c = Math.min(s.c ?? 0.04, w * 0.95, d * 0.95);
    const x = s.x || 0;
    const z = s.z || 0;
    return [
      [w - c, d], [w, d - c], [w, -d + c], [w - c, -d],
      [-w + c, -d], [-w, -d + c], [-w, d - c], [-w + c, d],
    ].map(([px, pz]) => new THREE.Vector3(px + x, s.y, pz + z));
  });
  const out = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const n = new THREE.Vector3();
  const tri = (p, q, r, outward) => {
    n.crossVectors(a.subVectors(q, p), b.subVectors(r, p));
    if (n.dot(outward) < 0) out.push(p, r, q);
    else out.push(p, q, r);
  };
  const centre = (ring) => ring.reduce((s, p) => s.add(p), new THREE.Vector3()).multiplyScalar(1 / ring.length);
  for (let i = 0; i < rings.length - 1; i++) {
    const lo = rings[i];
    const hi = rings[i + 1];
    const mid = centre(lo).add(centre(hi)).multiplyScalar(0.5);
    for (let k = 0; k < 8; k++) {
      const k2 = (k + 1) % 8;
      const face = new THREE.Vector3().add(lo[k]).add(lo[k2]).add(hi[k]).add(hi[k2]).multiplyScalar(0.25).sub(mid);
      face.y = 0;
      tri(lo[k], lo[k2], hi[k2], face);
      tri(lo[k], hi[k2], hi[k], face);
    }
  }
  const cap = (ring, dir) => {
    const c = centre(ring);
    const o = new THREE.Vector3(0, dir, 0);
    for (let k = 0; k < 8; k++) tri(c, ring[k], ring[(k + 1) % 8], o);
  };
  const up = Math.sign(sections[sections.length - 1].y - sections[0].y) || 1;
  cap(rings[0], -up);
  cap(rings[rings.length - 1], up);
  const g = new THREE.BufferGeometry().setFromPoints(out);
  g.computeVertexNormals();
  return g;
}

// A bar from point a to point b (w wide across, d deep in z before rotation).
export function beam(a, b, w, d, mat) {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const len = va.distanceTo(vb);
  const m = new THREE.Mesh(box(len, w, d, Math.min(w, d) * 0.2), mat);
  m.position.copy(va).add(vb).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), vb.sub(va).normalize());
  return m;
}
