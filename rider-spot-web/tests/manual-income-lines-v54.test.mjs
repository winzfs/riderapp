import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const js=readFileSync(new URL('../src/manual-income-lines-v54.js',import.meta.url),'utf8');
const ACCOUNT='11111111-1111-4111-8111-111111111111';

function node(tag='div'){
  return {
    tag,id:'',className:'',textContent:'',isConnected:true,
    children:[],previousElementSibling:null,
    setAttribute(name,value){this[name]=value;},
    replaceChildren(...children){this.children=[...children];},
    append(...children){this.children.push(...children);},
    insertAdjacentElement(position,element){
      assert.equal(position,'afterend');this.after=element;
      element.previousElementSibling=this;
    },
    remove(){this.isConnected=false;this.removed=true;},
    querySelector(){return null;}
  };
}
class BrowserURL{
  constructor(raw){
    const [path,search='']=String(raw).split('?');
    const match=path.match(/^https?:\/\/([^/]+)(\/.*)$/);
    this.hostname=match?.[1]||'rider-spot.jazzhjm.workers.dev';
    this.pathname=match?.[2]||path;
    const params=new Map(search.split('&').filter(Boolean).map(pair=>{
      const p=pair.split('=');return [p[0],decodeURIComponent(p.slice(1).join('='))];
    }));
    this.searchParams={get:key=>params.get(key)||null};
  }
}
class BrowserHeaders{
  constructor(raw={}){this.map=new Map(Object.entries(raw).map(([k,v])=>[k.toLowerCase(),v]));}
  get(key){return this.map.get(key.toLowerCase())||null;}
}
function createHarness(){
  const date={value:'2026-11-23'};
  const panel=node('section');
  panel.querySelector=()=>date;
  const nodes=new Map;
  const callbacks={};
  let fetched=[];
  const doc={
    readyState:'loading',
    head:{append(element){nodes.set(element.id,element);}},
    createElement:node,
    getElementById(id){return nodes.get(id) || (panel.after?.id===id&&panel.after.isConnected?panel.after:null);},
    querySelector(selector){return selector==='.rs-auto-income-time-list'?panel:null;},
    addEventListener(type,fn){callbacks[type]=fn;}
  };
  const win={
    document:doc,
    location:{href:'https://rider-spot.jazzhjm.workers.dev/'},
    addEventListener(type,fn){callbacks[type]=fn;},
    setInterval(fn){callbacks.interval=fn;},
    setTimeout(fn){fn();},
    requestAnimationFrame(fn){fn();},
    fetch:async()=>({ok:true,clone(){return {json:async()=>fetched}}})
  };
  runInNewContext(js,{window:win,URL:BrowserURL,Headers:BrowserHeaders,Date,Intl,Map,Set});
  return {win,doc,panel,date,callbacks,setRows(rows){fetched=rows;},
    async receive(){
      await win.fetch('https://qkcqzhkvfbymzjdktshp.supabase.co/rest/v1/rider_earnings?select=*&user_id=eq.'+ACCOUNT,
        {headers:{range:'0-499'}});
      for(let i=0;i<20;i++)await Promise.resolve();
    }};
}
function manual(id,amount,note='수기입력 추가분'){
  return {id,user_id:ACCOUNT,source_type:'manual',work_date:'2026-11-23',
    gross_won:amount,gross_entered:true,note,platform:'쿠팡이츠',
    created_at:'2026-11-23T12:35:00.000Z',manual_snapshot_at:'2026-11-23T12:35:00.000Z'};
}
test('90k => 100k is rendered as a distinct +10,000원 manual income entry',async()=>{
  const h=createHarness();
  h.setRows([manual('a',10000),{...manual('b',90000),source_type:'auto'}]);
  await h.receive();
  const card=h.panel.after;
  assert.equal(card.id,'rs-manual-income-lines-v54');
  const entry=card.children.find(x=>x.className==='rsmi-row');
  assert.equal(entry.children[1].textContent,'+10,000원');
  assert.equal(entry.children[0].children[0].textContent,'수기입력 추가분');
});
test('manual amounts are read-only, no new database writes, legacy notes labelled',async()=>{
  const h=createHarness();
  h.setRows([manual('old',12553,'자동수집 누락분 보충 · 실제 총수입 기준')]);
  await h.receive();
  const info=h.panel.after.children.find(x=>x.className==='rsmi-row');
  assert.equal(info.children[1].textContent,'+12,553원');
  assert.equal(info.children[0].children[0].textContent,'수기입력 추가분');
});
test('automatic records and zero manual records are not duplicated',async()=>{
  const h=createHarness();
  h.setRows([manual('zero',0),{...manual('auto',5000),source_type:'auto'}]);
  await h.receive();
  assert.equal(h.panel.after,undefined);
});
test('changing selected work date hides manual entries for other days',async()=>{
  const h=createHarness();
  h.setRows([manual('a',10000)]);await h.receive();
  assert.ok(h.panel.after?.isConnected);
  h.date.value='2026-11-22';h.callbacks.interval();
  assert.equal(h.panel.after.isConnected,false);
});
test('two separate topups show two + amounts, never a synthetic summed row',async()=>{
  const h=createHarness();
  h.setRows([manual('a',10000),manual('b',7000)]);await h.receive();
  const list=h.panel.after.children.filter(x=>x.className==='rsmi-row');
  assert.deepEqual(list.map(x=>x.children[1].textContent),['+10,000원','+7,000원']);
});
