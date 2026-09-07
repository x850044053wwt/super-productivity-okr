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

test('fixed two-month periods use local calendar months and include the year', () => {
  const { periodForDate } = require('./model');
  assert.equal(periodForDate(new Date(2026, 0, 1)), '2026-01');
  assert.equal(periodForDate(new Date(2026, 1, 28)), '2026-01');
  assert.equal(periodForDate(new Date(2026, 2, 1)), '2026-03');
  assert.equal(periodForDate(new Date(2026, 11, 31)), '2026-11');
  assert.equal(periodForDate(new Date(2027, 0, 1)), '2027-01');
});

test('period operations isolate objectives, key results and ordering across years', () => {
  const { objectivesForPeriod } = require('./model');
  let d = empty();
  for (const [id, periodId] of [
    ['a', '2026-01'],
    ['other', '2027-01'],
    ['b', '2026-01'],
  ]) {
    d = apply(d, { type: 'addObjective', id, title: id, periodId });
  }
  d = apply(d, {
    type: 'addKeyResult',
    objectiveId: 'other',
    id: 'kr',
    title: 'Keep me',
    periodId: '2027-01',
  });
  const other = JSON.stringify(d.objectives.find((o) => o.id === 'other'));
  d = apply(d, {
    type: 'moveObjective',
    id: 'b',
    beforeId: 'a',
    periodId: '2026-01',
  });
  assert.deepEqual(
    objectivesForPeriod(d, '2026-01').map((o) => o.id),
    ['b', 'a'],
  );
  d = apply(d, {
    type: 'deleteKeyResult',
    objectiveId: 'other',
    id: 'kr',
    periodId: '2026-01',
  });
  d = apply(d, { type: 'deleteObjective', id: 'other', periodId: '2026-01' });
  assert.equal(JSON.stringify(d.objectives.find((o) => o.id === 'other')), other);
  const before = JSON.stringify(d);
  d = apply(d, {
    type: 'moveObjective',
    id: 'a',
    beforeId: 'other',
    periodId: '2026-01',
  });
  assert.equal(JSON.stringify(d), before);
  assert.deepEqual(parse(JSON.stringify(d)), d);
});

test('legacy data stays unassigned until explicitly assigned, without duplicating or losing KRs', () => {
  const { objectivesForPeriod } = require('./model');
  const legacy = kr(add(empty(), 'legacy'), 'legacy', 'kr');
  let d = parse(JSON.stringify(legacy));
  assert.deepEqual(d, legacy);
  assert.equal(objectivesForPeriod(d, '2026-09').length, 0);
  d = apply(d, { type: 'assignUnassigned', periodId: '2026-09' });
  assert.equal(d.objectives[0].periodId, '2026-09');
  assert.equal(d.objectives[0].keyResults[0].id, 'kr');
  assert.deepEqual(apply(d, { type: 'assignUnassigned', periodId: '2027-01' }), d);
  assert.equal(legacy.objectives[0].periodId, undefined);
});

test('invalid periods are rejected while optional legacy period fields remain readable', () => {
  for (const periodId of ['2026-02', '2026-13', '2026-1', '', null, 1]) {
    const raw = {
      version: 1,
      objectives: [{ id: 'a', title: 'A', keyResults: [], periodId }],
    };
    assert.throws(() => parse(JSON.stringify(raw)));
  }
});

test('shifting periods crosses year boundaries and labels use the two calendar months', () => {
  const { shiftPeriod, periodMonths, isPeriod } = require('./model');
  assert.equal(shiftPeriod('2026-11', 1), '2027-01');
  assert.equal(shiftPeriod('2026-01', -1), '2025-11');
  assert.equal(shiftPeriod('2026-05', 3), '2026-11');
  assert.deepEqual(
    periodMonths('2026-11').map((d) => [d.getFullYear(), d.getMonth()]),
    [
      [2026, 10],
      [2026, 11],
    ],
  );
  assert.equal(isPeriod('2026-09'), true);
  assert.equal(isPeriod('2026-10'), false);
});

test('an objective can be carried over to another period with its key results and only from its own period', () => {
  const { objectivesForPeriod, unassignedObjectives } = require('./model');
  let d = apply(empty(), {
    type: 'addObjective',
    id: 'a',
    title: 'A',
    periodId: '2026-09',
  });
  d = apply(d, {
    type: 'addKeyResult',
    objectiveId: 'a',
    id: 'kr',
    title: 'K',
    periodId: '2026-09',
  });
  const wrongScope = apply(d, {
    type: 'setObjectivePeriod',
    id: 'a',
    periodId: '2026-07',
    toPeriodId: '2026-11',
  });
  assert.equal(wrongScope, d);
  assert.equal(
    apply(d, {
      type: 'setObjectivePeriod',
      id: 'a',
      periodId: '2026-09',
      toPeriodId: '2026-10',
    }),
    d,
  );
  const moved = apply(d, {
    type: 'setObjectivePeriod',
    id: 'a',
    periodId: '2026-09',
    toPeriodId: '2026-11',
  });
  assert.equal(objectivesForPeriod(moved, '2026-09').length, 0);
  assert.deepEqual(
    objectivesForPeriod(moved, '2026-11')[0].keyResults.map((k) => k.id),
    ['kr'],
  );
  assert.equal(objectivesForPeriod(d, '2026-09').length, 1, 'input must stay immutable');
  assert.equal(unassignedObjectives(moved).length, 0);
  assert.equal(
    apply(d, { type: 'addObjective', id: 'x', title: 'X', periodId: 'bad' }),
    d,
  );
});

test('a past objective can be self-scored 0–100 with one comment, only from its own period', () => {
  const { isPastPeriod } = require('./model');
  let d = apply(empty(), {
    type: 'addObjective',
    id: 'a',
    title: 'A',
    periodId: '2026-07',
  });
  const review = (patch) =>
    apply(d, { type: 'reviewObjective', id: 'a', periodId: '2026-07', ...patch });
  for (const bad of [
    { score: 101, comment: '' },
    { score: -1, comment: '' },
    { score: 50.5, comment: '' },
    { score: '50', comment: '' },
    { score: 50 },
    { score: 50, comment: '', periodId: '2026-09' },
  ]) {
    assert.equal(review(bad), d);
  }
  d = review({ score: 70, comment: '  Shipped late but complete.  ' });
  assert.deepEqual(d.objectives[0].review, {
    score: 70,
    comment: 'Shipped late but complete.',
  });
  d = review({ score: 0, comment: '' });
  assert.deepEqual(d.objectives[0].review, { score: 0, comment: '' });
  assert.deepEqual(parse(JSON.stringify(d)), d);
  assert.equal(
    parse(JSON.stringify(d)).objectives[0].keyResults.length,
    0,
    'review must not disturb key results',
  );
  for (const bad of [{ score: 100 }, { score: 'x', comment: '' }, null, 5]) {
    const raw = {
      version: 1,
      objectives: [{ id: 'a', title: 'A', keyResults: [], review: bad }],
    };
    assert.throws(() => parse(JSON.stringify(raw)));
  }
  assert.equal(isPastPeriod('2026-07', new Date(2026, 8, 7)), true);
  assert.equal(isPastPeriod('2026-09', new Date(2026, 8, 7)), false);
  assert.equal(isPastPeriod('2026-11', new Date(2026, 8, 7)), false);
});
