import test from 'node:test';
import assert from 'node:assert/strict';
import { riderJourney, readRoutine, writeRoutine, routineKey } from '../src/journey.mjs';

const ride = (id, start, end) => ({ id, started_at: start, ended_at: end, distance_km: 10 });
test('Seoul week stamps count completed days once and exclude future and active rides', () => {
  const history = [
    ride('sun', '2026-11-15T14:00:00Z', '2026-11-15T14:30:00Z'),
    ride('mon', '2026-11-15T15:00:00Z', '2026-11-15T16:00:00Z'),
    ride('tue', '2026-11-16T15:00:00Z', '2026-11-16T16:00:00Z'),
    ride('tue', '2026-11-16T15:00:00Z', '2026-11-16T16:00:00Z'),
    ride('active', '2026-11-17T01:00:00Z', null),
    ride('future', '2026-11-19T01:00:00Z', '2026-11-19T02:00:00Z'),
  ];
  const before = JSON.stringify(history);
  const result = riderJourney(history, Date.parse('2026-11-17T03:00:00Z'));
  assert.equal(result.start, '2026-11-16');
  assert.equal(result.end, '2026-11-22');
  assert.equal(result.today, '2026-11-17');
  assert.equal(result.weekDays, 2);
  assert.equal(result.weekKm, 20);
  assert.equal(result.progress.activeDays, 3);
  assert.equal(result.weekXp, 65);
  assert.equal(result.days[1].today, true);
  assert.equal(result.days[2].future, true);
  assert.equal(result.nextBadge.id, 'seven');
  assert.equal(result.nextBadge.remaining, 4);
  assert.equal(JSON.stringify(history), before);
});
test('year boundary and empty histories have seven accurate, empty stamps', () => {
  const result = riderJourney(null, Date.parse('2027-01-01T01:00:00Z'));
  assert.equal(result.start, '2026-12-28');
  assert.equal(result.end, '2027-01-03');
  assert.equal(result.days.length, 7);
  assert.equal(result.weekDays, 0);
  assert.equal(result.progress.xp, 0);
  assert.equal(result.nextBadge.remaining, 1);
});
test('routine checks are isolated by account and day, survive reload and can be undone', () => {
  const data = new Map();
  const storage = { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) };
  assert.equal(writeRoutine(storage, 'a', '2026-11-17', { check: true, rest: true }), true);
  assert.deepEqual(readRoutine(storage, 'a', '2026-11-17'), { check: true, rest: true });
  assert.deepEqual(readRoutine(storage, 'b', '2026-11-17'), { check: false, rest: false });
  assert.deepEqual(readRoutine(storage, 'a', '2026-11-18'), { check: false, rest: false });
  writeRoutine(storage, 'a', '2026-11-17', { check: false, rest: true });
  assert.deepEqual(readRoutine(storage, 'a', '2026-11-17'), { check: false, rest: true });
  writeRoutine(storage, 'a', '2026-12-01', { check: true });
  assert.equal(Object.keys(JSON.parse(data.get(routineKey('a')))).length, 1);
  data.set(routineKey('a'), 'broken json');
  assert.deepEqual(readRoutine(storage, 'a', '2026-12-01'), { check: false, rest: false });
  assert.equal(writeRoutine(storage, 'a', '2026-12-01', { rest: true }), true);
  const blocked = { getItem() { throw Error('denied'); }, setItem() { throw Error('quota'); } };
  assert.deepEqual(readRoutine(blocked, 'a', '2026-12-01'), { check: false, rest: false });
  assert.equal(writeRoutine(blocked, 'a', '2026-12-01', { check: true }), false);
});
