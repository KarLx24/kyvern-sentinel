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
import math, random  # noqa: E402
from mathutils import Vector  # noqa: E402
from mathutils.bvhtree import BVHTree  # noqa: E402


def bake_shading(reach=0.42, rays=20, floor=0.22):
    """Soft contact shadow painted into every point (the mesh's colour attribute): seams, panel
    lines and the gaps between plates go darker, so the armour reads as deep instead of flat.
    Each joint is shaded on its own, so the shading still looks right when parts move or come apart."""
    dg = bpy.context.evaluated_depsgraph_get()
    rnd = random.Random(7)
    dirs = []
    while len(dirs) < rays:  # cosine-weighted directions around +Z
        u, v = rnd.random(), rnd.random()
        r, a = math.sqrt(u), 2 * math.pi * v
        dirs.append(Vector((r * math.cos(a), r * math.sin(a), math.sqrt(1 - u))))
    groups = {}
    for ob in bpy.data.objects:
        if ob.type == 'MESH':
            groups.setdefault(ob.parent, []).append(ob)
    for obs in groups.values():
        verts, polys = [], []
        for ob in obs:
            ev = ob.evaluated_get(dg)
            me = ev.to_mesh()
            base = len(verts)
            verts += [ev.matrix_world @ v.co for v in me.vertices]
            polys += [[base + i for i in p.vertices] for p in me.polygons]
            ev.to_mesh_clear()
        tree = BVHTree.FromPolygons(verts, polys)
        for ob in obs:
            me = ob.data
            mw = ob.matrix_world
            nm = mw.to_3x3().inverted_safe().transposed()
            col = me.color_attributes.new('Color', 'FLOAT_COLOR', 'POINT')
            for v in me.vertices:
                n = (nm @ v.normal).normalized()
                t = n.orthogonal().normalized()
                b = n.cross(t)
                o = mw @ v.co + n * 0.003
                occ = 0.0
                for d in dirs:
                    hit = tree.ray_cast(o, t * d.x + b * d.y + n * d.z, reach)
                    if hit[0] is not None:
                        occ += 1.0 - hit[3] / reach
                k = max(floor, 1.0 - 1.35 * occ / rays)
                col.data[v.index].color = (k, k, k, 1.0)
            me.color_attributes.active_color = col
            me.color_attributes.render_color_index = 0


bake_shading()

out = os.path.join(here, '..', 'models', 'sentinel_raw.glb')
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_apply=True, export_yup=True,
                          export_materials='EXPORT', export_cameras=False, export_lights=False,
                          export_vertex_color='ACTIVE', export_all_vertex_colors=False,
                          export_active_vertex_color_when_no_material=True)
print('wrote', os.path.normpath(out))
