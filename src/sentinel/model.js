// Kyvern Sentinel SN-01, built part by part from the locked design:
// black armour, bronze joints, cyan seams, small red markers, and a pair of bladed wings.
//
// Every part is its own joint (hip, knee, ankle ...) and every part is made of named pieces,
// so opening a part shows what it is made of. Left and right are built once and mirrored.
import * as THREE from 'three';
import { mesh, group, box, disc, ring, plate, loft, beam } from '../framework/shapes.js';

export const SECTIONS = [
  { id: 'helm', label: 'Helm', lines: ['Visor and optics', 'Neck servo, 2 axes'], view: [0.45, 0.16] },
  { id: 'core', label: 'Core', lines: ['Reactor and orbit rings', 'Feeds every seam light'], view: [0.2, 0.08] },
  { id: 'torso', label: 'Torso', lines: ['Chest, abdomen, pelvis', 'Back unit and thrusters'], view: [-0.6, 0.12] },
  { id: 'shoulders', label: 'Shoulders', lines: ['Pauldron over a ball joint', 'Carries the wing load'], view: [0.75, 0.2] },
  { id: 'arms', label: 'Arms', lines: ['Upper arm, forearm, hand', 'Elbow and wrist in bronze'], view: [0.9, 0.08] },
  { id: 'legs', label: 'Legs', lines: ['Thigh, knee, shin', 'Split at each joint'], view: [0.55, -0.02] },
  { id: 'boots', label: 'Boots', lines: ['Ankle, toe cap, heel', 'Sole thrusters'], view: [0.7, -0.04] },
  { id: 'wings', label: 'Wings', lines: ['Wing drive and 9 blades a side', 'Fan opens and folds'], view: [2.6, 0.18] },
];

const BLADES = 9;
const WRIST = [0.84, 0.58, -0.1];

export function buildSentinel(rig, m) {
  const { armor: A, armor2: A2, frame: F, trim: T, glow: G, mark: R, core: CORE, thrust: TH, visor: V, edge: E } = m;
  for (const s of SECTIONS) rig.section(s);
  const handles = { feathers: [], orbit: [], reactor: null };

  // a strip of light between two points on a plate face
  const seam = (a, b, z, thick = 0.014) => beam([a[0], a[1], z], [b[0], b[1], z], thick, 0.012, G);
  const marker = (pos, w = 0.09, h = 0.028, rot) => mesh(box(w, h, 0.012, 0.003), R, pos, rot);

  // ---- pelvis ---------------------------------------------------------------------------
  rig.tilt.position.set(0, 1.98, 0);
  const pelvis = rig.part({ id: 'pelvis', label: 'Pelvis', section: 'torso', at: [0, 0, 0], explode: [0, 0, 0], note: 'Hip block. Both legs and the waist hang from it.' });
  pelvis.add('Hip block', group([mesh(box(0.5, 0.22, 0.3, 0.03), F, [0, -0.02, 0]), mesh(disc(0.07, 0.6, 'x'), F, [0, -0.05, 0])]));
  pelvis.add('Codpiece', mesh(plate([[-0.13, 0.1], [0.13, 0.1], [0.17, -0.02], [0.07, -0.3], [-0.07, -0.3], [-0.17, -0.02]], 0.14, 0.02), A, [0, -0.02, 0.13], [-6, 0, 0]), [0, -0.1, 0.5]);
  for (const s of [1, -1]) {
    pelvis.add(`Belt plate ${s > 0 ? 'L' : 'R'}`, mesh(box(0.17, 0.2, 0.3, 0.025), A2, [s * 0.26, 0.0, 0.02], [0, 0, s * -14]), [s * 0.4, 0.05, 0.12]);
  }
  pelvis.add('Tail plate', mesh(plate([[-0.13, 0.1], [0.13, 0.1], [0.15, -0.02], [0.06, -0.22], [-0.06, -0.22], [-0.15, -0.02]], 0.1, 0.02), A2, [0, -0.02, -0.15], [6, 0, 0]), [0, -0.05, -0.5]);
  pelvis.add('Waist ring', mesh(disc(0.2, 0.05), T, [0, 0.1, 0]), [0, 0.2, 0]);

  // ---- abdomen --------------------------------------------------------------------------
  const abdomen = rig.part({ id: 'abdomen', label: 'Abdomen', section: 'torso', parent: 'pelvis', at: [0, 0.12, 0], explode: [0, 0.26, 0], note: 'Waist joint. Three plates slide over each other when he bends.' });
  abdomen.add('Spine column', group([mesh(disc(0.11, 0.44), F, [0, 0.21, 0]), mesh(ring(0.115, 0.012, 'y'), T, [0, 0.12, 0]), mesh(ring(0.115, 0.012, 'y'), T, [0, 0.3, 0])]));
  const ab = (w) => [[-w, 0.058], [w, 0.058], [w + 0.025, 0], [w - 0.03, -0.058], [-w + 0.03, -0.058], [-w - 0.025, 0]];
  [['Upper ab plate', 0.18, 0.34, A], ['Mid ab plate', 0.155, 0.215, A2], ['Lower ab plate', 0.13, 0.09, A]].forEach(([name, w, y, mat], i) => {
    const g = group([mesh(plate(ab(w), 0.12, 0.018), mat)], [0, y, 0.15], [-4, 0, 0]);
    abdomen.add(name, g, [0, 0, 0.35 + i * 0.16]);
  });
  for (const s of [1, -1]) {
    abdomen.add(`Flank ${s > 0 ? 'L' : 'R'}`, mesh(loft([{ y: 0.02, w: 0.1, d: 0.24, c: 0.03 }, { y: 0.4, w: 0.14, d: 0.3, c: 0.04 }]), A2, [s * 0.2, 0, 0]), [s * 0.36, 0, 0]);
  }
  abdomen.add('Hydraulics', group([-1, 1].map((s) => group([mesh(disc(0.022, 0.4), T), mesh(disc(0.034, 0.16), F, [0, -0.1, 0])], [s * 0.1, 0.21, -0.13], [0, 0, s * 8]))), [0, 0, -0.4]);

  // ---- chest ----------------------------------------------------------------------------
  const chest = rig.part({ id: 'chest', label: 'Chest', section: 'torso', parent: 'abdomen', at: [0, 0.42, 0], explode: [0, 0.3, 0], note: 'Rib cage with two pectoral plates. The core sits in the middle.' });
  chest.add('Rib cage', mesh(loft([{ y: 0, w: 0.42, d: 0.3, c: 0.06 }, { y: 0.36, w: 0.86, d: 0.42, c: 0.1 }, { y: 0.68, w: 0.74, d: 0.36, c: 0.1 }]), F));
  const pec = [[0.04, 0.68], [0.5, 0.72], [0.69, 0.52], [0.62, 0.28], [0.36, 0.08], [0.2, 0.1], [0.27, 0.3], [0.17, 0.5], [0.04, 0.54]];
  for (const s of [1, -1]) {
    const g = group([
      mesh(plate(pec, 0.15, 0.025), A),
      marker([0.52, 0.56, 0.078], 0.08, 0.024, [0, 0, -40]),
    ], [0, 0, 0.22], [-7, 12, 0]);
    const side = group([g]);
    side.scale.x = s;
    chest.add(`Pectoral ${s > 0 ? 'L' : 'R'}`, side, [s * 0.38, 0.1, 0.5]);
  }
  chest.add('Sternum', group([mesh(plate([[-0.075, 0.72], [0.075, 0.72], [0.05, 0.55], [-0.05, 0.55]], 0.16, 0.02), A2)], [0, 0, 0.23], [-7, 0, 0]), [0, 0.3, 0.55]);
  for (const s of [1, -1]) {
    chest.add(`Collar ${s > 0 ? 'L' : 'R'}`, mesh(box(0.24, 0.1, 0.3, 0.03), A2, [s * 0.22, 0.73, -0.02], [0, 0, s * -18]), [s * 0.2, 0.4, 0]);
    chest.add(`Side intake ${s > 0 ? 'L' : 'R'}`, group([mesh(box(0.12, 0.3, 0.3, 0.03), A2), marker([s * 0.062, 0.05, 0.06], 0.012, 0.03, [0, 90, 0])], [s * 0.36, 0.18, 0], [0, 0, s * 12]), [s * 0.42, -0.1, 0]);
  }
  chest.add('Shoulder yoke', group([mesh(disc(0.085, 1.42, 'x'), F), mesh(disc(0.1, 0.05, 'x'), T, [0.6, 0, 0]), mesh(disc(0.1, 0.05, 'x'), T, [-0.6, 0, 0])], [0, 0.5, 0]), [0, 0.42, -0.25]);
  chest.add('Back plate', mesh(plate([[-0.4, 0.66], [0.4, 0.66], [0.3, 0.04], [-0.3, 0.04]], 0.1, 0.02), A, [0, 0, -0.21], [5, 0, 0]), [0, 0, -0.5]);

  // ---- core -----------------------------------------------------------------------------
  const core = rig.part({ id: 'core', label: 'Core', section: 'core', parent: 'chest', at: [0, 0.3, 0.23], explode: [0, 0, 0.75], note: 'Reactor. Its light changes with what Kyvern is doing.' });
  core.add('Reactor seat', mesh(disc(0.21, 0.08, 'z', 40), F, [0, 0, 0]));
  core.add('Emitter seam', mesh(ring(0.2, 0.009), G, [0, 0, 0.045]), [0, 0, 0.14]);
  core.add('Housing ring', group([mesh(ring(0.165, 0.03), T), ...[0, 1, 2, 3, 4, 5].map((i) => mesh(box(0.03, 0.05, 0.03, 0.005), F, [Math.cos(i * 1.047) * 0.165, Math.sin(i * 1.047) * 0.165, 0.02], [0, 0, i * 60]))], [0, 0, 0.07]), [0, 0, 0.3]);
  handles.reactor = mesh(new THREE.IcosahedronGeometry(0.075, 3), CORE, [0, 0, 0.08]);
  core.add('Reactor', handles.reactor, [0, 0, 0.5]);
  const rings = group([], [0, 0, 0.08]);
  for (let i = 0; i < 3; i++) {
    const r = mesh(ring(0.105 + i * 0.012, 0.005), T, null, [i * 55 + 20, i * 70, 0]);
    handles.orbit.push(r);
    rings.add(r);
  }
  core.add('Orbit rings', rings, [0, 0, 0.72]);

  // ---- back unit ------------------------------------------------------------------------
  const back = rig.part({ id: 'backunit', label: 'Back unit', section: 'torso', parent: 'chest', at: [0, 0.34, -0.27], explode: [0, 0.05, -0.8], note: 'Thruster pack. The wing drives bolt onto its rail.' });
  back.add('Pack shell', mesh(loft([{ y: -0.22, w: 0.4, d: 0.16, c: 0.05 }, { y: 0.1, w: 0.52, d: 0.22, c: 0.06 }, { y: 0.28, w: 0.42, d: 0.16, c: 0.05 }]), A2, [0, 0, -0.08]), [0, 0, -0.2]);
  for (const s of [1, -1]) {
    back.add(`Thruster ${s > 0 ? 'L' : 'R'}`, group([mesh(disc([0.07, 0.105], 0.26), T), mesh(disc(0.075, 0.2), F, [0, 0.06, 0]), mesh(disc(0.085, 0.012), TH, [0, -0.126, 0])], [s * 0.15, -0.22, -0.14], [-28, 0, s * -8]), [s * 0.22, -0.32, -0.3]);
  }
  back.add('Wing rail', group([mesh(box(0.86, 0.08, 0.1, 0.02), F), mesh(disc(0.06, 0.12, 'z'), T, [0.36, 0, 0]), mesh(disc(0.06, 0.12, 'z'), T, [-0.36, 0, 0])], [0, 0.16, -0.06]), [0, 0.35, -0.1]);
  back.add('Cooling fins', group([-1.5, -0.5, 0.5, 1.5].map((i) => mesh(box(0.025, 0.3, 0.09, 0.008), A, [i * 0.07, 0.02, 0])), [0, 0, -0.2]), [0, 0, -0.5]);

  // ---- helm -----------------------------------------------------------------------------
  const helm = rig.part({ id: 'helm', label: 'Helm', section: 'helm', parent: 'chest', at: [0, 0.74, 0], explode: [0, 0.45, 0], note: 'Head. The visor follows whoever he is looking at.' });
  helm.add('Neck servo', group([mesh(disc(0.085, 0.14), F, [0, 0.04, 0]), mesh(ring(0.09, 0.012, 'y'), T, [0, 0.06, 0])]), [0, -0.12, 0]);
  helm.add('Skull frame', mesh(loft([{ y: 0.1, w: 0.24, d: 0.28, c: 0.06 }, { y: 0.42, w: 0.24, d: 0.28, c: 0.08 }]), F));
  helm.add('Crown shell', mesh(loft([{ y: 0.21, w: 0.34, d: 0.36, c: 0.09, z: -0.03 }, { y: 0.37, w: 0.36, d: 0.4, c: 0.12, z: -0.03 }, { y: 0.48, w: 0.28, d: 0.32, c: 0.11, z: -0.04 }, { y: 0.525, w: 0.14, d: 0.18, c: 0.05, z: -0.05 }]), A), [0, 0.42, -0.1]);
  helm.add('Faceplate', mesh(plate([[-0.14, 0.3], [0.14, 0.3], [0.155, 0.2], [0.075, 0.06], [-0.075, 0.06], [-0.155, 0.2]], 0.1, 0.02), A2, [0, 0, 0.165], [-4, 0, 0]), [0, -0.06, 0.4]);
  helm.add('Visor', group([beam([0, 0.218, 0], [0.125, 0.256, 0], 0.024, 0.014, G), beam([0, 0.218, 0], [-0.125, 0.256, 0], 0.024, 0.014, G), mesh(plate([[-0.13, 0.275], [0.13, 0.275], [0.12, 0.215], [0, 0.185], [-0.12, 0.215]], 0.012, 0), V, [0, 0, -0.008])], [0, 0, 0.222]), [0, 0, 0.7]);
  helm.add('Crest', group([mesh(plate([[-0.14, 0], [0.12, 0], [0.15, 0.09], [0.02, 0.15]], 0.045, 0.01), A, null, [0, -90, 0]), mesh(box(0.026, 0.05, 0.01, 0.003), G, [0, 0.066, 0.143], [-34, 0, 0])], [0, 0.4, 0.05]), [0, 0.35, 0.3]);
  for (const s of [1, -1]) {
    helm.add(`Cheek guard ${s > 0 ? 'L' : 'R'}`, mesh(plate([[-0.14, 0.14], [0.12, 0.12], [0.14, -0.02], [0.04, -0.12], [-0.12, -0.06]], 0.05, 0.012), A, [s * 0.175, 0.2, 0.02], [0, -90, s * -6]), [s * 0.35, 0, 0]);
  }

  // ---- arms (built once per side, mirrored) -----------------------------------------------
  const halfLoft = (secs, x) => loft(secs.map((s) => ({ ...s, x })));
  for (const side of ['l', 'r']) {
    const mirror = side === 'r';
    const S = side.toUpperCase();

    const shoulder = rig.part({ id: `shoulder_${side}`, label: `Shoulder ${S}`, section: 'shoulders', parent: 'chest', mirror, at: [0.74, 0.5, 0], explode: [0.6, 0.18, 0], note: 'Ball joint under a pauldron.' });
    shoulder.add('Shoulder joint', group([mesh(new THREE.SphereGeometry(0.13, 24, 16), F), mesh(disc(0.14, 0.06, 'x'), T, [-0.09, 0, 0])]));
    shoulder.add('Pauldron', group([
      mesh(plate([[-0.2, 0.04], [-0.14, 0.27], [0.3, 0.3], [0.47, 0.1], [0.43, -0.13], [-0.06, -0.17]], 0.46, 0.035), A),
      marker([0.27, 0.06, 0.232], 0.1, 0.03, [0, 0, -8]),
    ]), [0.4, 0.3, 0]);
    shoulder.add('Pauldron liner', mesh(box(0.36, 0.07, 0.36, 0.02), A2, [0.2, -0.16, 0], [0, 0, 4]), [0.2, -0.2, 0]);

    const upper = rig.part({ id: `upperarm_${side}`, label: `Upper arm ${S}`, section: 'arms', parent: `shoulder_${side}`, at: [0.1, -0.1, 0], explode: [0.12, -0.28, 0], note: 'Two half shells over the arm bone.' });
    upper.add('Humerus', mesh(disc(0.07, 0.56), F, [0, -0.3, 0]));
    const bicep = [{ y: -0.06, w: 0.125, d: 0.26, c: 0.045 }, { y: -0.3, w: 0.14, d: 0.31, c: 0.055 }, { y: -0.52, w: 0.115, d: 0.24, c: 0.045 }];
    upper.add('Outer shell', group([mesh(halfLoft(bicep, 0.066), A), marker([0.138, -0.2, 0.05], 0.012, 0.03, [0, 90, 0])]), [0.3, 0, 0]);
    upper.add('Inner shell', mesh(halfLoft(bicep, -0.066), A2), [-0.25, 0, 0]);
    upper.add('Arm actuator', group([mesh(disc(0.022, 0.42), T), mesh(disc(0.035, 0.2), F, [0, 0.1, 0])], [0, -0.3, -0.15]), [0, 0, -0.3]);

    const fore = rig.part({ id: `forearm_${side}`, label: `Forearm ${S}`, section: 'arms', parent: `upperarm_${side}`, at: [0, -0.6, 0], explode: [0.05, -0.3, 0], note: 'Elbow joint and gauntlet.' });
    fore.add('Elbow joint', group([mesh(disc(0.11, 0.25, 'x'), T), mesh(disc(0.065, 0.29, 'x'), F), mesh(disc(0.03, 0.31, 'x', 6), T)]), [0, 0.08, -0.25]);
    fore.add('Radius frame', mesh(disc(0.06, 0.5), F, [0, -0.33, 0]));
    const gaunt = [{ y: -0.12, w: 0.13, d: 0.24, c: 0.05 }, { y: -0.36, w: 0.17, d: 0.33, c: 0.06 }, { y: -0.6, w: 0.14, d: 0.27, c: 0.05 }];
    fore.add('Gauntlet outer', group([mesh(halfLoft(gaunt, 0.066), A), marker([0.152, -0.2, -0.04], 0.012, 0.03, [0, 90, 0])]), [0.32, 0, 0]);
    fore.add('Gauntlet inner', mesh(halfLoft(gaunt, -0.066), A2), [-0.28, 0, 0]);
    fore.add('Gauntlet fin', mesh(plate([[0, 0.14], [0.1, 0.04], [0.08, -0.16], [0, -0.14]], 0.05, 0.012), A, [0, -0.36, -0.15], [0, 90, 0]), [0, 0, -0.3]);

    const hand = rig.part({ id: `hand_${side}`, label: `Hand ${S}`, section: 'arms', parent: `forearm_${side}`, at: [0, -0.62, 0], explode: [0, -0.26, 0], note: 'Wrist and four-finger hand.' });
    hand.add('Wrist joint', group([mesh(disc(0.07, 0.06), T), mesh(disc(0.05, 0.1), F)]), [0, 0.12, 0]);
    hand.add('Palm', mesh(box(0.16, 0.14, 0.1, 0.02), A2, [0, -0.11, 0]));
    hand.add('Knuckle guard', mesh(box(0.19, 0.07, 0.07, 0.015), A, [0, -0.11, 0.075]), [0, 0, 0.25]);
    hand.add('Fingers', group([-0.063, -0.021, 0.021, 0.063].map((x) => group([mesh(box(0.036, 0.1, 0.085, 0.01), F, [0, -0.045, 0]), mesh(new THREE.SphereGeometry(0.02, 10, 8), T, [0, 0.005, 0.03])], [x, -0.185, 0.03]))), [0, -0.25, 0.05]);
    hand.add('Thumb', mesh(box(0.045, 0.1, 0.05, 0.012), F, [-0.09, -0.15, 0.06], [0, 0, -14]), [-0.22, 0, 0.1]);

    // ---- legs ---------------------------------------------------------------------------
    const thigh = rig.part({ id: `thigh_${side}`, label: `Thigh ${S}`, section: 'legs', parent: 'pelvis', mirror, at: [0.33, -0.05, 0], explode: [0.24, -0.34, 0], note: 'Hip joint in bronze, armour front and back.' });
    thigh.add('Hip joint', group([mesh(disc(0.16, 0.13, 'x', 36), T), mesh(disc(0.1, 0.2, 'x'), F), mesh(disc(0.045, 0.23, 'x', 6), T)], [0.03, 0, 0]), [0.32, 0.1, 0]);
    thigh.add('Femur', mesh(disc(0.08, 0.7), F, [0, -0.43, 0]));
    const th = (z, k) => [{ y: -0.12, w: 0.3 * k, d: 0.17, c: 0.06, z }, { y: -0.42, w: 0.35 * k, d: 0.21, c: 0.07, z: z * 1.1 }, { y: -0.77, w: 0.25 * k, d: 0.15, c: 0.05, z: z * 0.85 }];
    thigh.add('Thigh shell, front', group([mesh(loft(th(0.09, 1)), A), marker([0.05, -0.22, 0.186], 0.1, 0.03, [0, 0, -10])]), [0, 0, 0.4]);
    thigh.add('Thigh shell, rear', mesh(loft(th(-0.09, 0.94)), A2), [0, 0, -0.4]);
    thigh.add('Thigh actuator', group([mesh(disc(0.024, 0.44), T), mesh(disc(0.038, 0.2), F, [0, 0.1, 0])], [0.19, -0.42, -0.02], [0, 0, -3]), [0.3, 0, 0]);

    const knee = rig.part({ id: `knee_${side}`, label: `Knee ${S}`, section: 'legs', parent: `thigh_${side}`, at: [0, -0.85, 0], explode: [0, -0.26, 0], note: 'Single-axis joint with a cap.' });
    knee.add('Knee joint', group([mesh(disc(0.125, 0.3, 'x', 36), T), mesh(disc(0.075, 0.34, 'x'), F), mesh(disc(0.035, 0.36, 'x', 6), T)]));
    knee.add('Knee cap', mesh(plate([[-0.11, 0.11], [0.11, 0.11], [0.135, -0.03], [0, -0.17], [-0.135, -0.03]], 0.06, 0.016), A, [0, 0, 0.15], [-8, 0, 0]), [0, 0.04, 0.4]);

    const shin = rig.part({ id: `shin_${side}`, label: `Shin ${S}`, section: 'legs', parent: `knee_${side}`, at: [0, 0, 0], explode: [0, -0.24, 0], note: 'Shin shell with the bronze V, calf shell behind.' });
    shin.add('Tibia', mesh(disc(0.07, 0.68), F, [0, -0.44, 0]));
    shin.add('Shin shell', group([
      mesh(loft([{ y: -0.14, w: 0.26, d: 0.15, c: 0.05, z: 0.085 }, { y: -0.42, w: 0.33, d: 0.2, c: 0.07, z: 0.09 }, { y: -0.76, w: 0.24, d: 0.16, c: 0.05, z: 0.08 }]), A),
      mesh(box(0.07, 0.014, 0.012, 0.004), G, [0, -0.62, 0.178]),
      marker([0, -0.69, 0.17], 0.03, 0.05),
    ]), [0, 0, 0.4]);
    shin.add('Shin V-trim', group([beam([0.135, -0.2, 0], [0, -0.52, 0.012], 0.034, 0.02, T), beam([-0.135, -0.2, 0], [0, -0.52, 0.012], 0.034, 0.02, T)], [0, 0, 0.18]), [0, 0, 0.66]);
    shin.add('Calf shell', mesh(loft([{ y: -0.12, w: 0.24, d: 0.16, c: 0.05, z: -0.085 }, { y: -0.38, w: 0.33, d: 0.25, c: 0.08, z: -0.11 }, { y: -0.76, w: 0.22, d: 0.15, c: 0.05, z: -0.08 }]), A2), [0, 0, -0.4]);

    const boot = rig.part({ id: `boot_${side}`, label: `Boot ${S}`, section: 'boots', parent: `shin_${side}`, at: [0, -0.8, 0], explode: [0, -0.26, 0], note: 'Ankle, toe cap, heel block and a thruster in the sole.' });
    boot.add('Ankle joint', group([mesh(disc(0.095, 0.27, 'x', 30), T), mesh(disc(0.055, 0.3, 'x'), F)]), [0, 0.1, -0.2]);
    boot.add('Foot frame', mesh(box(0.16, 0.1, 0.4, 0.02), F, [0, -0.16, 0.06]));
    boot.add('Toe cap', mesh(plate([[-0.04, 0.01], [0.15, -0.03], [0.37, -0.15], [0.42, -0.25], [-0.04, -0.25]], 0.28, 0.025), A, [0, 0, 0], [0, -90, 0]), [0, 0.05, 0.36]);
    boot.add('Heel block', mesh(loft([{ y: -0.25, w: 0.24, d: 0.2, c: 0.05 }, { y: -0.04, w: 0.2, d: 0.16, c: 0.05, z: 0.02 }]), A2, [0, 0, -0.13]), [0, 0, -0.32]);
    boot.add('Sole', group([mesh(box(0.29, 0.035, 0.6, 0.012), F, [0, -0.262, 0.11]), mesh(disc(0.07, 0.012), TH, [0, -0.282, -0.1]), mesh(disc(0.05, 0.012), TH, [0, -0.282, 0.22])]), [0, -0.2, 0]);

    // ---- wings --------------------------------------------------------------------------
    const drive = rig.part({ id: `wingdrive_${side}`, label: `Wing drive ${S}`, section: 'wings', parent: 'chest', mirror, at: [0.26, 0.48, -0.34], explode: [0.45, 0.4, -0.5], note: 'Arm that carries the fan, with three bronze rotors.' });
    drive.add('Wing mount', group([mesh(box(0.16, 0.16, 0.16, 0.03), F), mesh(disc(0.07, 0.2, 'z'), T)]));
    drive.add('Wing arm', group([beam([0, 0, 0], WRIST, 0.11, 0.1, A), beam([0.18, 0.2, -0.02], [WRIST[0] - 0.06, WRIST[1] + 0.07, WRIST[2] + 0.0], 0.07, 0.13, T)]), [0, 0.25, -0.2]);
    drive.add('Rotor cluster', group([
      mesh(disc(0.14, 0.12, 'z', 36), T), mesh(disc(0.085, 0.15, 'z'), F), mesh(disc(0.04, 0.17, 'z', 6), T),
      mesh(disc(0.085, 0.1, 'z'), T, [-0.2, -0.1, 0]), mesh(disc(0.045, 0.13, 'z'), F, [-0.2, -0.1, 0]),
      mesh(disc(0.075, 0.1, 'z'), T, [0.0, -0.23, 0]), mesh(disc(0.04, 0.13, 'z'), F, [0.0, -0.23, 0]),
    ], WRIST), [0.25, 0.3, 0.25]);

    const blades = rig.part({ id: `blades_${side}`, label: `Wing blades ${S}`, section: 'wings', parent: `wingdrive_${side}`, at: WRIST, explode: [0.45, -0.1, -0.1], note: 'Nine blades on one pivot. Each has its own seam light.' });
    const feathers = [];
    for (let i = 0; i < BLADES; i++) {
      const k = i / (BLADES - 1);
      const L = 1.45 + k * 1.15;
      const w = 0.1 + k * 0.03;
      const blade = group([
        mesh(plate([[0, -w * 0.5], [L * 0.3, -w], [L * 0.82, -w * 0.8], [L, 0.01], [L * 0.8, w * 0.42], [0, w * 0.5]], 0.03, 0.008), i % 2 ? A2 : A),
        mesh(plate([[0.04, -w * 0.7], [L * 0.3, -w * 1.15], [L * 0.36, -w * 0.3], [0.06, w * 0.6]], 0.024, 0.006), i % 2 ? A : A2, [0, 0, 0.022]),
        beam([L * 0.34, -w * 1.02, 0], [L * 0.82, -w * 0.86, 0], 0.008, 0.033, E),
      ], [0, 0, -0.03 - i * 0.022]);
      const a = ((24 - k * 106) * Math.PI) / 180;
      blades.add(`Blade ${i + 1}`, blade, [Math.cos(a) * 0.5, Math.sin(a) * 0.5, -i * 0.03]);
      feathers.push(blade);
    }
    handles.feathers.push(feathers);
  }

  attachWings(handles);
  return handles;
}

// Wings. `open` runs 0 (folded away behind the back) to 1 (spread to the form's fan angles).
// Opening is staged like a real wing: the arm swings up first, then the blades slide out
// and fan open one after another from the top. handles.feathers is one list of blades per side.
export function attachWings(handles) {
  const smooth = (x) => { const t = Math.min(1, Math.max(0, x)); return t * t * t * (t * (t * 6 - 15) + 10); };
  handles.wings = (open, top, bottom, flutter, forms) => {
    const arm = smooth(open / 0.82);
    const fold = 1 - arm;
    for (const side of ['l', 'r']) forms.nudge(`wingdrive_${side}`, 0, fold * -0.5, fold * -2.05);
    for (const set of handles.feathers) {
      const n = set.length - 1;
      set.forEach((blade, i) => {
        const k = i / n;
        const out = smooth((open - 0.06 - k * 0.22) / 0.72); // each blade starts a little after the one above, and they overlap
        const spread = top + (bottom - top) * k + Math.sin(flutter + i * 0.5) * 0.6 * out;
        const tucked = 20 + k * 6; // stacked along the folded arm
        blade.rotation.z = ((tucked + (spread - tucked) * out) * Math.PI) / 180;
        blade.scale.x = 0.24 + 0.76 * out;
      });
    }
  };
  return handles;
}
