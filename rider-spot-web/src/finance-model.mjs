// Shared rider finance calculations. Keep chart data and entry totals in one place.
export const won = n => new Intl.NumberFormat("ko-KR").format(Math.round(Number(n) || 0)) + "원";
export const num = n => Number(n) || 0;
export const isPersonalExpense = row => ["식비","개인 비용"].includes(row?.category);
export const validWon = value => Number.isSafeInteger(Number(value)) && Number(value)>=0 && Number(value)<=100000000;
export const plusDays = (day, offset) => {
  const d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0,10);
};
export function koreanCalendarDay(now = new Date()) {
  const p=Object.fromEntries(new Intl.DateTimeFormat("en-US",{
    timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"
  }).formatToParts(now).map(part=>[part.type,part.value]));
  return p.year+"-"+p.month+"-"+p.day;
}
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
  const personalCost = extras.filter(isPersonalExpense).reduce((n,x)=>n+num(x.amount_won),0);
  const extraCost = extras.filter(x=>!isPersonalExpense(x)).reduce((n,x)=>n+num(x.amount_won),0);
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
    extraCost,personalCost,totalSpent:cost+personalCost,cost,net:gross-cost,uncertain,byPlatform,paid,expectedPaid,payoutDifference:paid-expectedPaid,unpaid,
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

export function financeLedger(data,from,to) {
  const rows=[];
  for(const row of data?.earnings||[]) if(row.gross_entered!==false)
    rows.push({type:"income",day:row.work_date,amount:num(row.gross_won),row,
      name:row.source_type==="manual" &&
        ["수기입력 추가분","자동수집 누락분 보충 · 실제 총수입 기준"].includes(row.note)
        ?"수기입력 추가분":row.platform});
  for(const row of data?.fuel||[]) rows.push({type:"fuel",day:row.fueled_on,amount:num(row.cost_won),row,name:"주유비"});
  for(const row of data?.maintenance||[]) rows.push({type:"maintenance",day:row.serviced_on,amount:num(row.cost_won),row,name:row.item||"정비"});
  for(const row of data?.extras||[]) rows.push({type:"expense",day:row.expense_date,amount:num(row.amount_won),row,name:row.category,personal:isPersonalExpense(row)});
  return rows.filter(x=>x.day>=from&&x.day<=to).sort((a,b)=>b.day.localeCompare(a.day) || String(b.row.created_at||"").localeCompare(String(a.row.created_at||"")));
}

/** Day-of-month plans are projections until the rider confirms payment.
 * Projected rows must NEVER be included in financeTotals or financeLedger. */
export function plannedExpenseDate(month,dayOfMonth){
  if(!/^\d{4}-\d{2}$/.test(String(month)) || !Number.isInteger(Number(dayOfMonth)) ||
    Number(dayOfMonth)<1 || Number(dayOfMonth)>31)return null;
  const last=monthLastDay(month+"-01");
  return month+"-"+String(Math.min(Number(dayOfMonth),Number(last.slice(8)))).padStart(2,"0");
}
export function recurringOccurrences(rules,extras,month){
  return (rules||[]).filter(x=>x.active!==false).map(rule=>{
    const day=plannedExpenseDate(month,rule.day_of_month);
    const recorded=(extras||[]).find(row=>row.recurrence_id===rule.id&&
      row.recurrence_month===month+"-01");
    return {...rule,day,recorded:recorded||null,status:recorded?"recorded":"planned"};
  }).filter(row=>row.day).sort((a,b)=>a.day.localeCompare(b.day)||a.category.localeCompare(b.category));
}
export function nextPayoutDate(rule,day){
  if(!rule||!/^\d{4}-\d{2}-\d{2}$/.test(String(day)))return null;
  if(rule.cycle==="weekly"&&Number.isInteger(Number(rule.weekday))&&
      Number(rule.weekday)>=0&&Number(rule.weekday)<=6){
    const today=new Date(day+"T12:00:00Z").getUTCDay();
    return plusDays(day,(Number(rule.weekday)-today+7)%7);
  }
  if(rule.cycle==="monthly"&&Number.isInteger(Number(rule.month_day))&&
      Number(rule.month_day)>=1&&Number(rule.month_day)<=31){
    let proposed=plannedExpenseDate(day.slice(0,7),rule.month_day);
    if(proposed<day)proposed=plannedExpenseDate(plusDays(monthLastDay(day),1).slice(0,7),rule.month_day);
    return proposed;
  }
  return null;
}
export function financeMonths(data,last,count=6){
  return Array.from({length:count},(_,i)=>{
    const date=new Date(last.slice(0,7)+"-01T12:00:00Z");
    date.setUTCMonth(date.getUTCMonth()-count+1+i);
    const month=date.toISOString().slice(0,7);
    return {month,...financeTotals(data,month+"-01",monthLastDay(month+"-01"))};
  });
}

// Keep the previous account's cached money values off-screen during auth transitions.
export function accountFinanceData(userId,loadedUserId,cached){
  return userId&&userId===loadedUserId?cached:null;
}
