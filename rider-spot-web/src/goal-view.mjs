/** A display-only month-end projection; never mutates saved earnings or goal data. */
const isoDay=value=>typeof value==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(value)?
  Date.parse(value+"T00:00:00Z"):NaN;
export function monthGoalProjection({monthFrom,monthTo,today,plannedWorkDays,workedDays,target,value,uncertain}) {
  const start=isoDay(monthFrom),end=isoDay(monthTo),now=isoDay(today);
  const remaining=Math.max(0,Math.trunc(Number(target)||0)-Math.trunc(Number(value)||0));
  const planned=Math.max(0,Math.trunc(Number(plannedWorkDays)||0)-Math.trunc(Number(workedDays)||0));
  const elapsed=Number.isFinite(now)&&Number.isFinite(start)&&Number.isFinite(end)?
    Math.max(start-86400000,now):end;
  const available=Number.isFinite(end)&&Number.isFinite(elapsed)?
    Math.max(0,Math.round((end-elapsed)/86400000)):0;
  const remainingWorkDays=Math.min(planned,available);
  const perDay=uncertain?null:remaining===0?0:
    remainingWorkDays>0?Math.ceil(remaining/remainingWorkDays):null;
  return {remaining,remainingWorkDays,perDay};
}
