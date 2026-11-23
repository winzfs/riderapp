import { readIncomeForEdit, sumRideDays } from '../src/finance-reads.mjs';
function financeOnce(source, needle, replacement) {
  if(source.split(needle).length !== 2) throw Error('Finance release mismatch');
  return source.replace(needle, () => replacement);
}
export function patchFinanceApp(source) {
  const replace=(a,b)=>{source=financeOnce(source,a,b)};
  replace('ge=jv(N?.id,pe,q)','rsMonth=O==="overview"&&R.slice(0,7)===Ym().slice(0,7)?R.slice(0,7):"",ge=q?.monthKey===rsMonth?jv(N?.id,pe,q):null');
  replace('let At=await n.from(Te).select("*").eq("user_id",N.id).order(tt,{ascending:!1}).range(ft,ft+499)','if(!Ee)return xt;let query=n.from(Te).select("*").eq("user_id",N.id);if(rsMonth)query=query.gte(tt,Ps(rsMonth+"-01",-6)).lte(tt,zd(rsMonth+"-01")[1]);let At=await query.order(tt,{ascending:!1}).order("id").range(ft,ft+499)');
  replace('fe({earnings:Te[0]','fe({monthKey:rsMonth,earnings:Te[0]');
  replace('[N?.id,Oe]);let Pt','[N?.id,Oe,rsMonth]);let Pt');
  replace('ze&&!ge?', '(ze||!le)&&!ge?');
  replace('(ge?.earnings||[]).filter(Ft=>Ft.work_date===se.work_date&&Ft.platform===se.platform)','await readIncomeForEdit(n,N.id,se.work_date,se.platform)');
  replace('tt=(D==="today"?[Pt]', 'tt=sumRideDays(Sv(window.__rsRideApi?.history),D==="today"?[Pt]');
  replace(').map(je=>xv(window.__rsRideApi?.history,je)),xt=tt.reduce', '),xt=tt.reduce');
  return readIncomeForEdit.toString()+'\n'+sumRideDays.toString()+'\n'+source;
}
export function patchFinanceWorker(source) {
  const older='/assets/rider-spot-82c20b027c23/app-regional-v60.mjs';
  const newer=older.replace('regional-v60','finance-v61');
  const q=JSON.stringify;
  source=financeOnce(source,'.replaceAll(RS_MAP_LAYERS_V36_APP_BASE,'+q(older)+')','.replaceAll(RS_MAP_LAYERS_V36_APP_BASE,'+q(newer)+')');
  source=financeOnce(source,'const rsNearbyPatch=',[financeOnce,readIncomeForEdit,sumRideDays,patchFinanceApp].map(fn=>fn.toString()).join('\n')+'\nconst rsNearbyPatch=');
  const hook='if(new URL(request.url).pathname==='+q(older)+')script=patchRegionalApp(rsNearbyPatch(script));';
  source=financeOnce(source,hook,hook+'if(new URL(request.url).pathname==='+q(newer)+')script=patchFinanceApp(patchRegionalApp(rsNearbyPatch(script)));');
  const route='if((request.method==="GET"||request.method==="HEAD")&&path==='+q(older)+')return rsServeMapLayersV36(request,env,"app");';
  return financeOnce(source,route,route+'\n'+route.replace(older,newer));
}
