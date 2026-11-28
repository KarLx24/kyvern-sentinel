// What makes this robot the Sentinel: its paint, its forms, its states and its tour.
// The framework reads these; change them here, not in the framework.

// One material per role. `glow` is how hard a light role shines.
export const ROLES = {
  // `wear` is how scuffed the metal is: 0 factory fresh (the clean look Karl chose), 1 scratched plate
  armor: { rough: 0.38, metal: 0.72, env: 1.25, wear: 0, coat: 1, coatRough: 0.1 },
  armor2: { rough: 0.42, metal: 0.65, env: 1.15, wear: 0, coat: 0.7, coatRough: 0.18 },
  frame: { rough: 0.5, metal: 0.85, env: 0.9, wear: 0 },
  trim: { rough: 0.24, metal: 1, env: 1.4, wear: 0 },
  mark: { rough: 0.45, metal: 0.3 },
  visor: { rough: 0.12, metal: 0.9, color: '#04070b' },
  glow: { glow: 1.5 },
  edge: { glow: 0.55 }, // the thin line on each wing blade: a hint, not a neon tube,
  core: { glow: 1.0 },
  thrust: { glow: 0.6 },
};

// Colour lines: robot paint schemes. Obsidian is the locked design; the others repaint the same robot.
// Each is armour, second armour, frame, trim, light, marker.
const line = (id, name, armor, armor2, frame, trim, glow, mark) => ({
  id, name, swatch: [armor, armor2, glow], roles: { armor, armor2, frame, trim, glow, edge: glow, core: glow, thrust: glow, mark },
});
export const LINES = [
  line('obsidian', 'Obsidian', '#1d1e22', '#5b6069', '#0b0c0e', '#a87b45', '#35d9f8', '#d8222b'),
  line('vanguard', 'Vanguard', '#b0151b', '#1c3f9e', '#14161b', '#c9ced6', '#8fe6ff', '#f2c230'),
  line('hornet', 'Hornet', '#e2a90c', '#1a1b1e', '#0d0d0f', '#8d939c', '#59d8ff', '#d8222b'),
  line('warlord', 'Warlord', '#3d2c66', '#1b1a24', '#0c0b11', '#a3a8b3', '#b85cff', '#ff3b3b'),
  line('medic', 'Rescue', '#d9dde2', '#b01c22', '#20242b', '#8a929c', '#35d8ff', '#e8312a'),
  line('ranger', 'Ranger', '#48582b', '#8a7a52', '#141610', '#b08d4a', '#ffb03a', '#f04a1c'),
  line('titan', 'Titanium', '#8b939c', '#454a52', '#17191d', '#c58a3c', '#ff8a2a', '#1f6fe0'),
  line('stealth', 'Stealth', '#101114', '#27292e', '#08080a', '#3c4047', '#ff2a2a', '#ff2a2a'),
];

// Forms. Joint angles are degrees [x, y, z] on top of the model's rest pose. Left and right use
// the same numbers because the right side is a mirror of the left.
//   grid  0..1  the light-line look: armour goes dark and its edges light up
//   fly   0..1  he flies a patrol circuit on his own
const pair = (name, v) => ({ [`${name}_l`]: v, [`${name}_r`]: v });
export const FORMS = {
  sentinel: {
    label: 'Sentinel',
    caption: 'Robot form, standing watch',
    joints: { ...pair('shoulder', [4, 0, 9]), ...pair('forearm', [-16, 0, -3]), ...pair('thigh', [-2, 0, 7]), ...pair('knee', [5, 0, 0]), ...pair('boot', [-3, 0, -7]) },
    params: { fanTop: 24, fanBottom: -76, thrust: 0.15, wingBeat: 0.4, grid: 0, fly: 0 },
  },
  tron: {
    label: 'Tron',
    caption: 'Light-line form: armour dark, every edge lit',
    joints: {
      helm: [6, 0, 0], abdomen: [3, 0, 0],
      ...pair('shoulder', [-6, 0, 10]), ...pair('forearm', [-34, 0, -6]),
      ...pair('thigh', [-5, 0, 5]), ...pair('knee', [9, 0, 0]), ...pair('boot', [-4, 0, -5]),
      ...pair('wingdrive', [0, 0, 10]),
    },
    params: { fanTop: 34, fanBottom: -18, thrust: 0.3, wingBeat: 0.15, grid: 1, fly: 0 },
  },
  vehicle: {
    label: 'Starship',
    caption: 'Vehicle form: flies a patrol circuit',
    tilt: [90, 0, 0],
    height: 2.5,
    joints: {
      helm: [-80, 0, 0], abdomen: [-2, 0, 0],
      // arms reach ahead to make the nose, legs lock together as the engine block
      ...pair('shoulder', [-176, 0, -10]), ...pair('forearm', [-4, 0, 0]),
      ...pair('thigh', [0, 0, -6]), ...pair('knee', [0, 0, 0]), ...pair('boot', [6, 0, 0]),
      ...pair('wingdrive', [0, 0, -24]),
    },
    params: { fanTop: -6, fanBottom: -66, thrust: 6, wingBeat: 0.1, grid: 0, fly: 1 },
  },
};

// States: five things he does. `pose` is extra joint rotation in degrees, blended in and out.
//   scan   head sweeps side to side with the visor beam on      flare  wings open wider
//   beat   wings beat                                          wings  false folds them away
export const STATES = {
  guard: { label: 'Guard', note: 'Standing watch', pulse: 0.9, level: 1, look: 1, sway: 1 },
  scan: { label: 'Scan', note: 'Head sweeps the area, visor beam on', pulse: 2.4, level: 1.2, look: 0, sway: 0.5, scan: 1, pose: { abdomen: [2, 0, 0] } },
  combat: {
    label: 'Combat', note: 'Guard up, wings flared', pulse: 4.5, level: 1.5, look: 0.5, sway: 0.5, flare: 1, drop: 0.07,
    pose: {
      abdomen: [5, 14, 0], chest: [3, 8, 0], helm: [2, -20, 0],
      shoulder_l: [-48, 0, 6], forearm_l: [-88, 0, -10], shoulder_r: [26, 0, 10], forearm_r: [-104, 0, -6],
      thigh_l: [-20, 0, 4], knee_l: [26, 0, 0], boot_l: [-6, 0, 0], thigh_r: [12, 0, 6], knee_r: [10, 0, 0], boot_r: [-20, 0, 0],
    },
  },
  overdrive: {
    label: 'Overdrive', note: 'Reactor at full, wings beating', pulse: 7, level: 1.9, look: 0.3, sway: 1.5, spin: 6, beat: 1, flare: 0.5,
    pose: { helm: [-12, 0, 0], chest: [-5, 0, 0], shoulder_l: [8, 0, 26], shoulder_r: [8, 0, 26], forearm_l: [-46, 0, 0], forearm_r: [-46, 0, 0] },
  },
  standby: {
    label: 'Standby', note: 'Powered down, wings stowed', pulse: 0.35, level: 0.3, look: 0, sway: 0.2, wings: false, drop: 0.03,
    pose: { helm: [24, 0, 0], chest: [7, 0, 0], abdomen: [6, 0, 0], shoulder_l: [6, 0, -3], shoulder_r: [6, 0, -3], forearm_l: [-6, 0, 0], forearm_r: [-6, 0, 0] },
  },
};
// names Kyvern's own UI used before
export const STATE_ALIAS = { idle: 'guard', listening: 'scan', thinking: 'scan', speaking: 'overdrive' };

// The tour. Each chapter opens one section and reads out two lines. `view` is [azimuth, elevation].
export const CHAPTERS = [
  { id: 'helm', section: 'helm', seconds: 7 },
  { id: 'core', section: 'core', seconds: 7, surge: true },
  { id: 'wings', section: 'wings', seconds: 8 },
  { id: 'arms', section: 'arms', seconds: 7 },
  { id: 'legs', section: 'legs', seconds: 7 },
  { id: 'teardown', label: 'Teardown', lines: ['Every part apart', 'Turntable 330°'], seconds: 12, teardown: true, view: [0.5, 0.14] },
  { id: 'launch', label: 'Launch', lines: ['Starship form', 'Flying the patrol circuit'], seconds: 14, form: 'vehicle', view: [1.0, 0.16] },
];

// The data plate: what he is. Shown along the top and in the machinery panel.
export const SPEC = {
  top: [['Class', 'Winged guardian'], ['Height', '3.67 m'], ['Mass', '1,840 kg'], ['Wingspan', '7.4 m'], ['Reactor', '4.2 MW arc core']],
  machinery: [
    ['Frame', 'Titanium lattice, 14 load joints'],
    ['Armour', 'Layered ceramic steel, 6 to 22 mm'],
    ['Actuators', '34 servo axes, bronze bearings'],
    ['Hydraulics', 'Twin loop, 210 bar'],
    ['Wing drive', '2 arms, 8 rotors, 18 blades'],
    ['Thrusters', '2 back, 4 sole, 76 kN total'],
    ['Sensors', 'Visor array, lidar, 360° proximity'],
    ['Cooling', 'Liquid loop through the back vents'],
  ],
};


