# The Sentinel framework

Two folders. `src/framework/` is the reusable part. `src/sentinel/` is this robot.

## Framework

| File | What it does |
|---|---|
| `rig.js` | The parts tree. Each part is its own joint: a pivot the pose turns, a shift that moves it away from its parent, and a body of named pieces. Holds the teardown state (`openSection`, `openPart`, `teardown`, `closeAll`) and lifts the robot so opened legs never go through the floor. |
| `forms.js` | Whole-body poses. Blends every joint from one form to the next and lets motion add small rotations on top (`nudge`). |
| `paint.js` | One material per role (armour, frame, trim, glow ...) and the colour lines that repaint them with a sweep. |
| `motion.js` | `Walker` (keys, touch pad, walk cycle, flying) and `Behaviour` (breathing, looking at the pointer, the four states). |
| `stage.js` | Renderer, camera, lights, floor, city backdrop, bloom. Drops quality by itself on slow machines. |
| `tour.js` | Timed chapters. |
| `hud.js` | Everything drawn in the page around the robot. |
| `shapes.js` | Helpers for flat-faced metal parts: `plate`, `loft`, `box`, `disc`, `ring`, `beam`. |
| `partmodels.js` | Swaps a coded part for a finished 3D model, one part at a time. |

## The Sentinel

- `model.js` builds the 26 parts from the locked design. Left and right are built once and mirrored.
- `config.js` holds the paint roles, colour lines, forms, states and tour chapters. Most changes to how he looks or moves are a few numbers here.

### Add a part

```js
const part = rig.part({ id: 'visor_fin', label: 'Visor fin', section: 'helm', parent: 'helm',
                        at: [0, 0.5, 0], explode: [0, 0.3, 0], note: 'One line about it.' });
part.add('Fin', mesh(plate([[0, 0], [0.1, 0], [0.05, 0.2]], 0.02), m.armor), [0, 0.2, 0]);
```

`at` is where it joins its parent. `explode` is where the whole part travels when its section opens. The last argument of `add` is where that piece travels when the part itself is opened.

### Add a form

Add an entry to `FORMS` in `config.js`: joint angles in degrees, an optional whole-body `tilt` and hover `height`, and the wing fan angles. Give the left side's numbers; the right side mirrors them.

### Use generated 3D parts

Put web-ready GLB files in `parts/` and list them in `parts/manifest.json`:

```json
{ "parts": { "chest": { "url": "rd_chest_41.glb", "position": [0, 0.3, 0], "rotation": [0, 0, 0], "scale": 1 } } }
```

A listed part replaces its coded pieces; every other part stays coded, so the robot is always whole. Files shrunk with meshopt load as they are (the decoder is included). The ids are: `pelvis, abdomen, chest, core, backunit, helm` and, with `_l` or `_r`, `shoulder, upperarm, forearm, hand, thigh, knee, shin, boot, wingdrive, blades`.

## Recording clips

Open with `?manual=1` and call `sentinel.step(1/30, n)` to advance exact frames between screenshots.
