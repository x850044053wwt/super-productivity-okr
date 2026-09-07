const { test } = require('node:test');
const assert = require('node:assert/strict');
const { empty, parse, apply } = require('./model');
const add = (d, id) => apply(d, { type: 'addObjective', id, title: ` ${id} ` });
const kr = (d, objectiveId, id) =>
  apply(d, { type: 'addKeyResult', objectiveId, id, title: id });

test('O and KR lifecycle survives JSON serialization, with independent sibling ordering', () => {
  let d = add(add(empty(), 'a'), 'b');
  d = kr(kr(kr(d, 'a', 'x'), 'a', 'y'), 'b', 'z');
  const before = JSON.stringify(d);
  const reordered = apply(d, {
    type: 'moveKeyResult',
    objectiveId: 'a',
    id: 'y',
    beforeId: 'x',
  });
  assert.equal(JSON.stringify(d), before, 'input must stay immutable');
  d = apply(reordered, { type: 'moveObjective', id: 'b', beforeId: 'a' });
  d = parse(JSON.stringify(d));
  assert.deepEqual(
    d.objectives.map((o) => o.id),
    ['b', 'a'],
  );
  assert.deepEqual(
    d.objectives[1].keyResults.map((k) => k.id),
    ['y', 'x'],
  );
  assert.deepEqual(
    d.objectives[0].keyResults.map((k) => k.id),
    ['z'],
  );
  d = apply(d, { type: 'deleteKeyResult', objectiveId: 'a', id: 'y' });
  assert.deepEqual(
    d.objectives[1].keyResults.map((k) => k.id),
    ['x'],
  );
  d = apply(d, { type: 'deleteObjective', id: 'a' });
  assert.deepEqual(
    d.objectives.map((o) => o.id),
    ['b'],
  );
  assert.equal(JSON.stringify(d).includes('"x"'), false);
});

test('empty titles, duplicate commands and stale targets do not create phantom entries', () => {
  const d = add(empty(), 'a');
  assert.deepEqual(add(d, 'a'), d);
  assert.deepEqual(apply(d, { type: 'addObjective', id: 'b', title: '  ' }), d);
  assert.deepEqual(kr(d, 'deleted', 'x'), d);
  assert.deepEqual(apply(d, { type: 'moveObjective', id: 'a', beforeId: 'missing' }), d);
});

test('moves retain newly received siblings and can move to the end', () => {
  const d = add(add(add(empty(), 'a'), 'b'), 'remote');
  const moved = apply(d, { type: 'moveObjective', id: 'a', beforeId: null });
  assert.deepEqual(
    moved.objectives.map((o) => o.id),
    ['b', 'remote', 'a'],
  );
});

test('missing storage starts empty; corrupt and future documents are rejected, not overwritten', () => {
  assert.deepEqual(parse(null), empty());
  for (const raw of [
    '{',
    '{}',
    '{"version":2,"objectives":[]}',
    '{"version":1,"objectives":[null]}',
  ]) {
    assert.throws(() => parse(raw));
  }
  const d = add(empty(), 'a');
  d.objectives.push(d.objectives[0]);
  assert.throws(() => parse(JSON.stringify(d)));
});
