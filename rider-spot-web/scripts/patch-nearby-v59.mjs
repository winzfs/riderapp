import { readFileSync } from 'node:fs';

const helper = readFileSync(new URL('../src/nearby-refresh.mjs',import.meta.url),'utf8')
  .replace('export function','function');
function once(source, oldText, newText) {
  if (source.split(oldText).length !== 2) throw Error('Unexpected release bundle');
  return source.replace(oldText, () => newText);
}
export function patchNearbyApp(source) {
  const oldRead='async function on(){if(!me.current)return;let Ne=await l(n.from("locations").select("*"));me.current&&xe()&&X(Ne.filter($=>$.user_id!==N))}';
  source=once(source,'Ce=r.useRef(0)','rsNearbyGate=r.useRef(null),Ce=r.useRef(0)');
  return once(source,oldRead,helper+'\nasync function on(){if(!me.current)return;let gen=M.current;rsNearbyGate.current??=createNearbyRefreshGate();return rsNearbyGate.current(gen,async()=>{let rows=await l(n.from("locations").select("*").neq("user_id",N));if(gen===M.current&&me.current&&xe())X(rows)})}');
}
export function patchNearbyWorker(source) {
  const newPath='/assets/rider-spot-82c20b027c23/app-nearby-v59.mjs';
  source=once(source,'.replaceAll(RS_MAP_LAYERS_V36_APP_BASE,RS_MIDNIGHT_V57_APP_ALIAS)',
    '.replaceAll(RS_MAP_LAYERS_V36_APP_BASE,'+JSON.stringify(newPath)+')');
  source=once(source,'const RS_MIDNIGHT_V57_APP_ALIAS=', 'const rsNearbyPatch='+patchNearbyApp.toString()+';\nconst helper='+JSON.stringify(helper)+';\n'+once.toString()+'\nconst RS_MIDNIGHT_V57_APP_ALIAS=');
  source=once(source,'script=rsPatchMidnightAssetV57(script);','script=rsPatchMidnightAssetV57(script);if(new URL(request.url).pathname==='+JSON.stringify(newPath)+')script=rsNearbyPatch(script);');
  return once(source,'if((request.method==="GET"||request.method==="HEAD")&&(path===RS_MIDNIGHT_V57_APP_ALIAS', 'if((request.method==="GET"||request.method==="HEAD")&&path==='+JSON.stringify(newPath)+')return rsServeMapLayersV36(request,env,"app");\n    if((request.method==="GET"||request.method==="HEAD")&&(path===RS_MIDNIGHT_V57_APP_ALIAS');
}
