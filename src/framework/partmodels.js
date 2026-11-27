// Part models: lets a finished 3D model stand in for a coded part, one part at a time.
// parts/manifest.json lists them:
//   { "parts": { "chest": { "url": "chest.glb", "position": [0, 0.3, 0], "rotation": [0, 0, 0], "scale": 1 } } }
// A part that is not listed keeps its coded pieces, so the robot is always whole.
import * as THREE from 'three';

export async function loadPartModels(rig, manifestUrl) {
  let manifest;
  try {
    const res = await fetch(manifestUrl, { cache: 'no-cache' });
    if (!res.ok) return [];
    manifest = await res.json();
  } catch {
    return [];
  }
  const entries = Object.entries(manifest.parts || {}).filter(([id]) => rig.parts.has(id));
  if (!entries.length) return [];

  const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
    import('three/addons/loaders/GLTFLoader.js'),
    import('three/addons/libs/meshopt_decoder.module.js'),
  ]);
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const base = new URL(manifestUrl, location.href);
  const done = [];
  await Promise.all(
    entries.map(async ([id, def]) => {
      try {
        const gltf = await loader.loadAsync(new URL(def.url, base).href);
        const holder = new THREE.Group();
        holder.add(gltf.scene);
        if (def.position) holder.position.fromArray(def.position);
        if (def.rotation) holder.rotation.set(...def.rotation.map((d) => (d * Math.PI) / 180));
        if (def.scale) holder.scale.setScalar(def.scale);
        rig.get(id).replaceBody(holder);
        done.push(id);
      } catch (err) {
        console.warn(`part model for "${id}" did not load, keeping the coded part`, err);
      }
    }),
  );
  return done;
}
