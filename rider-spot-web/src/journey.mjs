import { riderLocalDay, riderProgress, riderDayResult } from './gamification.mjs';

const DAY = 86400000;
const shift = (day, offset) => new Date(Date.parse(day + 'T00:00:00Z') + offset * DAY).toISOString().slice(0, 10);
export const ROUTINES = Object.freeze([
  { id: 'check', icon: '◈', title: '출발 전 30초 점검', detail: '타이어 · 브레이크 · 휴대폰 배터리' },
  { id: 'rest', icon: '◌', title: '나를 위한 쉬는 시간', detail: '안전한 곳에서 물 한 잔, 가볍게 스트레칭' },
]);

// Read completed summaries only. Never inspect or modify GPS points.
export function riderJourney(history, now = Date.now()) {
  const today = riderLocalDay(now);
  if (!today) throw new TypeError('Invalid journey date');
  const complete = (Array.isArray(history) ? history : []).filter(r =>
    r && r.ended_at && Number.isFinite(Date.parse(r.ended_at)) && Date.parse(r.ended_at) <= now);
  const weekday = new Date(today + 'T00:00:00Z').getUTCDay();
  const start = shift(today, -(weekday + 6) % 7);
  const labels = ['월', '화', '수', '목', '금', '토', '일'];
  const days = labels.map((label, i) => {
    const day = shift(start, i);
    const result = riderDayResult(complete, day);
    return { ...result, label, recorded: result.completedTrips > 0, today: day === today, future: day > today };
  });
  const progress = riderProgress(complete);
  const nextBadge = progress.badges.find(b => !b.unlocked);
  const current = nextBadge ? (nextBadge.kind === 'distance' ? progress.distanceKm : progress.activeDays) : 0;
  return {
    today, start, end: shift(start, 6), days, progress,
    todayResult: riderDayResult(complete, today),
    weekDays: days.filter(d => d.recorded).length,
    weekKm: days.reduce((sum, d) => sum + d.distanceKm, 0),
    weekXp: days.reduce((sum, d) => sum + d.earnedXp, 0),
    nextBadge: nextBadge && { ...nextBadge, current, remaining: Math.max(0, nextBadge.need - current), percent: Math.min(100, current / nextBadge.need * 100) },
  };
}

export function routineKey(userId) {
  return 'riderspot:daily-routine:v1:' + (userId || 'guest');
}
export function readRoutine(storage, userId, day) {
  try {
    const value = JSON.parse(storage.getItem(routineKey(userId)) || '{}');
    return Object.fromEntries(ROUTINES.map(r => [r.id, value?.[day]?.[r.id] === true]));
  } catch { return { check: false, rest: false }; }
}
export function writeRoutine(storage, userId, day, state) {
  try {
    let previous;
    try { previous = JSON.parse(storage.getItem(routineKey(userId)) || '{}'); } catch { previous = {}; }
    if (!previous || typeof previous !== 'object' || Array.isArray(previous)) previous = {};
    const saved = Object.fromEntries(Object.entries(previous).filter(([key]) => /^\d{4}-\d{2}-\d{2}$/.test(key) && key >= shift(day, -13) && key <= day));
    saved[day] = Object.fromEntries(ROUTINES.map(r => [r.id, state[r.id] === true]));
    storage.setItem(routineKey(userId), JSON.stringify(saved));
    return true;
  } catch { return false; }
}
