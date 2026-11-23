function replaceOnce(source, needle, updated) {
  if (source.split(needle).length !== 2) throw Error('Unexpected rider map bundle');
  return source.replace(needle, () => updated);
}
export function patchRegionalApp(source) {
  source = replaceOnce(source,'n.from("locations").select("*").neq("user_id",N)','n.rpc("rs_nearby_riders")');
  source = replaceOnce(source,',Le=n.channel(`nearby:${N}`).on("postgres_changes",{event:"*",schema:"public",table:"locations"},Ne).subscribe()','');
  return replaceOnce(source,'clearInterval($),n.removeChannel(Le),document.removeEventListener("visibilitychange",ne)','clearInterval($),document.removeEventListener("visibilitychange",ne)');
}
export function patchRegionalWorker(source) {
  const oldPath = '/assets/rider-spot-82c20b027c23/app-nearby-v59.mjs';
  const path = oldPath.replace('nearby-v59','regional-v60');
  const quoted = JSON.stringify(path);
  source = replaceOnce(source,'.replaceAll(RS_MAP_LAYERS_V36_APP_BASE,'+JSON.stringify(oldPath)+')','.replaceAll(RS_MAP_LAYERS_V36_APP_BASE,'+quoted+')');
  source = replaceOnce(source,'const rsNearbyPatch=',replaceOnce.toString()+'\n'+patchRegionalApp.toString()+'\nconst rsNearbyPatch=');
  const hook='if(new URL(request.url).pathname==='+JSON.stringify(oldPath)+')script=rsNearbyPatch(script);';
  source = replaceOnce(source,hook,hook+'if(new URL(request.url).pathname==='+quoted+')script=patchRegionalApp(rsNearbyPatch(script));');
  const route='if((request.method==="GET"||request.method==="HEAD")&&path==='+JSON.stringify(oldPath)+')return rsServeMapLayersV36(request,env,"app");';
  return replaceOnce(source,route,route+'\n'+route.replace(oldPath,path));
}
