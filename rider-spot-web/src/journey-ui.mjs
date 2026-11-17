import { riderJourney, readRoutine, writeRoutine, routineKey, ROUTINES } from './journey.mjs';

export function createJourneyUI(React) {
  const h = React.createElement;
  const number = v => new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 1 }).format(v);
  function useJourney(history) {
    const [now, setNow] = React.useState(Date.now);
    React.useEffect(() => {
      const refresh = () => { if (!document.hidden) setNow(Date.now()); };
      window.addEventListener('focus', refresh);
      document.addEventListener('visibilitychange', refresh);
      const timer = window.setInterval(refresh, 60000);
      return () => { clearInterval(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
    }, []);
    return React.useMemo(() => riderJourney(history, now), [history, now]);
  }
  function JourneyPanel({ history, userId, riding = false, onTimeline }) {
    const journey = useJourney(history);
    const { today, days, weekDays, weekKm, weekXp, nextBadge, todayResult } = journey;
    const [saved, setSaved] = React.useState(() => {
      let state; try { state = readRoutine(window.localStorage, userId, today); } catch { state = {}; }
      return { day: today, user: userId, state };
    });
    const [notice, setNotice] = React.useState('');
    const routines = saved.day === today && saved.user === userId ? saved.state : {};
    React.useEffect(() => {
      const refresh = () => {
        let state; try { state = readRoutine(window.localStorage, userId, today); } catch { state = {}; }
        setSaved({ day: today, user: userId, state });
        setNotice('');
      };
      const sync = event => { if (!event.key || event.key === routineKey(userId)) refresh(); };
      refresh();
      window.addEventListener('storage', sync);
      return () => window.removeEventListener('storage', sync);
    }, [today, userId]);
    const toggle = id => {
      const next = { ...routines, [id]: !routines[id] };
      let stored = false;
      try { stored = writeRoutine(window.localStorage, userId, today, next); } catch {}
      setSaved({ day: today, user: userId, state: next });
      setNotice(stored ? (next[id] ? '체크했어요. 오늘도 내 페이스대로.' : '체크를 취소했어요.') : '기기에 저장하지 못했어요. 이번 화면에서만 유지돼요.');
    };
    const done = ROUTINES.filter(r => routines[r.id]).length + (todayResult.completedTrips ? 1 : 0);
    return h('div', { className: 'rs-journey-panel', id: 'rider-journey' },
      h('section', { className: 'rs-journey-week', 'aria-label': '이번 주 라이더 기록' },
        h('div', { className: 'rs-journey-section-head' },
          h('div', null, h('small', null, 'YOUR WEEK, YOUR PACE'), h('h2', null, '이번 주의 발자국')),
          h('span', { className: 'rs-journey-week-count' }, weekDays, h('small', null, '일 기록'))),
        h('div', { className: 'rs-journey-stamps', role: 'list' }, ...days.map(d =>
          h('div', { key: d.day, role: 'listitem', className: 'rs-journey-day' + (d.recorded ? ' is-recorded' : '') + (d.today ? ' is-today' : '') + (d.future ? ' is-future' : ''), 'aria-label': d.day + (d.recorded ? ' 기록 완료' : d.future ? ' 예정' : ' 기록 없음') },
            h('span', null, d.label), h('b', { 'aria-hidden': true }, d.recorded ? '✦' : d.day.slice(-2)), h('small', null, d.today ? '오늘' : d.recorded ? '완료' : '')))),
        h('div', { className: 'rs-journey-week-stats' }, h('span', null, '주간 기록 ', h('b', null, number(weekKm) + ' km')), h('span', null, '모은 경험치 ', h('b', null, '+' + weekXp + ' XP'))),
        h('p', null, weekDays ? '쉬는 날이 있어도 괜찮아요. 쌓인 경험치는 그대로예요.' : '첫 운행을 마치면 이번 주 첫 스탬프가 찍혀요.')),
      h('section', { className: 'rs-journey-routines', 'aria-label': '오늘의 라이더 루틴' },
        h('div', { className: 'rs-journey-section-head' }, h('div', null, h('small', null, today.replaceAll('-', '.')), h('h2', null, '오늘의 작은 미션')), h('span', { className: 'rs-journey-counter' }, done + ' / 3')),
        h('div', { className: 'rs-journey-mission' + (todayResult.completedTrips ? ' is-done' : '') },
          h('span', { className: 'rs-journey-mission-icon', 'aria-hidden': true }, todayResult.completedTrips ? '✓' : '↗'),
          h('div', null, h('strong', null, '오늘의 운행 기록 남기기'), h('small', null, todayResult.completedTrips ? '운행 완료 · 오늘의 경험치를 받았어요' : '운행 시작부터 종료까지, 자동으로 완성')),
          h('span', { className: 'rs-journey-reward' }, '+25 XP')),
        ...ROUTINES.map(r => h('button', { key: r.id, type: 'button', className: 'rs-journey-mission' + (routines[r.id] ? ' is-done' : ''), 'aria-pressed': routines[r.id] === true, disabled: riding, onClick: () => toggle(r.id) },
          h('span', { className: 'rs-journey-mission-icon', 'aria-hidden': true }, routines[r.id] ? '✓' : r.icon),
          h('span', { className: 'rs-journey-mission-copy' }, h('strong', null, r.title), h('small', null, r.detail)),
          h('span', { className: 'rs-journey-check', 'aria-hidden': true }, routines[r.id] ? '완료' : '체크'))),
        h('p', { className: 'rs-journey-status', role: 'status' }, notice || (done === 3 ? '오늘의 미션 완료! 나도, 기록도 잘 챙겼어요.' : riding ? '운행을 멈추고 휴식할 때 체크해 주세요.' : '점검·휴식은 직접 체크해요. 이 기기에 저장되며 매일 새로 시작해요.'))),
      nextBadge ? h('section', { className: 'rs-journey-next', 'aria-label': '다음에 얻을 배지' },
        h('span', { className: 'rs-journey-next-medal', 'aria-hidden': true }, nextBadge.icon),
        h('div', null, h('small', null, 'NEXT BADGE'), h('h2', null, nextBadge.title),
          h('p', null, nextBadge.kind === 'days' ? '기록한 날 ' + nextBadge.remaining + '일이 더 쌓이면 만나요' : '평소의 운행이 쌓여 완성되는 100km 배지'),
          h('progress', { max: nextBadge.need, value: Math.min(nextBadge.need, nextBadge.current), 'aria-label': nextBadge.title + ' 획득 진행률' }),
          h('small', null, number(nextBadge.current) + ' / ' + nextBadge.need + (nextBadge.kind === 'days' ? '일' : ' km'))))
        : h('section', { className: 'rs-journey-next' }, h('span', { className: 'rs-journey-next-medal', 'aria-hidden': true }, '★'), h('div', null, h('h2', null, '도감을 모두 채웠어요'), h('p', null, '다섯 개의 배지에 나의 시간이 담겼어요.'))),
      h('button', { type: 'button', className: 'rs-journey-replay', onClick: onTimeline }, h('span', null, '나의 경로, 다시 달려보기', h('small', null, '타임라인에서 하루를 펼쳐 경로를 재생해요')), h('b', { 'aria-hidden': true }, '↗')));
  }
  return { JourneyPanel };
}
