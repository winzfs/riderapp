// Browser plugin is unavailable in the build runner; Playwright runs in isolated contexts.
// All account/record/community writes are intercepted. Never uses production user data.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {sampleTrip,userId}=require('./fixtures.cjs');
const URL_BASE=process.env.RIDER_UI_URL||'https://urban-ui-rider-spot.jazzhjm.workers.dev/';
const baseline=process.env.RIDER_UI_BASELINE==='1';
const out=process.env.RIDER_SCREENSHOTS||'/tmp/rider-ui-evidence';fs.mkdirSync(out,{recursive:true});
const trips=[sampleTrip(5000,{started:Date.parse('2026-11-16T00:00:00Z')}),sampleTrip(1000,{id:'22222222-2222-4222-8222-222222222222',started:Date.parse('2026-11-16T03:00:00Z')})];
trips.push({...trips[1],id:'33333333-3333-4333-8333-333333333333',points:[],events:[],started_at:'2026-11-16T07:00:00Z',ended_at:'2026-11-16T07:00:03Z',distance_km:0,memo:''});
const posts=[['수완동 픽업할 때 잠깐 쉴 곳 공유해요','오늘 대기하면서 찾은 쉼터예요. 오토바이 세울 공간도 있어서 편했습니다.','동네 이야기'],['비 오는 날 운행할 때 챙기는 것들','우비와 장갑 관리 노하우가 궁금해요. 선배 라이더분들은 어떻게 준비하시나요?','질문·노하우'],['오늘 저녁 첨단 쪽 도로 상황 어때요?','신호 대기 구간이 길어지는 것 같아 동네 소식 나눠 봅니다.','현장 정보']].map(([title,body,category],i)=>({id:'post-'+i,user_id:'other',title,body,category,nickname:['수완라이더','오늘도안전','달리는광주'][i],area_district:'광주 광산구',area_dong:'수완동',created_at:'2026-11-16T09:00:00Z'}));
posts[0].image_path='qa/community-photo.png';
const places=[{id:'place-test',title:'테스트 공중화장실',category:'화장실',details:'디자인 검증용 장소입니다. 실제 시설 안내가 아닙니다.',lat:35.17,lng:126.83,nickname:'테스트 라이더',created_at:'2026-11-16T09:00:00Z'}, {id:'place-hidden',title:'테스트 공원 쉼터',category:'쉼터',details:'지도 표시 제외 검증용',lat:35.171,lng:126.831,nickname:'테스트 라이더',created_at:'2026-11-16T09:00:00Z'}];
const user={id:userId,aud:'authenticated',email:'ui-qa@example.test',role:'authenticated',app_metadata:{provider:'google'},user_metadata:{nickname:'광산라이더'},created_at:'2026-11-01T00:00:00Z'};
const jwt='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.'+Buffer.from(JSON.stringify({sub:userId,role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.test';
const session={access_token:jwt,refresh_token:'qa',expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user};
let browser;
async function check(width,native){
 const ctx=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,timezoneId:'Asia/Seoul',serviceWorkers:'block',permissions:['geolocation'],geolocation:{latitude:35.17,longitude:126.83,accuracy:8}});
 await ctx.routeWebSocket('**/realtime/v1/websocket?**',s=>s.close());
 await ctx.addInitScript(({trips,session,userId,native})=>{if(!sessionStorage.getItem('ui-qa-init')){sessionStorage.setItem('ui-qa-init','1');localStorage.setItem('rs:trips:'+userId,JSON.stringify(trips));localStorage.setItem('rs:trips:guest',JSON.stringify(trips));localStorage.setItem('sb-qkcqzhkvfbymzjdktshp-auth-token',JSON.stringify(session));}if(native){window.__rsNativeInstalled=true;document.documentElement.classList.add('rs-native-shell');}},{trips,session,userId,native});
 await ctx.route('**/*',async r=>{const u=new URL(r.request().url());if(u.hostname.endsWith('.supabase.co')){
  if(u.pathname.includes('/storage/v1/object/public/community-images/'))return r.fulfill({status:200,contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j8VkAAAAASUVORK5CYII=','base64')});
  if(u.pathname==='/auth/v1/user')return r.fulfill({json:user});
  if(u.pathname==='/auth/v1/token')return r.fulfill({json:session});
  if(u.pathname.includes('/rpc/rider_work_stats'))return r.fulfill({json:{last_7_days:[{day:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul'}).format(new Date()),gross:128500,other_costs:0,fuel_costs:8000,maintenance_costs:0,unclassified_costs:0,entries:1}]}});
  const table=u.pathname.split('/').at(-1);let data=table==='trips'?trips:table==='posts'?posts:table==='rider_places'?places:table==='rider_profiles'?{nickname:'광산라이더',user_id:userId}:table==='rider_settings'?{}:[];
  if(r.request().method()!=='GET')return r.fulfill({status:201,json:{}});
  return r.fulfill({json:data});
 }if(u.pathname==='/api/industry-news')return r.fulfill({json:{items:[]}});if(u.pathname==='/api/route-match')return r.fulfill({json:{lines:[]}});return r.continue();});
 const p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.stack||e.message));const mode=(baseline?'before':'after')+'-'+width+'-'+(native?'native':'web');
 const shot=async name=>p.screenshot({path:path.join(out,mode+'-'+name+'.png'),fullPage:false});
 async function layout(name){await p.waitForTimeout(180);const x=await p.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth,body:document.body.scrollWidth}));assert.ok(x.scroll<=width+1&&x.body<=width+1,name+' horizontal overflow '+JSON.stringify(x));await shot(name);const nav=await p.locator('.bottom-nav').boundingBox();assert.ok(nav&&nav.y+nav.height<=845&&nav.y>=760,'navigation safe bounds');}
 try{
 await p.goto(URL_BASE,{waitUntil:'domcontentloaded',timeout:35000});await p.getByRole('navigation',{name:'주 메뉴'}).waitFor();assert.match(await p.title(),/라이더스팟/);
 await p.waitForFunction(()=>window.__rsRideApi?.history?.length>=3);const original=await p.evaluate(id=>localStorage.getItem('rs:trips:'+id),userId);
 // Positron is a real vector map. No visual approximation or raster assertion.
 await p.waitForFunction(()=>document.querySelector('.map')?.dataset.rsBasemap==='positron',null,{timeout:35000});
 await p.waitForTimeout(800);if(baseline)await shot('map');else await layout('map');
 if(!baseline)assert.equal(await p.locator('.rs-game-profile,.rs-game-recap').count(),0,
   'no game panels or reward animation in live navigation map');
 if(!baseline){
 const controls=await p.locator('.rs-gps-state,.locate,#rs-sos-fab,#rs-report-legend,.leaflet-control-zoom').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return {name:el.className||el.id,x:r.x,y:r.y,w:r.width,h:r.height}}));
 for(let i=0;i<controls.length;i++)for(let j=i+1;j<controls.length;j++){const a=controls[i],b=controls[j];assert.ok(!(a.x<b.x+b.w&&b.x<a.x+a.w&&a.y<b.y+b.h&&b.y<a.y+a.h),'map overlap '+JSON.stringify([a,b]));}
 await p.waitForSelector('.rs-report-pin');assert.equal(await p.locator('.rs-report-pin').count(),1,'only toilet marker must appear, not shelter');await p.locator('.rs-report-pin').first().click();await p.getByRole('dialog',{name:'테스트 공중화장실'}).waitFor();await shot('place-sheet');await p.getByRole('button',{name:'상세 닫기',exact:true}).click();
 const camera=await p.evaluate(()=>{window.__rsMap.setView([35.18,126.84],11,{animate:false});return {lat:window.__rsMap.getCenter().lat,lng:window.__rsMap.getCenter().lng,z:window.__rsMap.getZoom()};});
 await p.waitForTimeout(250);assert.equal(await p.evaluate(()=>window.__rsMap.getZoom()),camera.z);
 }
 const nav=p.getByRole('navigation',{name:'주 메뉴'});
 await nav.getByRole('button',{name:'타임라인',exact:true}).click();await p.getByRole('button',{name:'2026-11-16 운행 3회',exact:true}).click();await p.locator('.rs56-day-overview .rs56-day-map').waitFor();await p.waitForFunction(()=>document.querySelector('.rs56-day-map .map')?.dataset.rsBasemap==='positron',null,{timeout:35000});
 if(baseline)await shot('timeline');else {
 await layout('timeline');
 await p.locator('.rs56-day-map .rs-course-end-pin .rs-end-label').waitFor();
 assert.equal(await p.locator('.rs56-day-map .rs-course-end-pin .rs-end-label').innerText(),'종료');
 const recap=p.locator('.rs33-timeline .rs-game-recap');
 assert.equal(await recap.count(),1,'completed day should render one passive result card');
 assert.match(await recap.innerText(),/\+40 XP/,'same-day rides award XP once');
 assert.equal(await recap.locator('.rs-game-recap-award').count(),1,'first ride achievement unlocks only once');
 assert.equal(await recap.locator('.rs-game-copy').count(),0,'recap excludes redundant sharing actions');
 assert.ok(await recap.evaluate(el => Boolean(el.compareDocumentPosition(document.querySelector('.rs56-day-overview')) & Node.DOCUMENT_POSITION_FOLLOWING)), 'recap is above map');
 assert.equal(await p.locator('.rs56-day-course>.rs33-course-controls').count(),0,'route controls are in the lower toolbar');
 assert.equal(await p.locator('.rs56-day-course .rs59-course-tools').count(),1,'one consolidated lower toolbar');
 assert.equal(await p.locator('.rs56-day-course .rs59-course-tools button').count(),3,'three compact controls');
 assert.equal(await p.locator('.rs56-day-header').count(),0,'no redundant day-route title');
 const eventToggle=p.getByRole('button',{name:'이벤트 켜기'});
 await eventToggle.click();
 await p.getByRole('button',{name:'이벤트 끄기'}).waitFor();
 await p.locator('.rs56-day-map .rs33-stamp-label.stop').first().waitFor();
 await p.evaluate(()=>{ window.__rsMap.setZoom(11); });
 await p.waitForTimeout(350);
 const cityStops=await p.locator('.rs56-day-map .rs33-stamp-label.stop').count();
 assert.ok(cityStops>=40,'citywide zoom keeps each recorded stop visible: '+cityStops);
 await p.evaluate(()=>{ window.__rsMap.setZoom(9); });
 await p.waitForTimeout(350);
 const distantStops=await p.locator('.rs56-day-map .rs33-stamp-label.stop').count();
 assert.ok(distantStops>0 && distantStops<cityStops,'distant zoom clusters events rather than hides them');
 assert.ok(await p.locator('.rs56-day-map .rs33-stamp-cluster').count()>0,'stop clusters show event counts');
 await p.getByRole('button',{name:'이벤트 끄기'}).click();
 assert.equal(await p.locator('.rs56-stop-events').count(),0,'event list hidden when events are off');
 assert.equal(await p.locator('.rs56-ride-choice').count(),3);
 const player=p.locator('.rs56-day-overview .rs59-player');for(const speed of ['10','20','30','60','100'])await player.getByRole('combobox',{name:'경로 재생 배속'}).selectOption(speed);
 await player.getByRole('button',{name:'경로 재생 시작',exact:true}).click();await p.waitForFunction(()=>Number(document.querySelector('.rs59-seek').value)>1000);await player.getByRole('button',{name:'경로 재생 일시정지'}).click();const v=await player.locator('.rs59-seek').inputValue();await p.waitForTimeout(200);assert.equal(await player.locator('.rs59-seek').inputValue(),v);
 await player.locator('.rs59-seek').focus();await player.locator('.rs59-seek').press('End');await player.getByRole('button',{name:'경로 재생 종료하고 전체 경로 보기'}).click();
 await p.getByRole('button',{name:'크게 보기',exact:true}).click();await p.getByRole('dialog',{name:'전체 화면 하루 운행 지도'}).waitFor();await shot('fullscreen');await p.keyboard.press('Escape');
 await p.locator('.rs56-ride-choice').first().click();await p.locator('.rs33-trip-detail').waitFor();await layout('trip-detail');await p.getByRole('button',{name:'‹ 운행 목록',exact:true}).click();await p.locator('.rs56-ride-choice').last().click();assert.match(await p.locator('.rs33-trip-summary').innerText(),/0 km/);await p.getByRole('button',{name:'‹ 운행 목록',exact:true}).click();

 }
 await nav.getByRole('button',{name:'업무',exact:true}).click();await p.locator('.rs-work-hub').waitFor();await p.waitForTimeout(700);if(baseline)await shot('tools');else {await layout('tools');await p.locator('[data-rs-tab="earnings"]').first().click();
await p.locator('form[data-rs-form="earnings"]').waitFor();
await p.locator('input[name="work_date"]').fill('2026-11-16');
await p.locator('[data-rs-fill-ride]').click();
const copiedHours=Number(await p.locator('input[name="hours"]').inputValue());
const copiedKm=Number(await p.locator('input[name="distance_km"]').inputValue());
assert.ok(copiedHours>0&&copiedKm>0,'existing GPS history fills manual earnings form without syncing financial data');
await p.getByRole('button',{name:'‹ 업무 목록'}).click();
await p.locator('[data-rs-tab="fuel"]').click();await p.getByText('주유 빠르게 기록',{exact:true}).waitFor();await layout('fuel');await p.getByRole('button',{name:'‹ 업무 목록'}).click();}
 await nav.getByRole('button',{name:'커뮤니티',exact:true}).click();await p.locator('.rc-feed-row').first().waitFor();if(baseline)await shot('community');else {
 await layout('community');
 assert.equal(await p.locator('.rs-lounge-quick .rs-lounge-actions button').count(),2,'existing community offers local quick prompts');
 const feed=await p.locator('.rc-card-list').evaluate(el=>{
  const cards=[...el.querySelectorAll('.rc-feed-row')].map(row=>{
    const bounds=row.getBoundingClientRect();
    const img=row.querySelector('.rc-card-grid img')?.getBoundingClientRect();
    const footer=row.querySelector('.rc-card-bottom')?.getBoundingClientRect();
    const like=row.querySelector('.rc-row-like')?.getBoundingClientRect();
    const meta=row.querySelector('.rc-row-meta')?.getBoundingClientRect();
    return {top:bounds.top,bottom:bounds.bottom,left:bounds.left,right:bounds.right,
      border:getComputedStyle(row).borderTopWidth,radius:parseFloat(getComputedStyle(row).borderTopLeftRadius),
      image:img&&{top:img.top,bottom:img.bottom,left:img.left,right:img.right},
      footer:footer&&{top:footer.top,bottom:footer.bottom},
      like:like&&{top:like.top,bottom:like.bottom,left:like.left,right:like.right},
      meta:meta&&{top:meta.top,bottom:meta.bottom,left:meta.left,right:meta.right}};
  });
  return {listBorder:getComputedStyle(el).borderTopWidth,cards};
 });
 assert.equal(feed.listBorder,'0px','list wrapper must not be one big post card');
 assert.ok(feed.cards.length>=2,'need multiple separate post cards');
 for(let i=0;i<feed.cards.length;i++){
  const card=feed.cards[i];
  assert.ok(card.radius>=10&&card.border!=='0px','each post needs own rounded border');
  assert.ok(card.footer&&card.meta&&card.like,'each post footer must have metadata and like');
  assert.ok(card.like.left>=card.meta.right-2,'like must not overlay metadata');
  assert.ok(card.like.top>=card.footer.top-2&&card.like.bottom<=card.footer.bottom+2,
    'like must remain inside its footer');
  assert.ok(card.bottom>=card.footer.bottom-1,'footer must fit in card');
  if(card.image)assert.ok(card.image.left>=card.left&&card.image.right<=card.right&&card.image.bottom<=card.bottom,
    'thumbnail must remain inside post card');
  if(i)assert.ok(feed.cards[i-1].bottom+4<=card.top,'posts must not merge into one white rectangle');
 }
 assert.ok(feed.cards.some(card=>card.image),'image thumbnail must be covered by layout test');
 // The real Android screenshot showed oversized detail photo, misplaced actions
 // and the reply field below the navigation. Exercise the detail WITH a photo.
 await p.locator('.rc-feed-row').filter({hasText:'수완동 픽업할 때 잠깐 쉴 곳 공유해요'}).locator('.rc-card-main').click();
 await p.locator('.rs63-post-detail').waitFor();
 const detail=await p.locator('.rs63-post-detail').evaluate(el=>{
   const bb=selector=>{const node=el.querySelector(selector);const r=node?.getBoundingClientRect();return r?{top:r.top,bottom:r.bottom,left:r.left,right:r.right,height:r.height,width:r.width}:null;};
   return {title:bb('.rc-detail-head'),body:bb('.rc-detail-body'),image:bb('.rc-detail-photo'),
     actions:bb('.rc-detail-actions'),comments:bb('.rc-comments-title'),
     form:bb('.rc-comment-form'),footer:bb('.rs63-post-primary-actions'),
     manage:bb('.rs63-post-manage-menu'),composer:bb('.rc-comment-form textarea'),
     scrollWidth:document.documentElement.scrollWidth};
 });
 assert.ok(detail.image&&detail.image.height<=361,'detail image must fit compact height without cropping');
 assert.ok(detail.title.bottom<=detail.body.top+1,'post header should precede body');
 assert.ok(detail.body.bottom<=detail.image.top+1,'photo must follow body without overlap');
 assert.ok(detail.image.bottom<=detail.actions.top+1,'actions must follow image');
 assert.ok(detail.actions.bottom<=detail.comments.top+1,'comments must follow actions');
 assert.ok(detail.footer&&detail.manage&&detail.footer.bottom<=detail.actions.bottom+1
   &&detail.manage.bottom<=detail.actions.bottom+1,'post actions must remain inside toolbar');
 assert.ok(detail.composer&&detail.composer.height>=48,'reply field must be accessible and multiline');
 assert.ok(detail.scrollWidth<=width+1,'post detail must not overflow horizontally');
 await layout('community-photo-detail');
 await p.locator('.rs63-comment-jump').click();
 await p.locator('.rc-comments-title').waitFor();
 await p.locator('.rc-comment-form textarea').fill('전송하지 않는 QA 댓글');
 assert.equal(await p.locator('.rc-comment-form textarea').inputValue(),'전송하지 않는 QA 댓글');
 await p.getByRole('button',{name:'‹ 커뮤니티'}).click();
 const categories=p.locator('.rc-categories');
 const initialScroll=await categories.evaluate(el=>el.scrollLeft);
 await p.getByRole('button',{name:'다음 카테고리 보기'}).click();
 await p.waitForTimeout(400);
 assert.ok(await categories.evaluate(el=>el.scrollLeft)>initialScroll,'category next control must scroll the full labels into view');
 await p.getByRole('button',{name:'질문·노하우',exact:true}).click();assert.equal(await p.locator('.rc-feed-row').count(),1);await p.getByLabel('게시글 검색',{exact:true}).fill('존재하지않는검색어');await p.getByRole('heading',{name:'검색 결과가 없어요'}).waitFor();await shot('empty');await p.getByRole('button',{name:'검색어 지우기'}).click();await p.locator('.rc-card-main').first().click();await p.locator('.rc-detail').waitFor();await layout('post-detail');await p.getByRole('button',{name:'‹ 커뮤니티'}).click();await p.getByRole('button',{name:'＋ 글쓰기'}).click();await p.locator('.rc-editor').waitFor();await p.locator('input[name="title"]').fill('등록하지 않는 테스트 초안');await p.setViewportSize({width,height:500});await shot('keyboard-resize');assert.ok(await p.locator('input[name="title"]').isVisible());await p.setViewportSize({width,height:844});
 }
 await nav.getByRole('button',{name:'내 정보',exact:true}).click();await p.locator('.profile').waitFor();if(baseline)await shot('profile');else {await layout('profile');
 assert.equal(await p.locator('.rs-profile-page>.rs-metrics').count(),1);
 const game=p.locator('.rs-game-profile');
 await game.waitFor();
 await p.locator('.rs-journey-panel .rs-rhythm').waitFor();
 assert.equal(await p.locator('.rs-rhythm-stats>div').count(),3,'personal pace replaces territory conquest');
 assert.match(await game.innerText(),/첫 출발/);
 assert.equal(await game.getByRole('progressbar',{name:'다음 라이더 레벨까지 경험치'}).getAttribute('aria-valuenow'),'40');
 await game.locator('.rs-game-collection summary').click();
 const feature=game.locator('.rs-game-badge-pick').first();
 await feature.click();
 assert.equal(await feature.getAttribute('aria-pressed'),'true','unlocked badge decorates profile');
 assert.equal(await game.locator('.rs-game-achievement').count(),5,'all collectible badges visible');
 assert.equal(await game.locator('.rs-game-achievement.rs-game-earned').count(),1);
 await shot('profile-achievements');await p.getByLabel('개인 메모',{exact:true}).fill('테스트 초안');}
 if(!baseline){await nav.getByRole('button',{name:'지도',exact:true}).click();await p.waitForFunction(()=>document.querySelector('.map')?.dataset.rsBasemap==='positron',null,{timeout:35000});await p.reload();await p.getByRole('navigation',{name:'주 메뉴'}).waitFor();assert.equal(await p.evaluate(id=>localStorage.getItem('rs:trips:'+id),userId),original);assert.deepEqual(errors,[]);
 // Verify the new live map after validating previously saved data, so
 // simulated active-trip recovery cannot change the legacy snapshot assertion.
 await nav.getByRole('button',{name:'타임라인',exact:true}).click();
 // Active-ride QA: never write a real user trip or change the production GPS.
 await p.evaluate((uid)=>{
   const now=Date.now();
   window.__rsRideApi.restoreActive({
     id:'44444444-4444-4444-8444-444444444444',
     user_id:uid,started_at:new Date(now-60000).toISOString(),
     ended_at:null,distance_km:0.6,events:[],
     points:[
       {lat:35.16,lng:126.82,t:now-30000,accuracy:8},
       {lat:35.17,lng:126.83,t:now-8000,accuracy:8,heading:70},
     ],
   });
 },userId);
 await p.locator('.rs33-trip-detail .rs-course-start-pin').waitFor({timeout:12000});
 assert.equal(await p.locator('.rs33-trip-detail .rs-game-recap').count(),0,
   'active ride must remain free of gamification and rewards');
 await p.locator('.rs33-trip-detail .rs-nav-live-location').waitFor({timeout:12000});
 await p.locator('.rs33-trip-detail .rs-nav-dot').waitFor();
 assert.equal(await p.locator('.rs33-trip-detail .rs-nav-stale').count(),0,
   'fresh native ride fix must be rendered as blue GPS location');
 await p.getByRole('button',{name:'지도에서 내 현재 위치로 이동'}).click();
 await p.getByRole('button',{name:'현재 위치 자동 추적 끄기'}).waitFor();
 const cameraFix=await p.evaluate(()=>window.__rsMap?.getCenter());
 assert.ok(cameraFix&&Math.abs(cameraFix.lat-35.17)<0.0005&&Math.abs(cameraFix.lng-126.83)<0.0005,
   'follow button must focus the latest GPS position');
 await p.evaluate(()=>window.__rsMap.fire('dragstart'));
 await p.getByRole('button',{name:'지도에서 내 현재 위치로 이동'}).waitFor();
 await p.getByRole('button',{name:'지도에서 내 현재 위치로 이동'}).click();
 await p.getByRole('button',{name:'현재 위치 자동 추적 끄기'}).waitFor();
 await shot('timeline-live-position');
 assert.deepEqual(errors,[]);}
 console.log('PASS',mode,'five screens, Positron, '+(baseline?'baseline evidence':'sheets, controls, filters, replay, small keyboard viewport, records unchanged'));
 }catch(e){await shot('FAILURE').catch(()=>{});console.error('FAIL',mode,errors);throw e;}finally{await ctx.close();}
}
(async()=>{browser=await chromium.launch({args:['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});try{for(const width of baseline?[390]:[360,390,430])for(const native of baseline?[false]:[false,true])await check(width,native);}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
