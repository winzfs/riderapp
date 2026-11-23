/* RiderSpot v50: legacy WebView GPS is private and never sent in Supabase writes.
 * Existing remote routes are still readable for one-time local migration.
 */
(function installDeviceOnlyGpsPrivacy(win){
  'use strict';
  if(!win||win.__rsDeviceGpsPrivacyV50||typeof win.fetch!=='function')return;
  win.__rsDeviceGpsPrivacyV50=true;
  const original=win.fetch.bind(win);
  const HOST='qkcqzhkvfbymzjdktshp.supabase.co';
  const deny=message=>new Response(JSON.stringify({
    code:'RIDERSPOT_DEVICE_ONLY_GPS',message
  }),{status:403,headers:{'content-type':'application/json'}});
  const isWrite=method=>['POST','PUT','PATCH','DELETE'].includes(method);
  const sanitize=value=>{
    if(Array.isArray(value))return value.map(sanitize);
    if(!value||typeof value!=='object')throw Error('Invalid trip payload');
    const copy={...value};
    if(Object.prototype.hasOwnProperty.call(copy,'points'))copy.points=[];
    if(Array.isArray(copy.events)){
      copy.events=copy.events.map(event=>
        event&&typeof event==='object'?
        {type:String(event.type||'').slice(0,64),at:String(event.at||'').slice(0,50)}:null)
      .filter(Boolean);
    }
    return copy;
  };
  win.fetch=function(input,init){
    let url;
    try{
      url=new URL(typeof input==='string'?input:input?.url||String(input),
        win.location?.href||'https://rider-spot.jazzhjm.workers.dev/');
    }catch{return original(input,init);}
    if(url.protocol!=='https:'||url.hostname!==HOST)return original(input,init);
    const method=String(init?.method||input?.method||'GET').toUpperCase();
    if(!isWrite(method))return original(input,init);
    const path = url.pathname.replace(/\/+$/, '');
    if(path==='/rest/v1/rider_trip_checkpoints')
      return Promise.resolve(deny('GPS 서버 백업이 해제되었어요. 기기에만 보관됩니다.'));
    if(path!=='/rest/v1/trips')return original(input,init);
    // Unknown request bodies fail closed, never leaking raw coordinates.
    return Promise.resolve().then(async()=>{
      try{
        const body=init?.body!==undefined?init.body:
          input instanceof Request?await input.clone().text():null;
        if(typeof body!=='string')return deny('GPS 요청을 안전하게 처리할 수 없어 차단했어요.');
        const safeBody=JSON.stringify(sanitize(JSON.parse(body)));
        if(input instanceof Request){
          const safeRequest=new Request(input,{...init,body:safeBody});
          return original(safeRequest);
        }
        return original(input,{...(init||{}),body:safeBody});
      }catch{
        console.warn('[RiderSpot GPS private] Unsafe trip write blocked');
        return deny('GPS를 서버로 전송하지 않도록 차단했어요.');
      }
    });
  };
})(typeof window==='undefined'?null:window);
