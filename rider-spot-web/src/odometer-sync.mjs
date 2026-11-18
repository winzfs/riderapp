// Local first queue for completed trips. Exactly-once server RPC handles
// retries, fractions of kilometres and explicit manual corrections.
const key=uid=>"pending:odometer:"+uid;
const valid=row=>row && typeof row.id==="string" &&
  /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(row.id) &&
  Number.isFinite(Number(row.distance_km)) && Number(row.distance_km)>=0 &&
  Number(row.distance_km)<=2000 && Number.isFinite(Date.parse(row.ended_at));
export function createTripOdometerSync({read,write,apply,isOnline=()=>true}){
  const inFlight=new Map();
  const pending=uid=>{
    const list=read(key(uid),[]);
    return Array.isArray(list)?list.filter(valid):[];
  };
  function enqueue(uid,trip){
    if(uid==="guest"||!valid(trip))return false;
    const list=pending(uid);
    if(list.some(x=>x.id===trip.id))return false;
    write(key(uid),[...list,{id:trip.id,
      distance_km:Math.round(Number(trip.distance_km)*1000)/1000,
      ended_at:trip.ended_at}]);
    return true;
  }
  async function flush(uid,sameAccount=()=>true){
    if(uid==="guest"||!isOnline()||!sameAccount())return 0;
    if(inFlight.has(uid))return inFlight.get(uid);
    const task=(async()=>{
      let count=0;
      for(const trip of pending(uid)){
        if(!sameAccount()||!isOnline())break;
        const reading=await apply(trip);
        // A null reading indicates that no initial odometer was entered.
        if(reading==null)break;
        write(key(uid),pending(uid).filter(x=>x.id!==trip.id));
        count++;
      }
      return count;
    })();
    inFlight.set(uid,task);
    try{return await task;}finally{inFlight.delete(uid);}
  }
  return {pending,enqueue,flush};
}
