// Single client-side write gateway for the timeline and earnings screen.
// Server RPCs own serialization, authorization, and concurrency protection.
export const DELIVERY_PLATFORMS=Object.freeze(["쿠팡이츠","배민"]);
export const MAX_FINANCE_WON=100000000;

export function amountWon(value,{allowEmpty=false}={}){
  if((value==null || value==="")&&allowEmpty)return null;
  const raw=typeof value==="string"?value.replace(/,/g,"").trim():value;
  if(raw===""||raw==null||!Number.isSafeInteger(Number(raw))||
     Number(raw)<0||Number(raw)>MAX_FINANCE_WON)throw Error("올바른 금액을 입력해 주세요.");
  return Number(raw);
}
export function incomeDay(value){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value)))throw Error("업무일을 확인해 주세요.");
  const dt=new Date(value+"T12:00:00Z");
  if(!Number.isFinite(dt.getTime())||dt.toISOString().slice(0,10)!==value)
    throw Error("업무일을 확인해 주세요.");
  return value;
}
export function incomeDayDiff(draft,previous={}){
  const changes={},expected={};
  for(const p of DELIVERY_PLATFORMS){
    const next=amountWon(draft?.[p],{allowEmpty:true});
    const prior=amountWon(previous?.[p],{allowEmpty:true});
    if(next!==prior){changes[p]=next;expected[p]=prior;}
  }
  return {changes,expected};
}
export function financeWriteError(error){
  const message=String(error?.message||error||"");
  if(message.includes("RS_INCOME_CONFLICT"))
    return "다른 기기에서 수익 기록이 변경됐어요. 새로 조회한 뒤 다시 입력해 주세요.";
  if(message.includes("RS_DUPLICATE_DAY_PLATFORM"))
    return "이 날짜·플랫폼에 수익 기록이 있어요. 내역에서 해당 기록을 수정해 주세요.";
  if(message.includes("RS_SETTLED_INCOME"))
    return "입금 확인된 수익이에요. 정산 내역을 확인한 뒤 수정해 주세요.";
  if(message.includes("RS_RECORD_NOT_FOUND"))
    return "다른 기기에서 삭제된 기록이에요. 내역을 새로고침해 주세요.";
  if(message.includes("RS_INVALID"))
    return "날짜·플랫폼·금액을 확인해 주세요.";
  return message||"저장에 실패했어요. 입력값은 유지돼요.";
}
export function emitFinanceChanged(userId){
  if(typeof window!=="undefined"&&window.dispatchEvent)
    window.dispatchEvent(new CustomEvent("riderspot:finance-changed",{detail:{userId}}));
}
export async function saveIncomeDay(client,{userId,day,draft,previous}){
  incomeDay(day);
  const {changes,expected}=incomeDayDiff(draft,previous);
  if(!Object.keys(changes).length)return {changed:false};
  const result=await client.rpc("rs_save_daily_income_guarded",{
    p_date:day,p_values:changes,p_expected:expected
  });
  if(result.error)throw Error(financeWriteError(result.error));
  emitFinanceChanged(userId);
  return {changed:true,changes};
}
export async function saveIncomeRecord(client,{userId,id=null,day,platform,gross,
  deliveries=0,expenses=0,note="",expectedUpdated=null}){
  incomeDay(day);
  if(!["쿠팡이츠","배민","기타","배민커넥트"].includes(platform))
    throw Error("플랫폼을 확인해 주세요.");
  const amount=amountWon(gross),expenseAmount=amountWon(expenses);
  const count=Number(deliveries);
  if(!Number.isSafeInteger(count)||count<0||count>300||String(note).length>300)
    throw Error("건수와 메모를 확인해 주세요.");
  if(id&&!expectedUpdated)throw Error("기존 기록을 새로 조회한 뒤 수정해 주세요.");
  const result=await client.rpc("rs_save_income_record",{
    p_id:id,p_date:day,p_platform:platform,p_gross:amount,p_deliveries:count,
    p_expenses:expenseAmount,p_note:String(note),p_expected_updated:expectedUpdated
  });
  if(result.error)throw Error(financeWriteError(result.error));
  emitFinanceChanged(userId);
  return result.data;
}
