import test from 'node:test';
import assert from 'node:assert/strict';
import {createNearbyRefreshGate} from '../src/nearby-refresh.mjs';

test('concurrent triggers share a read and a new sharing session starts independently', async () => {
  const refresh = createNearbyRefreshGate();
  let reads = 0;
  const read = async () => ++reads;
  await Promise.all(Array.from({length: 100}, () => refresh(1, read)));
  await refresh(1, read);
  assert.equal(reads, 1);
  await refresh(2, read);
  assert.equal(reads, 2);
});
