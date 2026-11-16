const recordsKey = (uid) => `trips:${uid}`;
const pendingKey = (uid) => `pending:trips:${uid}`;
const revisionKey = (uid, id) => `pending:trip-revision:${uid}:${id}`;
const rows = (value) =>
  Array.isArray(value) ? value.filter((row) => row?.id) : [];
const ids = (value) =>
  Array.isArray(value) ? value.filter((id) => typeof id === "string") : [];

export function createTripStorage({
  read,
  write,
  upload,
  isOnline = () => true,
  onPending = () => {},
}) {
  const inFlight = new Map();
  let revisionSequence = 0;
  const getHistory = (uid) => rows(read(recordsKey(uid), []));
  const pending = (uid) => ids(read(pendingKey(uid), []));
  function mergeHistory(uid, serverRows) {
    const merged = new Map(rows(serverRows).map((row) => [row.id, row]));
    for (const row of getHistory(uid)) merged.set(row.id, row);
    return [...merged.values()].sort((a, b) =>
      String(b.started_at || "").localeCompare(String(a.started_at || "")),
    );
  }
  function commit(uid, trip) {
    if (!trip?.id || !trip.ended_at || (trip.user_id && trip.user_id !== uid))
      throw Error("완료한 내 운행만 저장할 수 있어요.");
    const history = [
      trip,
      ...getHistory(uid).filter((row) => row.id !== trip.id),
    ];
    write(recordsKey(uid), history);
    return history;
  }
  function enqueue(uid, tripId) {
    if (uid === "guest") return;
    const queue = pending(uid);
    if (!queue.includes(tripId)) write(pendingKey(uid), [...queue, tripId]);
    write(
      revisionKey(uid, tripId),
      `${Date.now()}-${++revisionSequence}-${Math.random()}`,
    );
    onPending();
  }
  async function sync(uid, tripId, stillSignedIn) {
    if (uid === "guest" || !isOnline() || !stillSignedIn()) return false;
    const key = `${uid}:${tripId}`;
    const running = inFlight.get(key);
    if (running) return running;
    async function send() {
      while (stillSignedIn() && isOnline() && pending(uid).includes(tripId)) {
        const record = getHistory(uid).find((row) => row.id === tripId);
        if (!record?.ended_at || (record.user_id && record.user_id !== uid))
          return false;
        const revision = read(revisionKey(uid, tripId), null);
        const { id, started_at, ended_at, distance_km, points, events, memo } =
          record;
        await upload({
          id,
          user_id: uid,
          started_at,
          ended_at,
          distance_km,
          points,
          events,
          memo,
        });
        if (revision !== read(revisionKey(uid, tripId), null)) continue;
        write(
          pendingKey(uid),
          pending(uid).filter((value) => value !== tripId),
        );
        write(revisionKey(uid, tripId), null);
        onPending();
        return true;
      }
      return false;
    }
    const task = Promise.resolve().then(() =>
      globalThis.navigator?.locks
        ? navigator.locks.request(`rider-spot-sync:${key}`, send)
        : send(),
    );
    inFlight.set(key, task);
    try {
      return await task;
    } finally {
      inFlight.delete(key);
    }
  }
  return { getHistory, mergeHistory, commit, pending, enqueue, sync };
}
