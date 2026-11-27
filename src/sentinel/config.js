// What makes this robot the Sentinel: its paint, its forms, its states and its tour.
// The framework reads these; change them here, not in the framework.

// One material per role. `glow` is how hard a light role shines.
export const ROLES = {
  // `wear` is how scuffed the metal is: 0 factory fresh (the clean look Karl chose), 1 scratched plate
  armor: { rough: 0.34, metal: 0.7, env: 1.3, wear: 0 },
  armor2: { rough: 0.4, metal: 0.6, env: 1.15, wear: 0 },
  frame: { rough: 0.5, metal: 0.85, env: 0.9, wear: 0 },
  trim: { rough: 0.28, metal: 1, env: 1.35, wear: 0 },
  mark: { rough: 0.45, metal: 0.3 },
  visor: { rough: 0.12, metal: 0.9, color: '#04070b' },
  glow: { glow: 1.5 },
  edge: { glow: 0.55 }, // the thin line on each wing blade: a hint, not a neon tube,
  core: { glow: 1.0 },
  thrust: { glow: 0.6 },
};

// Colour lines. Obsidian is the locked design; the others are the same robot repainted.
const line = (id, name, armor, armor2, frame, trim, glow, mark) => ({
  id, name, swatch: [armor, glow], roles: { armor, armor2, frame, trim, glow, edge: glow, core: glow, thrust: glow, mark },
});
export const LINES = [
  line('obsidian', 'Obsidian', '#1d1e22', '#5b6069', '#0b0c0e', '#a87b45', '#35d9f8', '#d8222b'),
  line('cobalt', 'Cobalt', '#1546c8', '#dfe5ee', '#11141c', '#e3b23c', '#7fe9ff', '#e8312a'),
  line('arctic', 'Arctic', '#b4bdc8', '#69768a', '#1a1f27', '#5b6b7d', '#35d8ff', '#ff6a1f'),
  line('forge', 'Forge', '#8f1418', '#2a1d1c', '#0d0a0a', '#e0a23a', '#ffb23f', '#ffd9a0'),
  line('verdant', 'Verdant', '#0f5a3c', '#1c2a25', '#0a0e0c', '#c9a15a', '#8dff5a', '#ffd23f'),
  line('ultraviolet', 'Ultraviolet', '#3b1a8f', '#191326', '#0b0912', '#c9ccd6', '#ff4fd8', '#39e1ff'),
];

// Forms. Joint angles are degrees [x, y, z]. Left and right use the same numbers because the
// right side is a mirror of the left.
const pair = (name, v) => ({ [`${name}_l`]: v, [`${name}_r`]: v });
export const FORMS = {
  sentinel: {
    label: 'Sentinel',
    caption: 'Standing watch',
    joints: { ...pair('shoulder', [4, 0, 9]), ...pair('forearm', [-16, 0, -3]), ...pair('thigh', [-2, 0, 7]), ...pair('knee', [5, 0, 0]), ...pair('boot', [-3, 0, -7]) },
    params: { fanTop: 24, fanBottom: -76, thrust: 0.15, wingBeat: 0.4 },
  },
  flight: {
    label: 'Flight',
    caption: 'Wings flat, thrusters lit',
    tilt: [78, 0, 0],
    height: 1.5,
    joints: {
      helm: [-58, 0, 0], abdomen: [-6, 0, 0],
      ...pair('shoulder', [38, 0, 14]), ...pair('forearm', [-8, 0, -6]),
      ...pair('thigh', [8, 0, 3]), ...pair('knee', [6, 0, 0]), ...pair('boot', [62, 0, -3]),
      ...pair('wingdrive', [0, 0, -14]),
    },
    params: { fanTop: -8, fanBottom: -64, thrust: 6, wingBeat: 1.4 },
  },
  aegis: {
    label: 'Aegis',
    caption: 'Wings closed as a shield',
    joints: {
      helm: [10, 0, 0], abdomen: [4, 0, 0],
      ...pair('shoulder', [-18, 0, 6]), ...pair('forearm', [-96, 0, -24]),
      ...pair('thigh', [-6, 0, 10]), ...pair('knee', [14, 0, 0]), ...pair('boot', [-8, 0, -10]),
      ...pair('wingdrive', [0, 62, -8]),
    },
    params: { fanTop: -58, fanBottom: -100, thrust: 0.05, wingBeat: 0.15 },
  },
};

// States: what Kyvern is doing, shown through the core and the body.
export const STATES = {
  idle: { label: 'Idle', pulse: 0.9, level: 1, look: 1, sway: 1 },
  listening: { label: 'Listening', pulse: 0.5, level: 1.35, look: 0.3, sway: 0.4, lean: 3 },
  thinking: { label: 'Thinking', pulse: 3.2, level: 1.1, look: 0.15, sway: 0.6, spin: 4, tiltHead: 9 },
  speaking: { label: 'Speaking', pulse: 6, level: 1.6, look: 0.6, sway: 1.3, talk: 1 },
};

// The tour. Each chapter opens one section and reads out two lines. `view` is [azimuth, elevation].
export const CHAPTERS = [
  { id: 'helm', section: 'helm', seconds: 7 },
  { id: 'core', section: 'core', seconds: 7, surge: true },
  { id: 'wings', section: 'wings', seconds: 8 },
  { id: 'arms', section: 'arms', seconds: 7 },
  { id: 'legs', section: 'legs', seconds: 7 },
  { id: 'teardown', label: 'Teardown', lines: ['Every part apart', 'Turntable 330°'], seconds: 12, teardown: true, view: [0.5, 0.14] },
  { id: 'launch', label: 'Launch', lines: ['Wings flat, thrusters lit', 'Back on the pad'], seconds: 10, form: 'flight', view: [1.0, 0.16] },
];

export const CARDS = ['Core output', 'Wing spread', 'Servo load', 'Battery'];
