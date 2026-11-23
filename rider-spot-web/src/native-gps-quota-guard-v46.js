/* RiderSpot GPS quota guard v46.
 * Activated exclusively inside Android native WebView.
 * Preserves full route in Android SQLite and React memory while keeping
 * localStorage active-trip metadata small. No cache clearing, deletion,
 * history mutation, reloading, tracking or stop-side effects.
 */
(function installNativeGpsQuotaGuard(win) {
  'use strict';
  if(!win || win.__rsNativeGpsQuotaGuardV46) return;
  const StorageCtor=win.Storage;
  if(!StorageCtor?.prototype?.setItem) return;
  const proto=StorageCtor.prototype;
  const original=proto.setItem;
  const activeKey=/^(?:rs:)?active:(?:guest|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
  const quota=e=>e?.name==='QuotaExceededError'||
    /exceeded the quota|quota exceeded|storage quota/i.test(String(e?.message||''));
  const nativeMode=()=>Boolean(win.RiderSpotHost && win.__rsNativeInstalled);
  const compact = (value) => {
    if(typeof value!=='string'||value.length<3)return null;
    let record;
    try{record=JSON.parse(value);}catch{return null;}
    if(!record||typeof record!=='object'||Array.isArray(record)||
       typeof record.id!=='string'||record.ended_at||
       !Array.isArray(record.points))return null;
    return {id:record.id,value:record.points.length?
      JSON.stringify({...record,points:[]}):value};
  };
  function safeSetItem(key,value){
    if(this!==win.localStorage||!nativeMode()||
       !activeKey.test(String(key)))return original.apply(this,arguments);
    const record=compact(value);
    if(!record)return original.apply(this,arguments);
    try {
      return original.call(this,key,record.value);
    } catch(error) {
      if(!quota(error))throw error;
      // This exception is safe only while recovering an existing SQLite
      // recording, never for a newly-started web-only trip.
      const recovery=win.__rsGPSRestoringNativeId===record.id||
        win.__rsGPSRestoredNativeId===record.id;
      if(!recovery)throw error;
      win.__rsNativeGpsQuotaFallbackV46=record.id;
      if(!win.__rsNativeGpsQuotaWarnedV46){
        win.__rsNativeGpsQuotaWarnedV46=true;
        console.warn('[RiderSpot GPS] SQLite track retained; active WebView metadata cannot persist until storage space is available.');
      }
      return undefined; // In-memory recovery can proceed, SQLite stays intact.
    }
  }
  try{proto.setItem=safeSetItem;}
  catch(error){console.warn('[RiderSpot GPS] Cannot install native-only active metadata guard',error);return;}
  if(proto.setItem!==safeSetItem)return;
  win.__rsNativeGpsQuotaGuardV46=true;
})(typeof window==='undefined'?null:window);
