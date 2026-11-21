"use strict";
// Dedicated regression: the export dialog must escape transformed map containers,
// keep actions in the viewport, and expose only the requested fixed presets.
const {chromium}=require("playwright");
const assert=require("node:assert/strict");
const path=require("node:path");
const fs=require("node:fs");
const {sampleTrip,userId}=require("./fixtures.cjs");
const origin=process.env.RIDER_UI_URL||"http://127.0.0.1:8789/";
const trip=sampleTrip(4600,{started:Date.parse("2026-11-16T00:00:00Z")});
const user={id:userId,aud:"authenticated",email:"test@example.test",role:"authenticated",app_metadata:{provider:"google"},user_metadata:{nickname:"테스트 라이더"},created_at:"2026-11-01T00:00:00Z"};
const jwt="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."+Buffer.from(JSON.stringify({sub:userId,role:"authenticated",exp:Math.floor(Date.now()/1000)+3600})).toString("base64url")+".test";
const session={access_token:jwt,refresh_token:"qa",expires_at:Math.floor(Date.now()/1000)+3600,token_type:"bearer",user};
(async()=>{
 const browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 try{
  const folder=process.env.RIDER_RECAP_SCREENSHOTS||"/tmp/rider-spot-recap";
  fs.mkdirSync(folder,{recursive:true});
  for(const viewport of [{width:393,height:844},{width:360,height:720}]){
   const ctx=await browser.newContext({viewport,isMobile:true,hasTouch:true,deviceScaleFactor:1,
     serviceWorkers:"block",timezoneId:"Asia/Seoul",
     permissions:["geolocation"],geolocation:{latitude:35.17,longitude:126.83}});
   await ctx.routeWebSocket("**/realtime/v1/websocket?**",socket=>socket.close());
   await ctx.addInitScript(({trip,session,userId})=>{
     if(!sessionStorage.getItem("recap-qa")){
       sessionStorage.setItem("recap-qa","1");
       localStorage.setItem("rs:trips:"+userId,JSON.stringify([trip]));
       localStorage.setItem("sb-qkcqzhkvfbymzjdktshp-auth-token",JSON.stringify(session));
     }
   },{trip,session,userId});
   await ctx.route("**/*",async route=>{
     let u;try{u=new URL(route.request().url);}catch{return route.continue();}
     if(u.hostname.endsWith(".supabase.co")){
       if(u.pathname==="/auth/v1/user")return route.fulfill({json:user});
       if(u.pathname==="/auth/v1/token")return route.fulfill({json:session});
       if(u.pathname.includes("/rpc/rider_work_stats"))return route.fulfill({json:{}});
       const table=u.pathname.split("/").at(-1);
       const data=table==="trips"?[trip]:table==="rider_profiles"?{nickname:"테스트 라이더",user_id:userId}:table==="rider_settings"?{}:[];
       return route.fulfill({json:data});
     }
     if(u.pathname==="/api/route-match")return route.fulfill({json:{lines:[]}});
     if(u.pathname==="/api/industry-news")return route.fulfill({json:{items:[]}});
     return route.continue();
   });
   const p=await ctx.newPage();
   const errors=[];
   p.on("pageerror",err=>errors.push(err.message));
   await p.goto(origin,{waitUntil:"domcontentloaded",timeout:40000});
   const nav=p.getByRole("navigation",{name:"주 메뉴"});
   await nav.waitFor({timeout:30000});
   await nav.getByRole("button",{name:"타임라인",exact:true}).click();
   const day=p.getByRole("button",{name:/2026-11-16 운행/}).first();
   await day.waitFor({timeout:15000});
   await day.click();
   const launch=p.locator(".rs12-map-heading .rs12-recap-action");
   await launch.waitFor();
   await launch.click();
   const dialog=p.locator("dialog.rs-recap-dialog[open]");
   await dialog.waitFor({timeout:8000});
   const evidence=await p.evaluate(()=>{
     const d=document.querySelector("dialog.rs-recap-dialog");
     const rect=d.getBoundingClientRect(),actions=d.querySelector(".rs-recap-actions").getBoundingClientRect();
     const backdrop=getComputedStyle(d,"::backdrop");
     const cvs=d.querySelector("canvas");
     return {topLayer:d.matches(":modal"),dialog:{top:rect.top,bottom:rect.bottom,left:rect.left,right:rect.right},
       actions:{top:actions.top,bottom:actions.bottom},
       width:innerWidth,height:innerHeight,
       scrollRegion:d.querySelector(".rs-recap-content")?.scrollHeight||0,
       blur:backdrop.backdropFilter,choices:d.querySelectorAll(".rs-recap-control").length,
       preview:cvs?{w:cvs.width,h:cvs.height}:null,
       download:!!d.querySelector("button.rs-recap-download"),
       share:!!d.querySelector("button.rs-recap-share"),
       showIncome:!!d.querySelector("input[aria-label='수익 공개']"),
       label:null};
   });
   assert.ok(evidence.topLayer,"native modal is not promoted to top layer");
   assert.ok(evidence.dialog.top>=-1 && evidence.dialog.bottom<=viewport.height+1,
     "dialog extends beyond viewport: "+JSON.stringify(evidence));
   assert.ok(evidence.actions.top>=0&&evidence.actions.bottom<=viewport.height,
     "save/share buttons require page scrolling: "+JSON.stringify(evidence));
   assert.equal(evidence.choices,0,"fixed menus must not be rendered");
   assert.equal(evidence.blur,"none","backdrop should not blur underlying map");
   assert.ok(evidence.share&&evidence.download&&evidence.showIncome);
   assert.deepEqual(evidence.preview,{w:1080,h:1350});
   await p.screenshot({path:path.join(folder,"modal-"+viewport.width+"x"+viewport.height+".png")});
   await dialog.getByRole("button",{name:"닫기"}).click();
   await dialog.waitFor({state:"detached",timeout:5000});
   assert.equal(await p.locator(".rs-recap-launch").count(),1);
   assert.deepEqual(errors,[],"Browser exception: "+errors.join("; "));
   console.log("RECAP_DIALOG_TOP_LAYER_PASS",JSON.stringify({viewport,evidence}));
   await ctx.close();
  }
 } finally {await browser.close();}
})().catch(err=>{console.error(err);process.exitCode=1;});
