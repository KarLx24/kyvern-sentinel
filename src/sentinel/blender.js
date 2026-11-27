// The Blender-built Sentinel (models/sentinel.glb, made by tools/build_sentinel.py).
//
// The file keeps Blender's joints as named nodes (pelvis, thigh_L, knee_L ...). This turns each
// joint into a rig part, so the Blender model gets everything the coded one has: click to open,
// teardown, forms, folding wings, walking and colour lines.
import * as THREE from 'three';
import { SECTIONS, attachWings } from './model.js';

const HEIGHT = 3.67; // how tall he stands on the page, crest to sole

// Blender material name -> paint role, so colour lines repaint him.
const ROLE = {
  'Armour black': 'armor', 'Armour gunmetal': 'armor2', 'Wing blade': 'armor2', 'Frame steel': 'frame',
  Bronze: 'trim', 'Marker red': 'mark', 'Seam cyan': 'glow', Core: 'core', 'Visor glass': 'visor',
};

// Joints in build order. `pivot` moves the joint to where the part really hinges (Blender units).
const CENTRE = [
  { id: 'pelvis', node: 'pelvis', label: 'Pelvis', section: 'torso', explode: [0, 0, 0], note: 'Hip block. Both legs and the waist hang from it.' },
  { id: 'abdomen', node: 'abdomen', parent: 'pelvis', label: 'Abdomen', section: 'torso', explode: [0, 0.26, 0], note: 'Waist joint with sliding plates.' },
  { id: 'chest', node: 'chest', parent: 'abdomen', label: 'Chest', section: 'torso', explode: [0, 0.3, 0], note: 'Rib cage, pectoral plates and the back pack.' },
  { id: 'core', node: 'core', parent: 'chest', label: 'Core', section: 'core', explode: [0, 0, 0.7], note: 'Reactor. Its light changes with what Kyvern is doing.' },
  { id: 'helm', node: 'helm', parent: 'chest', label: 'Helm', section: 'helm', explode: [0, 0.45, 0], note: 'Head. The visor follows whoever he is looking at.' },
];
const SIDE = [
  { id: 'shoulder', parent: 'chest', label: 'Shoulder', section: 'shoulders', explode: [0.5, 0.12, 0], note: 'Ball joint that carries the arm.' },
  { id: 'pauldron', parent: 'shoulder', label: 'Pauldron', section: 'shoulders', explode: [0.3, 0.32, 0], note: 'Shoulder armour over the joint.' },
  { id: 'upperarm', parent: 'shoulder', label: 'Upper arm', section: 'arms', explode: [0.12, -0.28, 0], note: 'Shells over the arm bone.' },
  { id: 'forearm', parent: 'upperarm', label: 'Forearm', section: 'arms', explode: [0.05, -0.3, 0], note: 'Elbow joint and gauntlet.' },
  { id: 'hand', parent: 'forearm', label: 'Hand', section: 'arms', explode: [0, -0.26, 0], note: 'Wrist and four-finger hand.' },
  { id: 'thigh', parent: 'pelvis', label: 'Thigh', section: 'legs', explode: [0.24, -0.34, 0], note: 'Hip joint in bronze, armour front and back.' },
  { id: 'knee', parent: 'thigh', label: 'Knee and shin', section: 'legs', explode: [0, -0.34, 0], note: 'Knee drum, shin shell with the bronze V, pistons behind.' },
  { id: 'boot', parent: 'knee', label: 'Boot', section: 'boots', explode: [0, -0.3, 0], note: 'Ankle, toe cap and heel.' },
  { id: 'wingdrive', parent: 'chest', label: 'Wing drive', section: 'wings', explode: [0.4, 0.35, -0.45], pivot: [0.26, 0.42, 0.42], note: 'Arm and bronze spar that carry the fan, with four rotors.' },
];
const MINOR = /^(bolt|marker|seam|housing lug|.* bolt|.* pin|.* light)$/i;
// the loader turns Blender's "Bolt.015" into "Bolt015"; drop the copy number either way
const base = (name) => name.replace(/[._]?\d{3}$/, '').replace(/_/g, ' ');

export async function loadBlenderSentinel(url) {
  const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
    import('three/addons/loaders/GLTFLoader.js'),
    import('three/addons/libs/meshopt_decoder.module.js'),
  ]);
  return new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url);
}

export function buildFromBlender(rig, mats, gltf) {
  for (const s of SECTIONS) rig.section(s);
  // Blender builds him at his own size; scale him to the page and put the hips where they land.
  const src = new THREE.Group();
  src.add(gltf.scene);
  src.scale.setScalar(HEIGHT / new THREE.Box3().setFromObject(gltf.scene).getSize(new THREE.Vector3()).y);
  src.updateMatrixWorld(true);
  rig.tilt.position.set(0, gltf.scene.getObjectByName('pelvis').getWorldPosition(new THREE.Vector3()).y, 0);
  rig.root.updateMatrixWorld(true);

  const nodes = {};
  gltf.scene.traverse((o) => (nodes[o.name] = o));
  const m4 = new THREE.Matrix4();
  const box = new THREE.Box3();
  const handles = { feathers: [], orbit: [], reactor: new THREE.Object3D() };

  // Make a rig part whose joint sits exactly where `world` says, whatever its parent is doing.
  const makePart = (def, world) => {
    const part = rig.part({ ...def, at: [0, 0, 0] });
    const holder = new THREE.Group();
    const into = part.pivot.parent;
    into.updateMatrixWorld(true);
    m4.copy(into.matrixWorld).invert().multiply(world).decompose(holder.position, holder.quaternion, holder.scale);
    into.add(holder);
    holder.add(part.pivot);
    holder.updateMatrixWorld(true);
    return part;
  };

  // Move a joint's meshes into the part as named pieces. Bolts, markers and seam lights
  // ride with the nearest plate so they never float off on their own.
  const fill = (part, meshes) => {
    const groups = new Map();
    const centre = (o, out) => box.setFromObject(o).getCenter(out);
    const majors = meshes.filter((o) => !MINOR.test(base(o.name)));
    for (const o of majors) {
      const name = base(o.name);
      if (!groups.has(name)) {
        const g = new THREE.Group();
        part.body.add(g);
        g.updateMatrixWorld(true);
        groups.set(name, g);
      }
    }
    const spots = majors.map((o) => ({ g: groups.get(base(o.name)), c: centre(o, new THREE.Vector3()) }));
    const c = new THREE.Vector3();
    for (const o of meshes) {
      let g = groups.get(base(o.name));
      if (!g) {
        centre(o, c);
        g = spots.reduce((best, s) => (s.c.distanceToSquared(c) < best.d ? { d: s.c.distanceToSquared(c), g: s.g } : best), { d: Infinity, g: null }).g;
      }
      const role = ROLE[o.material && o.material.name];
      if (role) o.material = mats[role];
      g.attach(o);
    }
    // each piece travels away from the middle of its part when the part is opened
    const mid = part.body.worldToLocal(box.setFromObject(part.body).getCenter(new THREE.Vector3()));
    for (const [name, g] of groups) {
      const dir = part.body.worldToLocal(centre(g, new THREE.Vector3())).sub(mid);
      const len = dir.length();
      part.add(name, g, len > 0.03 ? dir.multiplyScalar((0.22 + Math.min(0.2, len)) / len) : [0, 0, 0]);
    }
  };
  const meshesOf = (node) => node.children.filter((o) => o.isMesh);

  for (const def of CENTRE) fill(makePart(def, nodes[def.node].matrixWorld), meshesOf(nodes[def.node]));

  for (const side of ['l', 'r']) {
    const S = side.toUpperCase();
    for (const d of SIDE) {
      const node = nodes[`${d.id}_${S}`];
      const world = new THREE.Matrix4().copy(node.matrixWorld);
      if (d.pivot) world.multiply(m4.makeTranslation(d.pivot[0], d.pivot[2], -d.pivot[1])); // Blender xyz -> page x, z, -y
      const parent = CENTRE.some((c) => c.id === d.parent) ? d.parent : `${d.parent}_${side}`;
      fill(makePart({ ...d, id: `${d.id}_${side}`, label: `${d.label} ${S}`, parent }, world), meshesOf(node));
    }
    // the nine blades share one pivot at the rotor; each stays its own piece so it can fan
    const first = nodes[`blade_${S}_1`];
    const world = new THREE.Matrix4().copy(first.parent.matrixWorld).multiply(m4.makeTranslation(first.position.x, first.position.y, first.position.z));
    const blades = makePart({ id: `blades_${side}`, parent: `wingdrive_${side}`, label: `Wing blades ${S}`, section: 'wings', explode: [0.4, -0.08, -0.1], note: 'Nine blades on one pivot. Each has its own edge light.' }, world);
    const set = [];
    for (let i = 1; nodes[`blade_${S}_${i}`]; i++) {
      const blade = nodes[`blade_${S}_${i}`];
      blade.traverse((o) => {
        const role = o.isMesh && ROLE[o.material.name];
        if (role) o.material = mats[role];
      });
      blades.body.attach(blade);
      const a = blade.rotation.z;
      blades.add(`Blade ${i}`, blade, [Math.cos(a) * 0.45, Math.sin(a) * 0.45, -i * 0.025]);
      set.push(blade);
    }
    handles.feathers.push(set);
  }

  // The page spins the rings and pulses the reactor by setting their transform, and the file
  // keeps its own scale on each mesh, so each one gets a wrapper to animate instead.
  const wrap = (o) => {
    const g = new THREE.Group();
    g.position.copy(o.position);
    o.parent.add(g);
    o.position.set(0, 0, 0);
    g.add(o);
    return g;
  };
  const found = [];
  rig.root.traverse((o) => o.isMesh && /^(Orbit ring|Reactor$)/.test(o.name) && found.push(o));
  for (const o of found) {
    if (o.name === 'Reactor') handles.reactor = wrap(o);
    else handles.orbit.push(wrap(o));
  }
  handles.hip = rig.tilt.position.y;
  return attachWings(handles);
}

// The Blender model already stands in his pose, so "Sentinel" is the rest pose.
export function blenderForms(forms) {
  const pair = (name, v) => ({ [`${name}_l`]: v, [`${name}_r`]: v });
  return {
    ...forms,
    sentinel: { ...forms.sentinel, joints: {}, params: { ...forms.sentinel.params, fanTop: 10, fanBottom: -82 } },
    flight: { ...forms.flight, joints: { helm: [-58, 0, 0], abdomen: [-6, 0, 0], ...pair('shoulder', [34, 0, 6]), ...pair('forearm', [8, 0, 0]), ...pair('thigh', [10, 0, -4]), ...pair('boot', [60, 0, 0]), ...pair('wingdrive', [0, 0, -14]) } },
    aegis: { ...forms.aegis, joints: { helm: [10, 0, 0], abdomen: [4, 0, 0], ...pair('shoulder', [-22, 0, -2]), ...pair('forearm', [-84, 0, -22]), ...pair('thigh', [-4, 0, 3]), ...pair('knee', [10, 0, 0]), ...pair('boot', [-6, 0, -3]), ...pair('wingdrive', [0, 62, -8]) } },
  };
}
