# Kyvern Sentinel SN-01, built in Blender from the locked design portrait.
# Run:  blender -b --factory-startup -P build_sentinel.py -- [--samples 200] [--scale 100] [--device GPU|CPU] [--name hero] [--norender]
# Writes kyvern_sentinel.blend and renders\<name>.png next to this file.
# Blender axes: X = his left/right, Z = up, he faces -Y (toward the camera).
import bpy, bmesh, math, os, sys
from mathutils import Vector, Matrix

R = math.radians
ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def arg(name, default):
    return type(default)(ARGV[ARGV.index(name) + 1]) if name in ARGV else default


HERE = os.path.dirname(os.path.abspath(__file__))
SAMPLES = arg('--samples', 200)
SCALE = arg('--scale', 100)
DEVICE = arg('--device', 'CPU')
NAME = arg('--name', 'sentinel_hero')
CAM = arg('--cam', 'hero')

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
ROOT = scene.collection


# ------------------------------------------------------------------------------------------
# materials
# ------------------------------------------------------------------------------------------
def metal(name, base, rough, edge=(0.35, 0.36, 0.38), wear=0.5, scratch=0.25, metallic=1.0, coat=0.0, grime=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    N, L = nt.nodes, nt.links
    b = N['Principled BSDF']
    b.inputs['Metallic'].default_value = metallic
    b.inputs['Coat Weight'].default_value = coat
    b.inputs['Coat Roughness'].default_value = 0.25
    tc = N.new('ShaderNodeTexCoord')
    # large soft variation: roughness and a little value shift
    n1 = N.new('ShaderNodeTexNoise')
    n1.inputs['Scale'].default_value = 5.0
    n1.inputs['Detail'].default_value = 9.0
    n1.inputs['Roughness'].default_value = 0.65
    L.new(tc.outputs['Object'], n1.inputs['Vector'])
    mr = N.new('ShaderNodeMapRange')
    mr.inputs['From Min'].default_value = 0.3
    mr.inputs['From Max'].default_value = 0.7
    mr.inputs['To Min'].default_value = max(0.05, rough - 0.1)
    mr.inputs['To Max'].default_value = min(1.0, rough + 0.14)
    L.new(n1.outputs['Fac'], mr.inputs['Value'])
    L.new(mr.outputs['Result'], b.inputs['Roughness'])
    # fine brushed scratches as bump
    mp = N.new('ShaderNodeMapping')
    mp.inputs['Scale'].default_value = (3.0, 3.0, 90.0)
    L.new(tc.outputs['Object'], mp.inputs['Vector'])
    n2 = N.new('ShaderNodeTexNoise')
    n2.inputs['Scale'].default_value = 40.0
    n2.inputs['Detail'].default_value = 4.0
    L.new(mp.outputs['Vector'], n2.inputs['Vector'])
    n3 = N.new('ShaderNodeTexNoise')
    n3.inputs['Scale'].default_value = 220.0
    n3.inputs['Detail'].default_value = 2.0
    L.new(tc.outputs['Object'], n3.inputs['Vector'])
    addn = N.new('ShaderNodeMath')
    addn.operation = 'ADD'
    L.new(n2.outputs['Fac'], addn.inputs[0])
    L.new(n3.outputs['Fac'], addn.inputs[1])
    bev = N.new('ShaderNodeBevel')
    bev.samples = 4
    bev.inputs['Radius'].default_value = 0.006
    bump = N.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = scratch
    bump.inputs['Distance'].default_value = 0.006
    L.new(addn.outputs[0], bump.inputs['Height'])
    L.new(bev.outputs['Normal'], bump.inputs['Normal'])
    L.new(bump.outputs['Normal'], b.inputs['Normal'])
    # edge wear: convex edges catch a brighter bare-metal colour
    ao = N.new('ShaderNodeAmbientOcclusion')
    ao.inside = True
    ao.only_local = True
    ao.samples = 12
    ao.inputs['Distance'].default_value = 0.016
    ramp = N.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.5
    ramp.color_ramp.elements[0].color = (1, 1, 1, 1)
    ramp.color_ramp.elements[1].position = 0.8
    ramp.color_ramp.elements[1].color = (0, 0, 0, 1)
    L.new(ao.outputs['AO'], ramp.inputs['Fac'])
    n4 = N.new('ShaderNodeTexNoise')
    n4.inputs['Scale'].default_value = 28.0
    n4.inputs['Detail'].default_value = 6.0
    L.new(tc.outputs['Object'], n4.inputs['Vector'])
    r4 = N.new('ShaderNodeMapRange')
    r4.inputs['From Min'].default_value = 0.3
    r4.inputs['From Max'].default_value = 0.55
    L.new(n4.outputs['Fac'], r4.inputs['Value'])
    mul = N.new('ShaderNodeMath')
    mul.operation = 'MULTIPLY'
    L.new(ramp.outputs['Color'], mul.inputs[0])
    L.new(r4.outputs['Result'], mul.inputs[1])
    mul2 = N.new('ShaderNodeMath')
    mul2.operation = 'MULTIPLY'
    mul2.inputs[1].default_value = wear
    L.new(mul.outputs[0], mul2.inputs[0])
    # base colour with slight value variation, and grime in the cavities
    var = N.new('ShaderNodeMixRGB')
    var.blend_type = 'MULTIPLY'
    var.inputs['Color1'].default_value = (*base, 1)
    var.inputs['Color2'].default_value = (0.55, 0.55, 0.55, 1)
    L.new(n1.outputs['Fac'], var.inputs['Fac'])
    mix = N.new('ShaderNodeMixRGB')
    mix.inputs['Color2'].default_value = (*edge, 1)
    L.new(var.outputs['Color'], mix.inputs['Color1'])
    L.new(mul2.outputs[0], mix.inputs['Fac'])
    out_col = mix.outputs['Color']
    if grime > 0:
        ao2 = N.new('ShaderNodeAmbientOcclusion')
        ao2.samples = 6
        ao2.inputs['Distance'].default_value = 0.12
        g = N.new('ShaderNodeMixRGB')
        g.blend_type = 'MULTIPLY'
        g.inputs['Fac'].default_value = grime
        L.new(out_col, g.inputs['Color1'])
        L.new(ao2.outputs['Color'], g.inputs['Color2'])
        out_col = g.outputs['Color']
    L.new(out_col, b.inputs['Base Color'])
    return m


def emit(name, color, strength):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (0, 0, 0, 1)
    b.inputs['Roughness'].default_value = 0.3
    b.inputs['Emission Color'].default_value = (*color, 1)
    b.inputs['Emission Strength'].default_value = strength
    return m


A = metal('Armour black', (0.014, 0.015, 0.018), 0.22, wear=0.8, scratch=0.4, coat=0.3, metallic=1.0, grime=0.3)
A2 = metal('Armour gunmetal', (0.06, 0.064, 0.072), 0.33, wear=0.85, scratch=0.6, grime=0.5)
F = metal('Frame steel', (0.03, 0.031, 0.034), 0.5, wear=0.4, scratch=0.3, grime=0.7)
T = metal('Bronze', (0.62, 0.36, 0.13), 0.3, edge=(0.95, 0.72, 0.4), wear=0.6, scratch=0.35, grime=0.6)
BL = metal('Wing blade', (0.05, 0.054, 0.062), 0.38, wear=0.7, scratch=0.6, grime=0.3)
G = emit('Seam cyan', (0.02, 0.72, 1.0), 9.0)
RD = emit('Marker red', (1.0, 0.02, 0.015), 3.0)
CORE = emit('Core', (0.45, 0.9, 1.0), 30.0)
VIS = metal('Visor glass', (0.004, 0.006, 0.008), 0.08, wear=0.0, scratch=0.0, metallic=0.3, coat=1.0)


# ------------------------------------------------------------------------------------------
# geometry helpers
# ------------------------------------------------------------------------------------------
def empty(name, parent=None, loc=(0, 0, 0), rot=(0, 0, 0), mirror=False):
    e = bpy.data.objects.new(name, None)
    e.empty_display_size = 0.08
    ROOT.objects.link(e)
    e.parent = parent
    e.location = loc
    e.rotation_euler = [R(a) for a in rot]
    if mirror:
        e.scale.x = -1
    return e


def finish(name, bm, mat, parent, loc=(0, 0, 0), rot=(0, 0, 0), bevel=0.012, segs=2, matrix=None):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    me.set_sharp_from_angle(angle=R(34))
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    ROOT.objects.link(ob)
    ob.parent = parent
    if matrix is not None:
        ob.matrix_local = matrix
    else:
        ob.location = loc
        ob.rotation_euler = [R(a) for a in rot]
    if bevel > 0:
        m = ob.modifiers.new('Bevel', 'BEVEL')
        m.width = bevel
        m.segments = segs
        m.limit_method = 'ANGLE'
        m.angle_limit = R(34)
        w = ob.modifiers.new('Normals', 'WEIGHTED_NORMAL')
        w.keep_sharp = True
    return ob


def plate(name, pts, depth, mat, parent, loc=(0, 0, 0), rot=(0, 0, 0), inset=0.0, bevel=0.012):
    """Polygon drawn in the X/Z plane, back at y=0, front face at y=-depth. `inset` chamfers the front."""
    bm = bmesh.new()
    cx = sum(p[0] for p in pts) / len(pts)
    cz = sum(p[1] for p in pts) / len(pts)

    def ins(p):
        d = Vector((p[0] - cx, p[1] - cz))
        ln = d.length
        f = max(0.2, (ln - inset) / ln) if ln > 1e-6 else 1
        return cx + d.x * f, cz + d.y * f

    rings = [[bm.verts.new((x, 0, z)) for x, z in pts]]
    if inset > 0:
        rings.append([bm.verts.new((x, -depth * 0.5, z)) for x, z in pts])
        rings.append([bm.verts.new((ins(p)[0], -depth, ins(p)[1])) for p in pts])
    else:
        rings.append([bm.verts.new((x, -depth, z)) for x, z in pts])
    n = len(pts)
    for a, b in zip(rings, rings[1:]):
        for i in range(n):
            bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]))
    bm.faces.new(rings[0])
    bm.faces.new(rings[-1])
    return finish(name, bm, mat, parent, loc, rot, bevel)


def box(name, dims, mat, parent, loc=(0, 0, 0), rot=(0, 0, 0), bevel=0.01):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=dims, verts=bm.verts[:])
    return finish(name, bm, mat, parent, loc, rot, bevel)


AXIS = {'z': Matrix.Identity(4), 'x': Matrix.Rotation(R(90), 4, 'Y'), 'y': Matrix.Rotation(R(90), 4, 'X')}


def cyl(name, r, length, mat, parent, loc=(0, 0, 0), axis='z', rot=(0, 0, 0), seg=40, r2=None, bevel=0.008):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r if r2 is None else r2, depth=length, matrix=AXIS[axis])
    return finish(name, bm, mat, parent, loc, rot, bevel)


def sphere(name, r, mat, parent, loc=(0, 0, 0)):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=20, radius=r)
    return finish(name, bm, mat, parent, loc, bevel=0)


def torus(name, rad, tube, mat, parent, loc=(0, 0, 0), axis='y', rot=(0, 0, 0), seg=56, tseg=12):
    bm = bmesh.new()
    rings = []
    for i in range(seg):
        a = 2 * math.pi * i / seg
        ring = []
        for j in range(tseg):
            b = 2 * math.pi * j / tseg
            rr = rad + tube * math.cos(b)
            ring.append(bm.verts.new(AXIS[axis] @ Vector((rr * math.cos(a), rr * math.sin(a), tube * math.sin(b)))))
        rings.append(ring)
    for i in range(seg):
        for j in range(tseg):
            bm.faces.new((rings[i][j], rings[(i + 1) % seg][j], rings[(i + 1) % seg][(j + 1) % tseg], rings[i][(j + 1) % tseg]))
    return finish(name, bm, mat, parent, loc, rot, bevel=0)


def loft(name, secs, mat, parent, loc=(0, 0, 0), rot=(0, 0, 0), bevel=0.012):
    """Stack of chamfered-rectangle cross sections: dict(z, w, d, c, x=0, y=0)."""
    bm = bmesh.new()
    rings = []
    for s in secs:
        w, d, c = s['w'] / 2, s['d'] / 2, s.get('c', 0.04)
        x0, y0, z = s.get('x', 0), s.get('y', 0), s['z']
        pts = [(w - c, -d), (w, -d + c), (w, d - c), (w - c, d), (-w + c, d), (-w, d - c), (-w, -d + c), (-w + c, -d)]
        rings.append([bm.verts.new((x0 + px, y0 + py, z)) for px, py in pts])
    for a, b in zip(rings, rings[1:]):
        for i in range(8):
            bm.faces.new((a[i], a[(i + 1) % 8], b[(i + 1) % 8], b[i]))
    bm.faces.new(rings[0])
    bm.faces.new(rings[-1])
    return finish(name, bm, mat, parent, loc, rot, bevel)


def beam(name, a, b, width, depth, mat, parent, bevel=0.003):
    """Bar from a to b. `width` lies in the facing plane, `depth` points along Y (toward the viewer)."""
    a, b = Vector(a), Vector(b)
    zl = (b - a).normalized()
    yl = Vector((0, 1, 0)) - zl * zl.y
    if yl.length < 1e-4:
        yl = Vector((1, 0, 0))
    yl.normalize()
    xl = yl.cross(zl)
    mtx = Matrix((xl, yl, zl)).transposed().to_4x4()
    mtx.translation = (a + b) / 2
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(width, depth, (b - a).length), verts=bm.verts[:])
    return finish(name, bm, mat, parent, bevel=bevel, matrix=mtx)


def seam(parent, pts, width=0.016, depth=0.014, mat=None):
    """Light strip through 3D points."""
    for p, q in zip(pts, pts[1:]):
        beam('Seam', p, q, width, depth, mat or G, parent, bevel=0)


def marker(parent, loc, w=0.1, h=0.03, rot=(0, 0, 0)):
    box('Marker', (w, 0.012, h), RD, parent, loc, rot, bevel=0)


def joint(name, parent, loc, r, length, axis='x'):
    """Bronze drum, dark inner drum, hex hub."""
    cyl(name + ' drum', r, length, T, parent, loc, axis, seg=48, bevel=0.012)
    cyl(name + ' inner', r * 0.66, length * 1.12, F, parent, loc, axis, seg=40)
    cyl(name + ' hub', r * 0.36, length * 1.22, T, parent, loc, axis, seg=32)
    cyl(name + ' bolt', r * 0.16, length * 1.3, F, parent, loc, axis, seg=6, bevel=0.003)


def bolts(parent, pts, y, r=0.012, mat=None):
    for x, z in pts:
        cyl('Bolt', r, 0.012, mat or F, parent, (x, y, z), 'y', seg=6, bevel=0.002)


def stretch(emp, fz, fxy=1.0, keep=('drum', 'inner', 'hub', 'bolt', 'Bolt', 'rim', 'Marker', 'light', 'Knee cap')):
    """Lengthen (fz) and slim (fxy) every piece hung on a joint, measured in the joint's own space.
    Joint drums, bolts and markers keep their shape and only move."""
    for ob in emp.children:
        if ob.type != 'MESH':
            continue
        if any(k in ob.name for k in keep):
            ob.location.z *= fz
            ob.location.x *= fxy
            ob.location.y *= fxy
            continue
        m = ob.matrix_local.copy()
        inv = m.inverted()
        for v in ob.data.vertices:
            q = m @ v.co
            q.z *= fz
            q.x *= fxy
            q.y *= fxy
            v.co = inv @ q


def mx(pts, s):
    return [(x * s, z) for x, z in pts]


# ------------------------------------------------------------------------------------------
# the Sentinel
# ------------------------------------------------------------------------------------------
rig = empty('Sentinel')

# ---- pelvis --------------------------------------------------------------------------------
pelvis = empty('pelvis', rig, (0, 0, 2.4))
box('Hip block', (0.6, 0.34, 0.26), F, pelvis, (0, 0.02, 0), bevel=0.03)
cyl('Hip axle', 0.09, 0.9, F, pelvis, (0, 0, 0), 'x')
plate('Belt plate', [(-0.3, 0.14), (0.3, 0.14), (0.35, 0.04), (0.2, -0.07), (-0.2, -0.07), (-0.35, 0.04)], 0.09, A2, pelvis, (0, -0.15, 0.12), inset=0.025)
plate('Codpiece', [(-0.13, 0.1), (0.13, 0.1), (0.17, -0.06), (0.08, -0.4), (-0.08, -0.4), (-0.17, -0.06)], 0.13, A, pelvis, (0, -0.16, -0.04), (6, 0, 0), inset=0.035)
plate('Codpiece rib', [(-0.05, 0.02), (0.05, 0.02), (0.035, -0.3), (-0.035, -0.3)], 0.03, A2, pelvis, (0, -0.285, -0.04), (6, 0, 0), inset=0.008, bevel=0.005)
plate('Tail plate', [(-0.2, 0.14), (0.2, 0.14), (0.16, -0.02), (0.07, -0.26), (-0.07, -0.26), (-0.16, -0.02)], 0.1, A2, pelvis, (0, 0.28, 0), inset=0.02)
cyl('Waist ring', 0.22, 0.06, T, pelvis, (0, 0.02, 0.17))
for s in (1, -1):
    plate('Hip skirt', mx([(0.22, 0.16), (0.44, 0.1), (0.5, -0.1), (0.36, -0.2), (0.24, -0.06)], s), 0.09, A, pelvis, (0, -0.13, 0.02), (0, 0, 0), inset=0.02)
    cyl('Belt piston', 0.022, 0.2, T, pelvis, (s * 0.17, -0.1, 0.2), 'z', rot=(0, s * 14, 0), seg=16, bevel=0.003)

# ---- abdomen -------------------------------------------------------------------------------
abdomen = empty('abdomen', pelvis, (0, 0, 0.2))
cyl('Spine column', 0.13, 0.76, F, abdomen, (0, 0.03, 0.35))
for z in (0.1, 0.3, 0.5):
    torus('Spine ring', 0.135, 0.014, T, abdomen, (0, 0.03, z), 'z')
for i, (w, z, mat) in enumerate([(0.27, 0.59, A2), (0.24, 0.45, A2), (0.21, 0.31, A2), (0.18, 0.17, A2)]):
    pts = [(-w, 0.06), (w, 0.06), (w + 0.035, 0.0), (w - 0.05, -0.062), (0.0, -0.088), (-w + 0.05, -0.062), (-w - 0.035, 0.0)]
    plate('Ab plate %d' % (i + 1), pts, 0.07, mat, abdomen, (0, -0.15 - (0.012 * (3 - i)), z), (-3, 0, 0), inset=0.02)
    plate('Ab key %d' % (i + 1), [(-0.07, 0.035), (0.07, 0.035), (0.045, -0.05), (-0.045, -0.05)], 0.02, A, abdomen, (0, -0.222 - (0.012 * (3 - i)), z + 0.005), (-3, 0, 0), inset=0.008, bevel=0.004)
for s in (1, -1):
    loft('Flank', [dict(z=0.0, w=0.12, d=0.26, c=0.03), dict(z=0.7, w=0.16, d=0.34, c=0.04)], F, abdomen, (s * 0.24, 0.04, 0))
    for k, z in enumerate((0.1, 0.27, 0.44, 0.6)):
        box('Flank rib', (0.05, 0.28, 0.09), A, abdomen, (s * (0.275 + k * 0.012), 0.02, z), (0, s * -10, 0), bevel=0.015)
    cyl('Waist piston', 0.024, 0.62, T, abdomen, (s * 0.15, -0.1, 0.33), 'z', rot=(0, s * -6, 0), seg=16, bevel=0.003)
    cyl('Waist piston sleeve', 0.036, 0.22, F, abdomen, (s * 0.142, -0.1, 0.16), 'z', rot=(0, s * -6, 0), seg=16, bevel=0.004)

# ---- chest ---------------------------------------------------------------------------------
chest = empty('chest', abdomen, (0, 0, 0.7))  # world z 3.15
CZ = 0.27  # core height on the chest
loft('Rib cage', [dict(z=-0.02, w=0.5, d=0.34, c=0.07), dict(z=0.3, w=1.12, d=0.5, c=0.1), dict(z=0.62, w=1.04, d=0.44, c=0.1)], F, chest)
arc = [(0.21 * math.cos(R(a)), CZ + 0.21 * math.sin(R(a))) for a in (-38, -10, 20, 50, 80)]
pec = [(0.036, 0.66), (0.4, 0.72), (0.56, 0.61), (0.55, 0.26), (0.37, 0.0), (0.17, -0.05)] + arc
lower = [(0.03, -0.01), (0.19, -0.03), (0.37, 0.03), (0.34, -0.1), (0.14, -0.15), (0.03, -0.1)]
for s in (1, -1):
    plate('Pectoral', mx(pec, s * 1.22), 0.17, A, chest, (0, -0.16, 0), (-6, s * 9, 0), inset=0.04, bevel=0.014)
    plate('Pectoral panel', mx([(0.26, 0.6), (0.4, 0.62), (0.49, 0.54), (0.48, 0.34), (0.3, 0.34)], s * 1.22), 0.02, A2, chest, (s * 0.012, -0.323, 0.0), (-6, s * 9, 0), inset=0.008, bevel=0.004)
    marker(chest, (s * 0.45, -0.325, 0.565), 0.09, 0.026, (-6, s * 9, s * -38))
    plate('Lower rib plate', mx(lower, s), 0.1, A2, chest, (0, -0.17, 0), (-4, s * 6, 0), inset=0.02)
    marker(chest, (s * 0.17, -0.275, -0.035), 0.085, 0.026, (-4, s * 6, s * 6))
    plate('Collar', mx([(0.1, 0.64), (0.5, 0.56), (0.52, 0.63), (0.3, 0.72), (0.13, 0.78)], s), 0.3, A2, chest, (0, 0.16, 0), inset=0.03)
    for k in range(3):
        box('Side vent', (0.08, 0.3, 0.05), A2, chest, (s * (0.47 - k * 0.04), 0.0, 0.2 - k * 0.075), (0, s * 18, 0), bevel=0.01)
    cyl('Neck cable', 0.03, 0.34, F, chest, (s * 0.15, -0.02, 0.76), 'z', rot=(0, s * 22, 0), seg=14, bevel=0.004)
plate('Sternum', [(-0.07, 0.68), (0.07, 0.68), (0.045, 0.5), (0.0, 0.47), (-0.045, 0.5)], 0.13, A2, chest, (0, -0.2, 0), (-6, 0, 0), inset=0.015)
box('Sternum light', (0.03, 0.012, 0.1), G, chest, (0, -0.338, 0.6), (-6, 0, 0), bevel=0)
cyl('Shoulder yoke', 0.09, 1.54, F, chest, (0, 0.02, 0.47), 'x')
plate('Back plate', [(-0.42, 0.66), (0.42, 0.66), (0.3, 0.02), (-0.3, 0.02)], 0.1, A, chest, (0, 0.32, 0), inset=0.03)
loft('Back pack', [dict(z=0.05, w=0.44, d=0.18, c=0.05), dict(z=0.38, w=0.6, d=0.24, c=0.06), dict(z=0.6, w=0.46, d=0.18, c=0.05)], A2, chest, (0, 0.36, 0))

# ---- core ----------------------------------------------------------------------------------
core = empty('core', chest, (0, -0.2, CZ), (-6, 0, 0))
cyl('Reactor seat', 0.235, 0.1, F, core, (0, 0.0, 0), 'y', seg=56)
cyl('Reactor well', 0.15, 0.02, VIS, core, (0, -0.045, 0), 'y', seg=48, bevel=0)
torus('Emitter seam', 0.2, 0.007, G, core, (0, -0.06, 0))
torus('Housing ring', 0.16, 0.026, T, core, (0, -0.07, 0))
for i in range(8):
    a = i * math.pi / 4
    box('Housing lug', (0.03, 0.03, 0.05), F, core, (0.16 * math.sin(a), -0.085, 0.16 * math.cos(a)), (0, -math.degrees(a), 0), bevel=0.004)
sphere('Reactor', 0.062, CORE, core, (0, -0.09, 0))
torus('Orbit ring 1', 0.105, 0.005, T, core, (0, -0.09, 0), rot=(24, 30, 0))
torus('Orbit ring 2', 0.118, 0.005, T, core, (0, -0.09, 0), rot=(-30, -40, 0))
torus('Orbit ring 3', 0.09, 0.004, T, core, (0, -0.09, 0), rot=(70, 10, 0))

# ---- helm ----------------------------------------------------------------------------------
helm = empty('helm', chest, (0, 0, 0.66))  # world z 3.81
cyl('Neck', 0.1, 0.26, F, helm, (0, 0.02, 0.02))
for z in (-0.04, 0.03, 0.1):
    torus('Neck ring', 0.105, 0.013, T if z == 0.03 else F, helm, (0, 0.02, z), 'z')
loft('Skull', [dict(z=0.1, w=0.25, d=0.3, c=0.07, y=0.02), dict(z=0.24, w=0.33, d=0.38, c=0.1, y=0.02), dict(z=0.42, w=0.34, d=0.4, c=0.12, y=0.03), dict(z=0.53, w=0.27, d=0.33, c=0.11, y=0.04), dict(z=0.585, w=0.14, d=0.2, c=0.05, y=0.05)], A, helm, bevel=0.02)
plate('Faceplate', [(-0.125, 0.33), (0.125, 0.33), (0.15, 0.22), (0.075, 0.07), (-0.075, 0.07), (-0.15, 0.22)], 0.06, A2, helm, (0, -0.15, 0), (-3, 0, 0), inset=0.02)
plate('Visor glass', [(-0.13, 0.345), (0.13, 0.345), (0.125, 0.285), (0.0, 0.235), (-0.125, 0.285)], 0.014, VIS, helm, (0, -0.208, 0), (-3, 0, 0), bevel=0.003)
seam(helm, [(-0.125, -0.228, 0.31), (0.0, -0.228, 0.262), (0.125, -0.228, 0.31)], width=0.028, depth=0.012)
plate('Brow', [(-0.15, 0.42), (0.15, 0.42), (0.14, 0.35), (0.0, 0.33), (-0.14, 0.35)], 0.05, A, helm, (0, -0.19, 0), (-10, 0, 0), inset=0.012)
plate('Chin', [(-0.07, 0.2), (0.07, 0.2), (0.05, 0.06), (-0.05, 0.06)], 0.04, A, helm, (0, -0.205, 0), (4, 0, 0), inset=0.012, bevel=0.006)
box('Crest', (0.07, 0.34, 0.07), A, helm, (0, 0.0, 0.565), (-10, 0, 0), bevel=0.02)
box('Crest light', (0.034, 0.012, 0.075), G, helm, (0, -0.203, 0.49), (-18, 0, 0), bevel=0)
for s in (1, -1):
    cyl('Ear drum', 0.075, 0.05, F, helm, (s * 0.18, 0.04, 0.28), 'x', seg=32)
    cyl('Ear cap', 0.045, 0.07, T, helm, (s * 0.185, 0.04, 0.28), 'x', seg=24)
    box('Cheek guard', (0.035, 0.24, 0.2), A, helm, (s * 0.165, -0.06, 0.18), (0, s * -8, s * -14), bevel=0.012)


# ---- one side: arm, leg, wing. Built once; the right side is the same build under a mirror. --
def build_side(tag, mirror):
    side_c = empty('chest_side_' + tag, chest, mirror=mirror)
    side_p = empty('pelvis_side_' + tag, pelvis, mirror=mirror)

    # shoulder
    sh = empty('shoulder_' + tag, side_c, (0.78, 0.0, 0.47))
    sphere('Shoulder ball', 0.15, F, sh)
    cyl('Shoulder collar', 0.16, 0.07, T, sh, (-0.1, 0, 0), 'x', seg=40)
    pa = empty('pauldron_' + tag, sh, (0.06, 0, 0.08), (-10, 12, 0))
    pa.scale = (1.55, 1.2, 1.2)
    plate('Pauldron', [(-0.2, 0.36), (0.3, 0.33), (0.42, 0.17), (0.39, -0.12), (0.1, -0.2), (-0.22, -0.04)], 0.54, A, pa, (0, 0.27, 0), inset=0.06, bevel=0.018)
    plate('Pauldron panel', [(-0.1, 0.28), (0.24, 0.26), (0.32, 0.14), (0.3, -0.06), (0.08, -0.12), (-0.12, 0.0)], 0.03, A2, pa, (0.0, -0.265, 0.0), inset=0.012, bevel=0.005)
    marker(pa, (0.17, -0.3, 0.17), 0.1, 0.028, (0, 6, 0))
    box('Pauldron liner', (0.4, 0.4, 0.07), A2, pa, (0.08, 0, -0.19), (0, 8, 0), bevel=0.02)
    seam(pa, [(-0.2, -0.275, -0.06), (0.1, -0.275, -0.215), (0.38, -0.275, -0.135)], width=0.014)
    bolts(pa, [(-0.07, 0.24), (0.21, 0.225), (0.265, -0.03)], -0.298, 0.011)

    # upper arm
    ua = empty('upperarm_' + tag, sh, (0.1, 0, -0.1), (0, -13, 0))
    cyl('Humerus', 0.075, 0.56, F, ua, (0, 0, -0.3))
    loft('Bicep shell', [dict(z=-0.08, w=0.25, d=0.29, c=0.06), dict(z=-0.3, w=0.3, d=0.34, c=0.07), dict(z=-0.5, w=0.23, d=0.27, c=0.06)], A, ua)
    plate('Bicep plate', [(-0.08, -0.1), (0.12, -0.1), (0.15, -0.3), (0.09, -0.46), (-0.07, -0.46), (-0.11, -0.3)], 0.04, A2, ua, (0, -0.15, 0), inset=0.012, bevel=0.006)
    marker(ua, (0.03, -0.196, -0.2), 0.07, 0.022)
    cyl('Arm piston', 0.022, 0.42, T, ua, (0, 0.17, -0.3), seg=14, bevel=0.003)
    cyl('Arm piston sleeve', 0.034, 0.2, F, ua, (0, 0.17, -0.2), seg=14, bevel=0.004)

    seam(ua, [(0.155, -0.1, -0.12), (0.19, -0.12, -0.3), (0.15, -0.1, -0.48)], width=0.01)
    stretch(ua, 1.2, 1.08)

    # forearm
    fa = empty('forearm_' + tag, ua, (0, 0, -0.72), (-14, 8, 0))
    joint('Elbow', fa, (0, 0, 0), 0.125, 0.3)
    cyl('Radius', 0.06, 0.5, F, fa, (0, 0, -0.33))
    loft('Gauntlet', [dict(z=-0.11, w=0.25, d=0.27, c=0.06), dict(z=-0.34, w=0.35, d=0.37, c=0.08), dict(z=-0.6, w=0.27, d=0.3, c=0.06)], A, fa)
    plate('Gauntlet plate', [(-0.09, -0.13), (0.09, -0.13), (0.13, -0.33), (0.09, -0.56), (-0.09, -0.56), (-0.13, -0.33)], 0.045, A, fa, (0, -0.165, 0), inset=0.014, bevel=0.006)
    seam(fa, [(0.115, -0.16, -0.14), (0.165, -0.2, -0.34), (0.125, -0.165, -0.57)], width=0.01)
    seam(fa, [(-0.115, -0.16, -0.14), (-0.165, -0.2, -0.34), (-0.125, -0.165, -0.57)], width=0.01)
    marker(fa, (0.02, -0.213, -0.4), 0.03, 0.06)
    plate('Gauntlet fin', [(0.0, 0.16), (0.11, 0.05), (0.09, -0.2), (0.0, -0.18)], 0.05, A2, fa, (0.2, 0.025, -0.34), inset=0.008, bevel=0.006)

    stretch(fa, 1.18, 1.24)

    # hand, closed fist
    hd = empty('hand_' + tag, fa, (0, 0, -0.78))
    hd.scale = (1.3, 1.3, 1.3)
    cyl('Wrist', 0.075, 0.07, T, hd, (0, 0, 0.02), seg=32)
    box('Palm', (0.21, 0.15, 0.17), A2, hd, (0, 0, -0.11), bevel=0.02)
    box('Knuckle guard', (0.23, 0.07, 0.07), A, hd, (0, -0.085, -0.05), (20, 0, 0), bevel=0.014)
    for i, x in enumerate((-0.078, -0.026, 0.026, 0.078)):
        box('Finger a', (0.046, 0.06, 0.12), F, hd, (x, -0.1, -0.135), bevel=0.01)
        box('Finger b', (0.046, 0.1, 0.05), F, hd, (x, -0.06, -0.215), bevel=0.01)
        cyl('Knuckle', 0.02, 0.05, T, hd, (x, -0.11, -0.075), 'x', seg=12, bevel=0.003)
    box('Thumb', (0.055, 0.13, 0.06), F, hd, (-0.11, -0.085, -0.12), (0, 0, -18), bevel=0.012)

    # thigh
    th = empty('thigh_' + tag, side_p, (0.4, 0, 0), (0, -10.5, 0))
    joint('Hip', th, (0.05, 0, 0), 0.16, 0.2)
    torus('Hip rim', 0.16, 0.018, T, th, (0.16, 0, 0), 'x')
    cyl('Femur', 0.085, 0.8, F, th, (0, 0, -0.48))
    loft('Thigh shell', [dict(z=-0.14, w=0.33, d=0.36, c=0.08), dict(z=-0.46, w=0.39, d=0.42, c=0.09), dict(z=-0.84, w=0.28, d=0.31, c=0.07)], A2, th)
    plate('Thigh plate', [(-0.16, -0.1), (0.1, -0.05), (0.2, -0.16), (0.21, -0.5), (0.13, -0.86), (-0.11, -0.86), (-0.17, -0.5)], 0.11, A, th, (0, -0.15, 0), inset=0.035, bevel=0.014)
    plate('Thigh panel', [(-0.08, -0.26), (0.11, -0.26), (0.13, -0.5), (0.07, -0.74), (-0.06, -0.74), (-0.1, -0.5)], 0.02, A2, th, (0, -0.258, 0), inset=0.008, bevel=0.004)
    plate('Thigh guard', [(-0.17, -0.52), (0.2, -0.47), (0.22, -0.76), (0.12, -0.9), (-0.11, -0.9), (-0.18, -0.74)], 0.05, A, th, (0, -0.25, 0), inset=0.018, bevel=0.01)
    seam(th, [(0.2, -0.28, -0.5), (0.215, -0.28, -0.74)], width=0.012)
    marker(th, (0.03, -0.268, -0.18), 0.1, 0.03, (0, 0, 0))
    bolts(th, [(-0.1, -0.16), (0.12, -0.2), (0.15, -0.52), (-0.12, -0.52), (0.08, -0.8), (-0.07, -0.8)], -0.262, 0.012, T)
    cyl('Thigh piston', 0.024, 0.46, T, th, (0.0, 0.2, -0.45), seg=14, bevel=0.003)

    stretch(th, 1.26, 1.14)

    # knee and shin
    kn = empty('knee_' + tag, th, (0, 0, -1.2), (0, 3, 0))
    joint('Knee', kn, (0, 0.02, 0), 0.125, 0.42)
    plate('Knee cap', [(-0.12, 0.12), (0.12, 0.12), (0.14, -0.02), (0.0, -0.18), (-0.14, -0.02)], 0.07, A, kn, (0, -0.16, 0), (-6, 0, 0), inset=0.02)
    cyl('Tibia', 0.075, 0.9, F, kn, (0, 0, -0.55))
    loft('Shin shell', [dict(z=-0.14, w=0.3, d=0.3, c=0.07), dict(z=-0.46, w=0.42, d=0.44, c=0.1, y=0.03), dict(z=-0.9, w=0.3, d=0.32, c=0.07), dict(z=-1.08, w=0.32, d=0.34, c=0.07)], A, kn)
    plate('Shin plate', [(-0.12, -0.2), (0.12, -0.2), (0.18, -0.5), (0.12, -0.98), (-0.12, -0.98), (-0.18, -0.5)], 0.08, A, kn, (0, -0.17, 0), inset=0.03, bevel=0.012)
    plate('Shin guard', [(-0.17, -0.12), (0.17, -0.12), (0.22, -0.3), (0.12, -0.4), (0.0, -0.46), (-0.12, -0.4), (-0.22, -0.3)], 0.07, A, kn, (0, -0.23, 0), (-3, 0, 0), inset=0.022, bevel=0.012)
    beam('Shin V', (0.19, -0.265, -0.4), (0.0, -0.275, -0.68), 0.05, 0.035, T, kn, bevel=0.006)
    beam('Shin V', (-0.19, -0.265, -0.4), (0.0, -0.275, -0.68), 0.05, 0.035, T, kn, bevel=0.006)
    box('Shin light', (0.07, 0.012, 0.022), G, kn, (0, -0.262, -0.78), bevel=0)
    marker(kn, (0, -0.258, -0.86), 0.03, 0.055)
    cyl('Calf drum', 0.06, 0.38, T, kn, (0, 0.08, -0.3), 'x', seg=32)
    for sx in (1, -1):
        cyl('Shin piston', 0.02, 0.5, T, kn, (sx * 0.2, 0.0, -0.72), seg=12, bevel=0.003)
        cyl('Shin piston sleeve', 0.032, 0.22, F, kn, (sx * 0.2, 0.0, -0.62), seg=12, bevel=0.004)
    bolts(kn, [(-0.09, -0.26), (0.09, -0.26), (-0.09, -0.93), (0.09, -0.93)], -0.252, 0.011, T)

    stretch(kn, 1.17, 1.1)

    # boot
    bt = empty('boot_' + tag, kn, (0, 0, -1.35), (0, 7.5, 0))
    joint('Ankle', bt, (0, 0.02, 0), 0.105, 0.42)
    loft('Foot', [dict(z=-0.29, w=0.36, d=0.74, c=0.07, y=-0.11), dict(z=-0.14, w=0.33, d=0.62, c=0.08, y=-0.08), dict(z=0.0, w=0.26, d=0.36, c=0.07, y=0.02)], A, bt, bevel=0.016)
    plate('Toe cap', [(-0.13, -0.05), (0.13, -0.05), (0.16, -0.27), (-0.16, -0.27)], 0.12, A2, bt, (0, -0.37, 0), (-28, 0, 0), inset=0.03)
    box('Heel block', (0.26, 0.2, 0.26), A2, bt, (0, 0.24, -0.16), bevel=0.03)
    box('Sole', (0.38, 0.78, 0.035), F, bt, (0, -0.11, -0.29), bevel=0.01)
    marker(bt, (0, -0.405, -0.1), 0.05, 0.022, (-28, 0, 0))

    # wing drive
    WR = Vector((1.02, 0.44, 1.16))
    wd = empty('wingdrive_' + tag, side_c)
    box('Wing mount', (0.2, 0.18, 0.2), F, wd, (0.26, 0.42, 0.42), bevel=0.03)
    beam('Wing arm', (0.26, 0.44, 0.42), tuple(WR), 0.13, 0.11, A, wd, bevel=0.02)
    spar = [(-0.5, -0.56), (-0.33, -0.22), (-0.06, 0.1), (0.42, 0.44), (0.8, 0.7), (1.28, 0.92), (1.36, 0.8), (0.95, 0.56), (0.9, 0.44), (0.6, 0.3), (0.5, 0.14), (0.24, 0.02), (0.14, -0.22), (-0.2, -0.56)]
    plate('Wing spar', spar, 0.07, T, wd, (WR.x, WR.y - 0.07, WR.z), inset=0.02, bevel=0.01)
    plate('Spar cover', [(0.3, 0.28), (0.78, 0.6), (1.2, 0.8), (1.22, 0.74), (0.9, 0.5), (0.5, 0.26)], 0.03, A, wd, (WR.x, WR.y - 0.14, WR.z), inset=0.008, bevel=0.005)
    for (dx, dz, r) in ((0.0, 0.0, 0.17), (-0.21, -0.15, 0.1), (0.03, -0.28, 0.09), (-0.2, -0.36, 0.06)):
        p = (WR.x + dx, WR.y - 0.17, WR.z + dz)
        cyl('Rotor', r, 0.1, T, wd, p, 'y', seg=48, bevel=0.01)
        cyl('Rotor inner', r * 0.68, 0.13, F, wd, p, 'y', seg=40)
        cyl('Rotor hub', r * 0.4, 0.16, T, wd, p, 'y', seg=32)
        cyl('Rotor pin', r * 0.16, 0.19, F, wd, p, 'y', seg=6, bevel=0.003)

    # nine blades fanned from the rotor
    n = 9
    for i in range(n):
        k = i / (n - 1)
        ang = 6 - k * 86  # degrees above the outward horizontal
        ln = 2.6 + 0.4 * math.sin(k * math.pi) + 0.5 * k
        w = 0.25 + 0.04 * k
        bl = empty('blade_%s_%d' % (tag, i + 1), wd, (WR.x, WR.y - 0.02 + i * 0.03, WR.z), (0, -ang, 0))
        plate('Blade', [(0.0, -w * 0.5), (ln * 0.26, -w), (ln, -w * 1.35), (ln * 0.985, -w * 0.9), (ln * 0.9, w * 0.3), (0.0, w * 0.5)], 0.026, BL if i % 2 else A2, bl, inset=0.012, bevel=0.005)
        plate('Blade root', [(0.05, -w * 0.72), (ln * 0.27, -w * 1.12), (ln * 0.34, -w * 0.3), (0.07, w * 0.62)], 0.018, A, bl, (0, -0.026, 0), inset=0.008, bevel=0.004)
        seam(bl, [(ln * 0.3, -0.03, -w * 1.0), (ln * 0.975, -0.03, -w * 1.31)], width=0.026, depth=0.012)
        bolts(bl, [(ln * 0.1, 0.0), (ln * 0.2, -w * 0.3)], -0.046, 0.01, T)


for s in (1, -1):
    bolts(chest, [(s * 0.1, 0.56), (s * 0.44, 0.3), (s * 0.3, 0.12)], -0.31, 0.012, T)
    for k in range(4):
        box('Pec vent', (0.1, 0.02, 0.014), F, chest, (s * 0.37, -0.318 + 0.0, 0.3 - k * 0.032), (-6, s * 9, 0), bevel=0.002)
    cyl('Hip cable', 0.02, 0.36, F, pelvis, (s * 0.2, -0.05, 0.02), 'z', rot=(0, s * 40, 0), seg=12, bevel=0.003)
build_side('L', False)
build_side('R', True)
bpy.context.view_layer.update()
_low = min((ob.matrix_world @ Vector(c)).z for ob in ROOT.objects if ob.type == 'MESH' for c in ob.bound_box)
pelvis.location.z -= _low

# ------------------------------------------------------------------------------------------
# stage: floor, haze, lights, camera
# ------------------------------------------------------------------------------------------
def floor():
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=120)
    m = bpy.data.materials.new('Floor')
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (0.012, 0.013, 0.016, 1)
    n = nt.nodes.new('ShaderNodeTexNoise')
    n.inputs['Scale'].default_value = 1.4
    n.inputs['Detail'].default_value = 10
    n.inputs['Roughness'].default_value = 0.7
    mr = nt.nodes.new('ShaderNodeMapRange')
    mr.inputs['From Min'].default_value = 0.35
    mr.inputs['From Max'].default_value = 0.7
    mr.inputs['To Min'].default_value = 0.22
    mr.inputs['To Max'].default_value = 0.75
    nt.links.new(n.outputs['Fac'], mr.inputs['Value'])
    nt.links.new(mr.outputs['Result'], b.inputs['Roughness'])
    bp = nt.nodes.new('ShaderNodeBump')
    bp.inputs['Strength'].default_value = 0.4
    n2 = nt.nodes.new('ShaderNodeTexNoise')
    n2.inputs['Scale'].default_value = 30
    n2.inputs['Detail'].default_value = 8
    nt.links.new(n2.outputs['Fac'], bp.inputs['Height'])
    nt.links.new(bp.outputs['Normal'], b.inputs['Normal'])
    return finish('Floor', bm, m, None, bevel=0)


floor()

# thin haze so the lights and the seams have air to glow in
bm = bmesh.new()
bmesh.ops.create_cube(bm, size=1.0)
bmesh.ops.scale(bm, vec=(60, 36, 14), verts=bm.verts[:])
hz = bpy.data.materials.new('Haze')
hz.use_nodes = True
nt = hz.node_tree
nt.nodes.remove(nt.nodes['Principled BSDF'])
vol = nt.nodes.new('ShaderNodeVolumeScatter')
vol.inputs['Color'].default_value = (0.75, 0.85, 1.0, 1)
vol.inputs['Density'].default_value = 0.0006
vol.inputs['Anisotropy'].default_value = 0.35
nt.links.new(vol.outputs['Volume'], nt.nodes['Material Output'].inputs['Volume'])
haze = finish('Haze', bm, hz, None, (0, 4, 7), bevel=0)
haze.visible_shadow = False

world = bpy.data.worlds.new('World')
world.use_nodes = True
# Blender's own studio environment gives the metal something to reflect; the camera sees black instead
wn, wl = world.node_tree.nodes, world.node_tree.links
bg = wn['Background']
hdr = os.path.join(bpy.utils.resource_path('LOCAL'), 'datafiles', 'studiolights', 'world', 'city.exr')
if os.path.exists(hdr):
    env = wn.new('ShaderNodeTexEnvironment')
    env.image = bpy.data.images.load(hdr)
    hsv = wn.new('ShaderNodeHueSaturation')
    hsv.inputs['Saturation'].default_value = 0.35
    wl.new(env.outputs['Color'], hsv.inputs['Color'])
    lp = wn.new('ShaderNodeLightPath')
    mixw = wn.new('ShaderNodeMixRGB')
    mixw.inputs['Color2'].default_value = (0.002, 0.003, 0.006, 1)
    wl.new(lp.outputs['Is Camera Ray'], mixw.inputs['Fac'])
    wl.new(hsv.outputs['Color'], mixw.inputs['Color1'])
    wl.new(mixw.outputs['Color'], bg.inputs['Color'])
    bg.inputs['Strength'].default_value = 0.5
else:
    bg.inputs['Color'].default_value = (0.004, 0.006, 0.01, 1)
scene.world = world


def area(name, loc, target, size, power, color=(1, 1, 1), size_y=None):
    d = bpy.data.lights.new(name, 'AREA')
    d.energy = power
    d.color = color
    d.size = size
    if size_y:
        d.shape = 'RECTANGLE'
        d.size_y = size_y
    o = bpy.data.objects.new(name, d)
    ROOT.objects.link(o)
    o.location = loc
    o.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    return o


area('Key', (-4.5, -7.5, 7.0), (0, 0, 2.6), 5.0, 650, (1.0, 0.97, 0.94))
area('Fill', (5.5, -7.0, 2.2), (0, 0, 2.2), 6.0, 160, (0.75, 0.86, 1.0))
area('Rim left', (-5.5, 4.5, 5.0), (0, 0, 2.6), 1.2, 6000, (0.55, 0.8, 1.0), size_y=6.0)
area('Rim right', (5.5, 4.5, 5.0), (0, 0, 2.6), 1.2, 6000, (0.55, 0.8, 1.0), size_y=6.0)
area('Top', (0, 0.5, 8.5), (0, -0.2, 3.0), 3.0, 650, (0.9, 0.95, 1.0))
area('Low kicker', (0, -5.5, 0.4), (0, 0, 1.6), 3.0, 90, (1.0, 0.9, 0.8))
area('Back glow', (0, 6.5, 2.4), (0, 0, 2.6), 3.5, 900, (0.2, 0.55, 1.0))

# soft cards the armour can mirror: one broad, two tall strips
area('Front soft', (0, -12, 6.5), (0, 0, 2.6), 9.0, 220, (0.9, 0.95, 1.0))
area('Strip left', (-3.6, -6.0, 3.0), (0, 0, 2.6), 0.5, 380, (0.8, 0.9, 1.0), size_y=7.0)
area('Strip right', (3.6, -6.0, 3.0), (0, 0, 2.6), 0.5, 380, (1.0, 0.92, 0.85), size_y=7.0)

# back wall and low smoke on the floor
wall_m = bpy.data.materials.new('Wall')
wall_m.use_nodes = True
wall_m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.006, 0.008, 0.012, 1)
wall_m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.9
bm = bmesh.new()
bmesh.ops.create_cube(bm, size=1.0)
bmesh.ops.scale(bm, vec=(160, 0.2, 60), verts=bm.verts[:])
finish('Wall', bm, wall_m, None, (0, 22, 28), bevel=0)

bm = bmesh.new()
bmesh.ops.create_cube(bm, size=1.0)
bmesh.ops.scale(bm, vec=(60, 34, 1.0), verts=bm.verts[:])
sm = bpy.data.materials.new('Floor smoke')
sm.use_nodes = True
snt = sm.node_tree
snt.nodes.remove(snt.nodes['Principled BSDF'])
sv = snt.nodes.new('ShaderNodeVolumeScatter')
sv.inputs['Color'].default_value = (0.7, 0.8, 1.0, 1)
sv.inputs['Anisotropy'].default_value = 0.2
stc = snt.nodes.new('ShaderNodeTexCoord')
sn = snt.nodes.new('ShaderNodeTexNoise')
sn.inputs['Scale'].default_value = 0.35
sn.inputs['Detail'].default_value = 6.0
sn.inputs['Roughness'].default_value = 0.6
snt.links.new(stc.outputs['Object'], sn.inputs['Vector'])
grad = snt.nodes.new('ShaderNodeSeparateXYZ')
snt.links.new(stc.outputs['Generated'], grad.inputs['Vector'])
fall = snt.nodes.new('ShaderNodeMapRange')  # thick at the floor, gone at the top of the box
fall.inputs['From Min'].default_value = 0.0
fall.inputs['From Max'].default_value = 1.0
fall.inputs['To Min'].default_value = 1.0
fall.inputs['To Max'].default_value = 0.0
snt.links.new(grad.outputs['Z'], fall.inputs['Value'])
dens = snt.nodes.new('ShaderNodeMapRange')
dens.inputs['From Min'].default_value = 0.42
dens.inputs['From Max'].default_value = 0.75
dens.inputs['To Min'].default_value = 0.0
dens.inputs['To Max'].default_value = 0.03
snt.links.new(sn.outputs['Fac'], dens.inputs['Value'])
sm_mul = snt.nodes.new('ShaderNodeMath')
sm_mul.operation = 'MULTIPLY'
snt.links.new(dens.outputs['Result'], sm_mul.inputs[0])
snt.links.new(fall.outputs['Result'], sm_mul.inputs[1])
snt.links.new(sm_mul.outputs[0], sv.inputs['Density'])
snt.links.new(sv.outputs['Volume'], snt.nodes['Material Output'].inputs['Volume'])
smoke = finish('Floor smoke', bm, sm, None, (0, 5, 0.51), bevel=0)
smoke.visible_shadow = False

cl = bpy.data.lights.new('Core light', 'POINT')
cl.energy = 9
cl.color = (0.3, 0.85, 1.0)
cl.shadow_soft_size = 0.06
co = bpy.data.objects.new('Core light', cl)
ROOT.objects.link(co)
co.parent = core
co.location = (0, -0.22, 0)

cam_d = bpy.data.cameras.new('Camera')
cam = bpy.data.objects.new('Camera', cam_d)
ROOT.objects.link(cam)
VIEWS = {
    'hero': ((0, -11.5, 0.95), (0, 0, 2.33), 72),
    'three': ((6.5, -11.5, 2.3), (0, 0, 2.3), 85),
    'bust': ((1.6, -6.5, 3.0), (0, 0, 3.45), 85),
}
loc, tgt, lens = VIEWS[CAM]
cam.location = loc
cam.rotation_euler = (Vector(tgt) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
cam_d.lens = lens
cam_d.clip_end = 200
scene.camera = cam

# ------------------------------------------------------------------------------------------
# render
# ------------------------------------------------------------------------------------------
scene.render.engine = 'CYCLES'
scene.render.resolution_x = 1216
scene.render.resolution_y = 1600
scene.render.resolution_percentage = SCALE
scene.render.image_settings.file_format = 'PNG'
cy = scene.cycles
cy.samples = SAMPLES
cy.use_adaptive_sampling = True
cy.adaptive_threshold = 0.02
cy.use_denoising = True
cy.max_bounces = 8
cy.volume_bounces = 0
cy.sample_clamp_indirect = 8.0
if DEVICE == 'GPU':
    prefs = bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type = 'OPTIX'
    prefs.get_devices()
    for d in prefs.devices:
        d.use = d.type == 'OPTIX'
    cy.device = 'GPU'
else:
    cy.device = 'CPU'
scene.view_settings.view_transform = 'AgX'
try:
    scene.view_settings.look = 'AgX - Medium High Contrast'
except Exception as e:
    print('look not set:', e)
scene.view_settings.exposure = -0.25

# bloom on the lights, done in Blender's compositor
try:
    ng = bpy.data.node_groups.new('Sentinel comp', 'CompositorNodeTree')
    scene.compositing_node_group = ng
    rl = ng.nodes.new('CompositorNodeRLayers')
    gl = ng.nodes.new('CompositorNodeGlare')
    gl.inputs['Type'].default_value = 'Bloom'
    gl.inputs['Threshold'].default_value = 2.0
    gl.inputs['Strength'].default_value = 0.35
    gl.inputs['Size'].default_value = 0.55
    ng.interface.new_socket('Image', in_out='OUTPUT', socket_type='NodeSocketColor')
    out = ng.nodes.new('NodeGroupOutput')
    ng.links.new(rl.outputs['Image'], gl.inputs['Image'])
    ng.links.new(gl.outputs['Image'], out.inputs['Image'])
    scene.render.use_compositing = True
except Exception as e:
    print('compositor not set:', e)

os.makedirs(os.path.join(HERE, 'renders'), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, 'kyvern_sentinel.blend'))
print('SAVED blend; objects:', len(bpy.data.objects))
if '--norender' not in ARGV:
    scene.render.filepath = os.path.join(HERE, 'renders', NAME + '.png')
    bpy.ops.render.render(write_still=True)
    print('RENDERED', scene.render.filepath)
