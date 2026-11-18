import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {join,dirname} from "node:path";
import vm from "node:vm";
import assert from "node:assert/strict";

const html=readFileSync(join(dirname(fileURLToPath(import.meta.url)),"index.html"),"utf8");
const source=html.split("<script>")[1]?.split("</script>")[0];
assert.ok(source,"inline script is present");
new vm.Script(source,{filename:"rider-spot-qa.js"});
const nodes={},handlers={};
const node=(id)=>nodes[id]??=({
  innerHTML:"",dataset:{},style:{},value:"",
  textContent:"",classList:{add(){},remove(){}},
  addEventListener(event,fn){handlers[id+":"+event]=fn},
  setAttribute(){},setPointerCapture(){},
  getTotalLength(){return 650},
  getPointAtLength(x){return {x:85+x*.85,y:145-x*.05}}
});
const document={
  getElementById:node,
  addEventListener(event,fn){handlers["document:"+event]=fn}
};
const window={scrollTo(){},addEventListener(){}};
const localStorage={getItem(){return null},setItem(){}};
vm.runInNewContext(source,{document,window,localStorage,console,performance:{now:()=>0},
  alert:(msg)=>{throw Error(msg)},confirm:()=>true,requestAnimationFrame:()=>1});
assert.match(node("root").innerHTML,/운영 현황/);
function press(action,id=""){handlers["document:click"]({target:{closest(){return {dataset:{action,id}}}},preventDefault(){}})}
const pages={map:/지도 인터랙션/,timeline:/경로 재생 실험실/,posts:/커뮤니티/,earnings:/테스트 순수익/,bike:/현재 계기판/,qa:/기능 검증 체크리스트/,system:/Supabase/};
for(const [page,pattern] of Object.entries(pages)){press("nav",page);assert.match(node("root").innerHTML,pattern,page)}
press("nav","bike");press("odometer");assert.match(node("modal").innerHTML,/odoform/);
press("add","maintenance");assert.match(node("modal").innerHTML,/recordform/);
assert.match(html,/@media\(max-width:760px\)/);
console.log("QA smoke: 8 views, bike dialogs, responsive stylesheet OK");
