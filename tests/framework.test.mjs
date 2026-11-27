import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Rig } from '../src/framework/rig.js';
import { Forms } from '../src/framework/forms.js';
import { Tour } from '../src/framework/tour.js';
import { buildSentinel, SECTIONS } from '../src/sentinel/model.js';
import { ROLES, LINES, FORMS, STATES, CHAPTERS } from '../src/sentinel/config.js';

const mats = Object.fromEntries(Object.keys(ROLES).map((r) => [r, new THREE.MeshStandardMaterial()]));
const build = () => {
  const rig = new Rig();
  const model = buildSentinel(rig, mats);
  return { rig, model };
};
const settle = (rig, forms) => {
  for (let i = 0; i < 240; i++) {
    forms?.update(1 / 60);
    rig.update(1 / 60);
  }
};

test('the Sentinel is split joint by joint, and every part has pieces', () => {
  const { rig } = build();
  assert.equal(rig.parts.size, 26);
  for (const p of rig.parts.values()) {
    assert.ok(p.subs.length >= 2, `${p.id} has pieces`);
    assert.ok(rig.sections.has(p.section), `${p.id} belongs to a section`);
    assert.ok(p.note, `${p.id} has a note`);
  }
  for (const s of SECTIONS) assert.ok(rig.sections.get(s.id).parts.length > 0, `${s.id} has parts`);
  for (const name of ['thigh', 'knee', 'shin', 'boot', 'shoulder', 'upperarm', 'forearm', 'hand', 'wingdrive', 'blades']) {
    assert.ok(rig.get(`${name}_l`) && rig.get(`${name}_r`), `${name} exists on both sides`);
  }
  assert.equal(rig.get('shin_l').parent, 'knee_l');
});

test('left and right mirror each other', () => {
  const { rig } = build();
  rig.root.updateMatrixWorld(true);
  const l = rig.get('boot_l').body.getWorldPosition(new THREE.Vector3());
  const r = rig.get('boot_r').body.getWorldPosition(new THREE.Vector3());
  assert.ok(l.x > 0.2);
  assert.ok(Math.abs(l.x + r.x) < 1e-6 && Math.abs(l.y - r.y) < 1e-6);
});

test('opening a part spreads only that part, and closing puts everything back', () => {
  const { rig } = build();
  rig.openPart('thigh_l');
  settle(rig);
  const thigh = rig.get('thigh_l');
  assert.ok(thigh.sub > 0.99);
  assert.ok(thigh.subs.some((s) => s.object.position.distanceTo(s.home) > 0.2));
  assert.ok(rig.get('helm').sub < 0.01 && rig.get('helm').sep < 0.01);
  rig.closeAll();
  settle(rig);
  for (const p of rig.parts.values()) {
    assert.ok(p.sep < 0.01 && p.sub < 0.01);
    for (const s of p.subs) assert.ok(s.object.position.distanceTo(s.home) < 0.01);
  }
  assert.ok(rig.lift < 0.01);
});

test('teardown lifts the robot so the legs never go through the floor', () => {
  const { rig } = build();
  rig.teardown(1);
  settle(rig);
  assert.ok(rig.isOpen());
  assert.ok(rig.lift > 0.9, `lift ${rig.lift}`);
  const chain = ['thigh_l', 'knee_l', 'shin_l', 'boot_l'].reduce((s, id) => s + rig.get(id).explode.y, 0);
  assert.ok(Math.abs(rig.lift + chain) < 0.02);
});

test('forms only name joints that exist, and a form change arrives', () => {
  const { rig } = build();
  for (const [id, f] of Object.entries(FORMS)) {
    for (const joint of Object.keys(f.joints || {})) assert.ok(rig.parts.has(joint), `${id}: ${joint}`);
    for (const key of Object.keys(FORMS.sentinel.params)) assert.equal(typeof f.params[key], 'number', `${id}.${key}`);
  }
  const forms = new Forms(rig, FORMS, 'sentinel');
  assert.equal(forms.set('flight'), true);
  assert.ok(forms.busy);
  settle(rig, forms);
  assert.ok(!forms.busy);
  assert.equal(forms.params.fanTop, FORMS.flight.params.fanTop);
  assert.ok(Math.abs(forms.height - FORMS.flight.height) < 1e-9);
  assert.equal(forms.set('flight'), false);
});

test('wings fold away and spread again', () => {
  const { rig, model } = build();
  const forms = new Forms(rig, FORMS, 'sentinel');
  const p = FORMS.sentinel.params;
  model.wings(0, p.fanTop, p.fanBottom, 0, forms);
  const folded = model.feathers[0].map((b) => [b.rotation.z, b.scale.x]);
  assert.ok(folded.every(([, s]) => s < 0.3), 'blades are drawn in');
  assert.ok(forms.add.get('wingdrive_l')[2] < -1.5, 'arm is swung down');
  forms.add.clear();
  model.wings(1, p.fanTop, p.fanBottom, 0, forms);
  const open = model.feathers[0];
  assert.ok(open.every((b) => Math.abs(b.scale.x - 1) < 1e-9));
  assert.ok(Math.abs(open[0].rotation.z - (p.fanTop * Math.PI) / 180) < 0.02);
  assert.ok(Math.abs(forms.add.get('wingdrive_l')[2]) < 1e-9);
  // half way: the top blade leads the bottom one
  model.wings(0.6, p.fanTop, p.fanBottom, 0, forms);
  assert.ok(open[0].scale.x > open[open.length - 1].scale.x);
});

test('every colour line paints every role, and chapters point at real things', () => {
  for (const l of LINES) for (const role of ['armor', 'armor2', 'frame', 'trim', 'glow', 'core', 'thrust', 'mark']) assert.match(l.roles[role], /^#[0-9a-f]{6}$/i, `${l.id}.${role}`);
  assert.equal(new Set(LINES.map((l) => l.id)).size, LINES.length);
  for (const c of CHAPTERS) {
    if (c.section) assert.ok(SECTIONS.some((s) => s.id === c.section), c.id);
    else assert.ok(c.label && c.lines.length, c.id);
    if (c.form) assert.ok(FORMS[c.form], c.id);
  }
  assert.ok(STATES.idle && STATES.thinking);
});

test('the tour plays chapters in order and hands back at the end', () => {
  const log = [];
  const chapters = [
    { id: 'a', label: 'A', lines: ['one', 'two'], seconds: 3 },
    { id: 'b', label: 'B', lines: ['three'], seconds: 2 },
  ];
  const tour = new Tour(chapters, {
    begin: (c) => log.push(`begin ${c.id}`),
    line: (c, i) => log.push(`${c.id}:${c.lines[i]}`),
    end: (c, more) => log.push(`end ${c.id} ${more}`),
    progress: () => {},
  });
  tour.playAll();
  for (let i = 0; i < 400 && tour.active; i++) tour.update(1 / 60);
  assert.deepEqual(log, ['begin a', 'a:one', 'a:two', 'end a true', 'begin b', 'b:three', 'end b false']);
  tour.play('b');
  tour.stop();
  assert.equal(tour.active, null);
});
