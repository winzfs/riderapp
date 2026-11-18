// Shared rider finance calculations. Keep chart data and entry totals in one place.
export const won = n => new Intl.NumberFormat("ko-KR").format(Math.round(Number(n) || 0)) + "원";
export const num = n => Number(n) || 0;
export const plusDays = (day, offset) => {
  const d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0,10);
};
export function koreanWorkDay(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US",{
    timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit",
    hour:"2-digit",hourCycle:"h23"
  }).formatToParts(now).map(p=>[p.type,p.value]));
  const day = parts.year+"-"+parts.month+"-"+parts.day;
  return Number(parts.hour) < 3 ? plusDays(day,-1) : day;
}
export function financeTotals(data,from,to) {
  const pick = (items,key) => (items||[]).filter(x=>String(x[key]||"") >= from && String(x[key]||"") <= to);
  const earnings = pick(data?.earnings,"work_date").filter(x=>x.gross_entered !== false);
  const fuel = pick(data?.fuel,"fueled_on");
  const maintenance = pick(data?.maintenance,"serviced_on");
  const extras = pick(data?.extras,"expense_date");
  const gross = earnings.reduce((n,x)=>n+num(x.gross_won),0);
  const earningCosts = earnings.reduce((n,x)=>n+num(x.expenses_won),0);
  const fuelCost = fuel.reduce((n,x)=>n+num(x.cost_won),0);
  const maintenanceCost = maintenance.reduce((n,x)=>n+num(x.cost_won),0);
  const extraCost = extras.reduce((n,x)=>n+num(x.amount_won),0);
  const cost = earningCosts + fuelCost + maintenanceCost + extraCost;
  const uncertain = earnings.some(x=>x.expense_scope !== "other_only" && num(x.expenses_won)>0);
  const byPlatform = {};
  for(const x of earnings) {
    const p=x.platform==="배민커넥트"?"배민":x.platform;
    byPlatform[p]=(byPlatform[p]||0)+num(x.gross_won);
  }
  const paidRows = earnings.filter(x=>!!x.paid_at);
  const paid = paidRows.reduce((n,x)=>n+num(x.paid_won??x.gross_won),0);
  const expectedPaid = paidRows.reduce((n,x)=>n+num(x.gross_won),0);
  const unpaid = earnings.filter(x=>!x.paid_at).reduce((n,x)=>n+num(x.gross_won),0);
  return {earnings,fuel,maintenance,extras,gross,earningCosts,fuelCost,maintenanceCost,
    extraCost,cost,net:gross-cost,uncertain,byPlatform,paid,expectedPaid,payoutDifference:paid-expectedPaid,unpaid,
    deliveries:earnings.reduce((n,x)=>n+num(x.deliveries),0)};
}
export function financeDays(data,last,days=7) {
  return Array.from({length:days},(_,i)=>{
    const day=plusDays(last,i-days+1);
    const value=financeTotals(data,day,day);
    return {day,gross:value.gross,net:value.net};
  });
}
export function financePeriod(day,scope) {
  if(scope==="today")return [day,day];
  if(scope==="week")return [plusDays(day,-6),day];
  return financeMonthPeriod(day);
}
export function monthLastDay(day) {
  const d=new Date(day.slice(0,7)+"-01T12:00:00Z");
  d.setUTCMonth(d.getUTCMonth()+1);
  return plusDays(d.toISOString().slice(0,10),-1);
}
export function financeMonthPeriod(day){ return [day.slice(0,7)+"-01",monthLastDay(day)]; }
