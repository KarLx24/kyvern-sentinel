# Rebuilds the Sentinel from tools/build_sentinel.py and writes models/sentinel_raw.glb.
# It runs only the modelling half of that script: no floor, lights, camera or render.
#
#   pip install bpy            (or run inside Blender: blender -b -P tools/export_glb.py)
#   python tools/export_glb.py
#   npx @gltf-transform/cli meshopt models/sentinel_raw.glb models/sentinel.glb
#
# Use `meshopt` only. `optimize` joins meshes and flattens the joints the page needs.
import os, sys

here = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(here, 'build_sentinel.py')).read()
cut = src.rfind('# ----', 0, src.index('# stage: floor, haze, lights, camera'))
sys.argv = ['build_sentinel.py']
exec(compile(src[:cut], 'build_sentinel.py', 'exec'), globals())

import bpy  # noqa: E402

out = os.path.join(here, '..', 'models', 'sentinel_raw.glb')
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_apply=True, export_yup=True,
                          export_materials='EXPORT', export_cameras=False, export_lights=False)
print('wrote', os.path.normpath(out))
