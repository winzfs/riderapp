// The next 10-second poll reconciles notifications received during the cooldown.
export function createNearbyRefreshGate() {
  let current;
  return function refresh(generation, read) {
    const now = Date.now();
    if (current?.generation === generation &&
        (current.pending || now - current.started < 2000)) return current.promise;
    const entry = { generation, started: now, pending: true };
    current = entry;
    entry.promise = Promise.resolve().then(read).finally(() => { entry.pending = false; });
    return entry.promise;
  };
}
