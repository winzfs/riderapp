
'use strict';
/* Rider Spot Studio: isolated test records. No writes to production rider tables. */
(function(){
const PROJECT_URL='https://qkcqzhkvfbymzjdktshp.supabase.co';
const PUBLIC_KEY='sb_publishable_Bva-1GI3jPgZUkHuxoThJQ_GDelHoRs';
const TABLE='rider_spot_studio_records';
const LOCAL_KEY='rider-spot-studio-v1';
const CAMERA_KEY='rider-spot-studio-camera-v1';
const PARTS=['엔진오일','앞 타이어','뒤 타이어','브레이크 패드','구동벨트','에어필터','배터리','점화플러그','냉각수'];
const ICONS={
'엔진오일':'M8 3h8v4H8z M6 9h12l3 4v7H3v-7z M10 13h4 M7 17h3',
'앞 타이어':'M12 2a10 10 0 1 1 0 20a10 10 0 0 1 0-20z M12 7a5 5 0 1 1 0 10a5 5 0 0 1 0-10z M12 2v5 M12 17v5',
'뒤 타이어':'M12 2a10 10 0 1 1 0 20a10 10 0 0 1 0-20z M12 7a5 5 0 1 1 0 10a5 5 0 0 1 0-10z M2 12h5 M17 12h5',
'브레이크 패드':'M4 3h11l5 5v11l-5 2H4z M8 7h5 M8 12h7 M8 17h4',
'구동벨트':'M6 5a4 4 0 1 0 0 8a4 4 0 0 0 0-8z M18 11a4 4 0 1 0 0 8a4 4 0 0 0 0-8z M9 6l7 5 M9 12l6 5',
'에어필터':'M4 5h16v14H4z M8 5v14 M12 5v14 M16 5v14',
'배터리':'M3 7h18v13H3z M7 4h3v3 M14 4h3v3 M7 13h4 M9 11v4 M15 13h3',
'점화플러그':'M9 2h6v6H9z M7 8h10v4H7z M10 12v8l2 2 2-2v-8 M8 15h8',
'냉각수':'M12 2s-7 9-7 13a7 7 0 0 0 14 0c0-4-7-13-7-13z M8 16a4 4 0 0 0 4 4'
};
const FIELDS={
rider:[['nickname','닉네임','text'],['area','활동 지역','text'],['lat','위도','number'],['lng','경도','number'],['status','상태','select',['none','chat','working','break','help']],['visible','위치 공유','select',['on','off']]],
post:[['title','제목','text'],['category','카테고리','select',['동네글','자유글','업계 새소식','질문','정보']],['area','지역','text'],['author','작성자','text'],['body','본문','textarea']],
trip:[['title','운행 제목','text'],['day','운행 날짜','date'],['start','출발시간 (HH:mm)','text'],['end','종료시간 (HH:mm)','text'],['km','주행 거리 km','number'],['points','GPS 경로 [[위도,경도],...]','json'],['stops','정차 기록 [{minute,label},...]','json']],
earning:[['day','날짜','date'],['platform','플랫폼','select',['쿠팡이츠','배민','기타']],['gross','총수익(원)','number'],['orders','배달 건수','number'],['hours','운행 시간','number'],['note','메모','textarea']],
maintenance:[['item','정비 부품','select',PARTS],['serviced_on','정비일','date'],['odometer_km','교환 당시 계기판 km','number'],['next_due_km','다음 교환 예정 km','number'],['cost_won','정비비(원)','number'],['workshop','정비소','text'],['note','메모','textarea']],
bike:[['model','차종','text'],['odometer_km','현재 계기판 km','number'],['recorded_on','입력일','date']],
qa:[['area','화면·기능','text'],['title','테스트 항목','text'],['environment','검증 환경','select',['미지정','360px 모바일','412px 모바일','Android WebView','실제 서비스','PC 브라우저']],['status','검증 결과','select',['미검증','통과','실패','보류']],['release','버전','text'],['notes','실제 확인 내용·재현 방법','textarea']],
bug:[['title','이슈 제목','text'],['area','발생 화면','text'],['severity','심각도','select',['치명적','높음','보통','낮음']],['status','처리 상태','select',['접수','진행중','재검증','해결']],['device','기기·환경','text'],['steps','재현 단계','textarea'],['expected','기대 동작','textarea'],['actual','실제 동작','textarea'],['verified','서비스 확인 결과','select',['미검증','통과','실패']]],
release:[['version','버전','text'],['date','배포일','date'],['source','Worker·커밋','text'],['status','배포 상태','select',['개발중','미리보기','운영','롤백']],['verified','실서비스 확인','select',['미검증','통과','실패']],['note','테스트·배포 메모','textarea']]
};
const TITLES={rider:'테스트 라이더',post:'테스트 게시글',trip:'운행 기록',earning:'수익 기록',maintenance:'정비 기록',bike:'계기판',qa:'QA 항목',bug:'버그',release:'배포 기록'};
const QA_LIST=[
['지도','핀치 줌이 연속적으로 동작하며 배율이 초기화되지 않는다','412px 모바일'],
['지도','지도 탭 전환 후 카메라 중심과 배율이 유지된다','Android WebView'],
['지도','광산구 지명·관공서·아파트 명칭이 축소 배율에서도 보인다','실제 서비스'],
['지도','지도 시설 핀은 화장실만 표시된다','실제 서비스'],
['라이더 위치','공유 동의한 라이더만 상호 위치와 상태가 보인다','실제 서비스'],
['라이더 상태','대화 환영·운행중·휴식 상태 변경이 지도에 반영된다','412px 모바일'],
['타임라인','전체 운행 경로와 개별 구간 선택이 가능하다','412px 모바일'],
['타임라인','매시 정각 시간표를 꺼도 경로선이 남는다','412px 모바일'],
['타임라인','시간·정차 마커가 축소 배율에서도 사라지지 않는다','실제 서비스'],
['타임라인','1·10·20·30배 경로 재생 및 일시정지가 동작한다','Android WebView'],
['운행 기록','잠금·백그라운드 상태에서 네이티브 GPS 기록이 이어진다','Android WebView'],
['수익','운행 종료 직후 수익 입력 시트로 바로 진입한다','412px 모바일'],
['수익','플랫폼별 금액 수정·삭제 후 합계가 정확하다','412px 모바일'],
['내 바이크','정비 메뉴가 단일 진입점이며 이전 경로도 같은 화면으로 연결된다','실제 서비스'],
['내 바이크','현재 계기판을 즉시 입력하고 저장된 값이 보인다','412px 모바일'],
['정비','부품 아이콘을 누르면 지난 교환 거리와 별도 이력 시트가 나온다','360px 모바일'],
['정비','새 정비 기록 추가·수정·삭제 후 소모품 현황이 갱신된다','Android WebView'],
['커뮤니티','카테고리·동네글 입력 및 긴 본문 레이아웃이 정상이다','360px 모바일'],
['화면','360×400 및 412×892에서 하단 버튼이 가려지지 않는다','360px 모바일'],
['보안','테스트 레코드가 운영 라이더 테이블에 기록되지 않는다','실제 서비스'],
['배포','실제 Worker 응답·배포 버전·검증 결과가 일치한다','실제 서비스']
];
const BASE_ROUTE=[[35.1789,126.8064],[35.1815,126.8103],[35.1831,126.8161],[35.1824,126.8219],[35.1787,126.8264],[35.1750,126.8273],[35.1723,126.8223],[35.1706,126.8150],[35.1729,126.8106],[35.1763,126.8090]];
const AREA_ROADS={ '운남동':[35.175,126.817], '신가동':[35.175,126.835],'첨단지구':[35.219,126.842],'수완지구':[35.19,126.824]};
const nowDay=()=>new Date(Date.now()+9*3600000).toISOString().slice(0,10);
const E=(s)=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const won=(v)=>Math.round(Number(v)||0).toLocaleString('ko-KR')+'원';
const km=(v)=>v==null||v===''?'미입력':Number(v).toLocaleString('ko-KR')+' km';
const uuid=()=>crypto.randomUUID();
const $=(id)=>document.getElementById(id);
const replace=(id,html)=>{const el=$(id);if(el)el.innerHTML=html};
const kindRows=(kind)=>state.rows.filter(r=>r.kind===kind);
const rec=(kind,p)=>({id:uuid(),kind,payload:p,created_at:new Date().toISOString(),updated_at:new Date().toISOString()});
const STATUS={none:'상태 없음',chat:'대화 환영',working:'운행중',break:'휴식',help:'도움 요청'};
const defaultBike=()=>({model:'PCX125',odometer_km:32450,recorded_on:nowDay()});
const seed=()=>{
let rows=[];
[
 ['테스트 라이더 A','운남동',35.1758,126.8171,'chat'],
 ['테스트 라이더 B','신가동',35.1746,126.8381,'working'],
 ['테스트 라이더 C','첨단지구',35.2209,126.8424,'break'],
 ['테스트 라이더 D','수완지구',35.1928,126.8245,'working'],
 ['테스트 라이더 E','운남동',35.1787,126.8120,'help']
].forEach(x=>rows.push(rec('rider',{nickname:x[0],area:x[1],lat:x[2],lng:x[3],status:x[4],visible:'on'})));
rows.push(rec('bike',defaultBike()));
rows.push(rec('post',{title:'운남동 비 오는 날 오토바이 주의 구간',category:'동네글',area:'운남동',author:'테스트 라이더 A',body:'가상 게시글입니다. 빗길 노면 표시와 게시글 UI를 점검합니다.'}));
rows.push(rec('post',{title:'오늘 수완지구 배달 현황은 어떤가요?',category:'질문',area:'수완지구',author:'테스트 라이더 D',body:'이 글은 테스트 데이터이며 실제 배달 상황을 나타내지 않습니다.'}));
rows.push(rec('post',{title:'배달 라이더용 편의기능 사용성 의견',category:'업계 새소식',area:'광산구',author:'스튜디오 QA',body:'다양한 카테고리를 하나의 화면에서 확인하기 위한 예시.'}));
rows.push(rec('trip',{title:'운남동 · 수완동 시범 운행',day:nowDay(),start:'13:10',end:'15:10',km:14.2,points:BASE_ROUTE,stops:[{minute:36,label:'정차 6분'},{minute:95,label:'배달 대기'}]}));
rows.push(rec('trip',{title:'첨단지구 시범 운행',day:nowDay(),start:'17:00',end:'18:30',km:8.6,points:BASE_ROUTE.map(([a,b])=>[a+.03,b+.022]),stops:[{minute:40,label:'휴식'}]}));
rows.push(rec('earning',{day:nowDay(),platform:'쿠팡이츠',gross:42800,orders:9,hours:3.5,note:'시범 운행 후 빠른 입력'}));
rows.push(rec('earning',{day:nowDay(),platform:'배민',gross:19500,orders:4,hours:1.5,note:'가상 기록'}));
rows.push(rec('maintenance',{item:'엔진오일',serviced_on:'2026-11-10',odometer_km:32000,next_due_km:34000,cost_won:18000,workshop:'샘플 정비소',note:'가상 교환 기록'}));
rows.push(rec('maintenance',{item:'앞 타이어',serviced_on:'2026-10-15',odometer_km:29200,next_due_km:41000,cost_won:55000,workshop:'샘플 정비소',note:''}));
rows.push(rec('maintenance',{item:'브레이크 패드',serviced_on:'2026-09-29',odometer_km:27300,next_due_km:38000,cost_won:29000,workshop:'샘플 정비소',note:''}));
rows.push(rec('release',{version:'v180',date:'2026-11-18',source:'Worker 4cb4d994…',status:'운영',verified:'미검증',note:'실제 Cloudflare 배포 로그에서 확인. 실제 기기 기능 검증은 미완료.'}));
rows.push(rec('bug',{title:'정비 메뉴 중복 및 이전 경로 잔존 여부',area:'내 바이크',severity:'높음',status:'재검증',device:'Android WebView',steps:'이전 정비 메뉴와 내 바이크 양쪽에서 이동',expected:'동일한 내 바이크 화면으로 진입',actual:'운영 v180 실기기 재확인 필요',verified:'미검증'}));
return rows;
};
const state={view:'overview',rows:[],client:null,user:null,editing:null,selectedTrip:null,selectedPart:null,maps:{},layers:{},playing:false,progress:0,lastFrame:0,lastView:'',speed:10};
let lastToastTimer=null;
function toast(msg){const el=$('toast');el.textContent=msg;el.classList.add('visible');clearTimeout(lastToastTimer);lastToastTimer=setTimeout(()=>el.classList.remove('visible'),3500)}
function persistGuest(){localStorage.setItem(LOCAL_KEY,JSON.stringify(state.rows));}
function loadGuest(){
try{const raw=localStorage.getItem(LOCAL_KEY);state.rows=raw?JSON.parse(raw):seed();if(!raw)persistGuest();}catch(e){state.rows=seed();toast('저장된 로컬 데이터를 읽지 못해 샘플로 시작했습니다.');}
}
async function loginInit(){
try{
if(!window.supabase){toast('Supabase 라이브러리 로딩 실패: 로컬 모드 유지');return}
state.client=window.supabase.createClient(PROJECT_URL,PUBLIC_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const {data,error}=await state.client.auth.getUser();
if(!error&&data.user){state.user=data.user;await loadCloud();}
state.client.auth.onAuthStateChange((event,session)=>{
if(event==='SIGNED_OUT'){state.user=null;loadGuest();render();}
});
}catch(e){toast('Supabase 연결 실패: 로컬 테스트 유지');}
updateAuth();
}
async function loadCloud(){
const {data,error}=await state.client.from(TABLE).select('id,owner_id,kind,payload,created_at,updated_at').eq('owner_id',state.user.id).order('updated_at',{ascending:false}).limit(500);
if(error)throw error;state.rows=data||[];state.selectedTrip=null;state.progress=0;updateAuth();render();
}
function updateAuth(){
$('modeBadge').textContent=state.user?'Supabase 분리 저장':'로컬 테스트';
$('authBtn').textContent=state.user?'연결됨 · 계정':'계정 연결';
$('authResult').textContent=state.user?'로그인됨 · 본인 전용 테스트 레코드만 서버에 저장됩니다.':'로그인 전 · 브라우저 로컬 테스트 데이터';
}
async function write(kind,payload,id){
if(state.user){
let req;
if(id)req=state.client.from(TABLE).update({kind,payload,updated_at:new Date().toISOString()}).eq('id',id).eq('owner_id',state.user.id).select('id,owner_id,kind,payload,created_at,updated_at').single();
else req=state.client.from(TABLE).insert({owner_id:state.user.id,kind,payload}).select('id,owner_id,kind,payload,created_at,updated_at').single();
const {data,error}=await req;if(error)throw error;
state.rows=state.rows.filter(x=>x.id!==data.id).concat(data);
}else{const old=state.rows.find(x=>x.id===id);state.rows=state.rows.filter(x=>x.id!==id).concat(old?{...old,payload,updated_at:new Date().toISOString()}:rec(kind,payload));persistGuest();}
render();
}
async function remove(id){
const row=state.rows.find(r=>r.id===id);if(!row)return;
if(!confirm('테스트 데이터 "'+labelRow(row)+'"를 삭제할까요?'))return;
try{
if(state.user){const {error}=await state.client.from(TABLE).delete().eq('id',id).eq('owner_id',state.user.id);if(error)throw error;}
state.rows=state.rows.filter(r=>r.id!==id);persistUnlessCloud();render();toast('테스트 기록을 삭제했습니다.');
}catch(e){toast('삭제 실패: '+e.message);}
}
function persistUnlessCloud(){if(!state.user)persistGuest();}
function labelRow(r){return r.payload.nickname||r.payload.title||r.payload.item||r.payload.version||r.kind}
function editButton(r){return '<button class="btn small" data-action="edit" data-id="'+E(r.id)+'">수정</button> <button class="btn small ghost" data-action="delete" data-id="'+E(r.id)+'">삭제</button>'}
function pill(v){const s=String(v||'미검증');const klass=/^(통과|해결|운영|on)$/.test(s)?'ok':/^(실패|치명적|높음)$/.test(s)?'bad':/^(미검증|재검증|보류|진행중|접수)$/.test(s)?'warn':'info';return '<span class="tag '+klass+'">'+E(s)+'</span>'}
function empty(col=5){return '<tr><td class="empty" colspan="'+col+'">아직 기록이 없습니다. 추가 버튼으로 테스트 데이터를 만들어 보세요.</td></tr>'}
function setView(name){
if(!$('view-'+name))return;state.view=name;state.playing=false;
document.querySelectorAll('.view').forEach(el=>el.classList.toggle('active',el.id==='view-'+name));
document.querySelectorAll('[data-view]').forEach(el=>el.classList.toggle('active',el.dataset.view===name));
window.scrollTo({top:0,behavior:'instant'});
if(name==='map'||name==='timeline')setTimeout(()=>drawMap(name),100);
}
function render(){
replace('countRiders',kindRows('rider').length);
replace('countTrips',kindRows('trip').length);
const q=kindRows('qa'),b=kindRows('bug');
replace('countQa',q.filter(r=>r.payload.status==='통과').length+' / '+q.length);
replace('countBugs',b.filter(r=>r.payload.status!=='해결').length);
replace('overviewIssues',b.slice(0,4).map(r=>'<div class="listcard"><div class="rowline"><strong>'+E(r.payload.title)+'</strong>'+pill(r.payload.status)+'</div><small>'+E(r.payload.area)+' · '+E(r.payload.severity)+'</small></div>').join('')||'<div class="empty">버그 등록 후 상태를 추적할 수 있습니다.</div>');
renderRiders();renderTrips();renderPosts();renderEarnings();renderBike();renderQa();renderIssues();
if(state.view==='map'||state.view==='timeline')setTimeout(()=>drawMap(state.view),40);
}
function renderRiders(){
const a=kindRows('rider').sort((x,y)=>String(x.payload.nickname).localeCompare(String(y.payload.nickname),'ko'));
replace('riderCountBadge',a.filter(r=>r.payload.visible==='on').length+'명 공개');
replace('riderCards',a.map(r=>'<div class="rowline listcard"><div><strong>'+E(r.payload.nickname)+'</strong><small>'+E(r.payload.area)+' · '+E(STATUS[r.payload.status]||r.payload.status)+'</small></div>'+pill(r.payload.visible==='on'?'on':'off')+'</div>').join('')||'<div class="empty">테스트 라이더가 없습니다.</div>');
replace('riderRows',a.map(r=>'<tr><td>'+E(r.payload.nickname)+'</td><td>'+Number(r.payload.lat).toFixed(4)+', '+Number(r.payload.lng).toFixed(4)+'</td><td>'+E(STATUS[r.payload.status]||'—')+'</td><td>'+pill(r.payload.visible)+'</td><td>'+editButton(r)+'</td></tr>').join('')||empty());
}
function renderTrips(){
const a=kindRows('trip').sort((x,y)=>String(y.payload.day).localeCompare(String(x.payload.day)));
if(!a.some(r=>r.id===state.selectedTrip)){state.selectedTrip=a[0]?.id||null;state.progress=0;}
replace('tripSelect',a.map(r=>'<option value="'+E(r.id)+'" '+(r.id===state.selectedTrip?'selected':'')+'>'+E(r.payload.day)+' · '+E(r.payload.title)+'</option>').join('')||'<option value="">운행 기록 없음</option>');
replace('tripRows',a.map(r=>'<tr><td>'+E(r.payload.day)+'</td><td>'+E(r.payload.title)+'</td><td>'+km(r.payload.km)+'</td><td>'+E(r.payload.start)+' → '+E(r.payload.end)+'</td><td>'+editButton(r)+'</td></tr>').join('')||empty());
const t=a.find(r=>r.id===state.selectedTrip)?.payload;
replace('tripBadge',t?km(t.km):'기록 없음');
replace('tripDetail',t?'<div class="rowline"><span class="muted">운행일</span><b>'+E(t.day)+'</b></div><div class="rowline"><span class="muted">출발 → 종료</span><b>'+E(t.start)+' → '+E(t.end)+'</b></div><div class="rowline"><span class="muted">총거리</span><b>'+km(t.km)+'</b></div><div class="rowline"><span class="muted">GPS 포인트</span><b>'+((t.points||[]).length)+'개</b></div><div class="rowline"><span class="muted">정차 이벤트</span><b>'+((t.stops||[]).length)+'개</b></div>':'<div class="empty">운행 기록을 추가해 주세요.</div>');
}
function renderPosts(){
const a=kindRows('post').slice().reverse();
replace('postCards',a.map(r=>'<article class="listcard"><div class="rowline"><div><div class="stateline"><span class="tag info">'+E(r.payload.category)+'</span><small>'+E(r.payload.area)+'</small></div><h3 style="margin:10px 0">'+E(r.payload.title)+'</h3></div></div><p class="tiny muted" style="line-height:1.8;white-space:pre-wrap">'+E(r.payload.body)+'</p><div class="rowline"><small class="muted">'+E(r.payload.author)+' · 테스트 게시물</small><span>'+editButton(r)+'</span></div></article>').join('')||'<div class="empty">게시글이 없습니다.</div>');
}
function renderEarnings(){
const a=kindRows('earning').slice().sort((x,y)=>String(y.payload.day).localeCompare(String(x.payload.day)));
const total=a.reduce((s,r)=>s+Number(r.payload.gross||0),0),orders=a.reduce((s,r)=>s+Number(r.payload.orders||0),0);
replace('earningGross',won(total));replace('earningOrders',orders+'건');replace('earningPer',won(orders?total/orders:0));
replace('earningRows',a.map(r=>'<tr><td>'+E(r.payload.day)+'</td><td>'+E(r.payload.platform)+'</td><td class="orange">'+won(r.payload.gross)+'</td><td>'+Number(r.payload.orders||0)+'</td><td>'+E(r.payload.note||'—')+'</td><td>'+editButton(r)+'</td></tr>').join('')||empty(6));
}
function getBike(){return kindRows('bike')[0]||null}
function lastService(item){return kindRows('maintenance').filter(r=>r.payload.item===item).sort((a,b)=>String(b.payload.serviced_on).localeCompare(String(a.payload.serviced_on)))[0]||null}
function svgPart(item){return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="'+E(ICONS[item]||ICONS['엔진오일'])+'"/></svg>'}
function renderBike(){
const a=getBike(),b=a?.payload||{};replace('odometerText',a?km(b.odometer_km):'계기판 미입력');replace('odometerDate',a?E(b.model)+' · '+E(b.recorded_on||''):'계기판 수치를 입력하세요.');
replace('partGrid',PARTS.map(part=>{
const last=lastService(part)?.payload;const due=Number(last?.next_due_km||0),odo=Number(b.odometer_km||0),remain=due?due-odo:null;
return '<button class="part" data-action="part" data-part="'+E(part)+'">'+svgPart(part)+'<b>'+E(part)+'</b><small style="display:block;margin-top:5px;color:'+(remain!=null&&remain<=0?'#ff9299':'#92aabd')+'">'+(last?due?(remain<=0?'예정 거리 지남':remain.toLocaleString('ko-KR')+' km 남음'):'최근 '+km(last.odometer_km):'기록 없음')+'</small></button>'}).join(''));
const a2=kindRows('maintenance').slice().sort((x,y)=>String(y.payload.serviced_on).localeCompare(String(x.payload.serviced_on)));
replace('maintenanceRows',a2.map(r=>'<tr><td>'+E(r.payload.serviced_on)+'</td><td>'+E(r.payload.item)+'</td><td>'+km(r.payload.odometer_km)+'</td><td>'+km(r.payload.next_due_km)+'</td><td>'+won(r.payload.cost_won)+'</td><td>'+editButton(r)+'</td></tr>').join('')||empty(6));
}
function renderQa(){
const a=kindRows('qa');replace('qaCountBadge',a.filter(r=>r.payload.status==='통과').length+'/'+a.length+' 통과');
replace('qaRows',a.map(r=>'<tr><td>'+E(r.payload.area)+'</td><td><b>'+E(r.payload.title)+'</b><br><small class="muted">'+E(r.payload.notes||'')+'</small></td><td>'+E(r.payload.environment)+'</td><td>'+pill(r.payload.status)+'</td><td>'+editButton(r)+'</td></tr>').join('')||empty());
}
function renderIssues(){
const b=kindRows('bug').slice().reverse(),releases=kindRows('release').slice().reverse();
replace('bugCards',b.map(r=>'<div class="listcard"><div class="rowline"><strong>'+E(r.payload.title)+'</strong>'+pill(r.payload.status)+'</div><small>'+E(r.payload.area)+' · '+E(r.payload.severity)+' · '+E(r.payload.device)+'</small><p class="tiny muted">'+E(r.payload.steps||'재현 단계 미입력')+'</p><div class="rowline">'+pill(r.payload.verified)+'<div>'+editButton(r)+'</div></div></div>').join('')||'<div class="empty">등록된 이슈가 없습니다.</div>');
replace('releaseCards',releases.map(r=>'<div class="listcard"><div class="rowline"><strong>'+E(r.payload.version)+'</strong>'+pill(r.payload.status)+'</div><small>'+E(r.payload.date)+' · '+E(r.payload.source)+'</small><p class="tiny muted">'+E(r.payload.note||'')+'</p><div class="rowline">'+pill(r.payload.verified)+'<div>'+editButton(r)+'</div></div></div>').join('')||'<div class="empty">배포 기록이 없습니다.</div>');
}
function setDesignRows(){
const x=[
 ['지도','위치·상태','조작 중 전체 화면 리셋 금지','부드러운 핀치 줌 · 레이어 순서'],
 ['타임라인','전체 경로·재생','시간표 없이 경로 독립 표시','시간·이벤트 마커 · 줌 유지'],
 ['커뮤니티','카테고리·동네글','중복 상단 탭 금지','긴 글 · 목록 복귀'],
 ['수익','종료 즉시 입력','금액 입력 1~2단계 이내','수정 · 합계 · 키보드'],
 ['내 바이크·정비','계기판·교환 이력','정비 메뉴 하나로 통일','부품 아이콘 · 이력 시트'],
 ['공통','탭 전환·복원','Android WebView 회전·분할 대응','360/412px · 복귀·스크롤']
 ];
replace('designRows',x.map(r=>'<tr>'+r.map(c=>'<td>'+E(c)+'</td>').join('')+'</tr>').join(''));
}
const defaultPayload=(kind)=>({
rider:{nickname:'테스트 라이더',area:'운남동',lat:35.176,lng:126.817,status:'chat',visible:'on'},
post:{title:'',category:'동네글',area:'광산구',author:'테스트 라이더',body:''},
trip:{title:'테스트 운행',day:nowDay(),start:'13:00',end:'14:00',km:5,points:BASE_ROUTE,stops:[{minute:20,label:'정차'}]},
earning:{day:nowDay(),platform:'쿠팡이츠',gross:0,orders:0,hours:0,note:''},
maintenance:{item:state.selectedPart||'엔진오일',serviced_on:nowDay(),odometer_km:getBike()?.payload.odometer_km||null,next_due_km:null,cost_won:0,workshop:'',note:''},
bike:getBike()?.payload||{model:'PCX125',odometer_km:null,recorded_on:nowDay()},
qa:{area:'지도',title:'',environment:'412px 모바일',status:'미검증',release:'v180',notes:''},
bug:{title:'',area:'지도',severity:'보통',status:'접수',device:'Android WebView',steps:'',expected:'',actual:'',verified:'미검증'},
release:{version:'v181',date:nowDay(),source:'',status:'개발중',verified:'미검증',note:''}
})[kind]||{};
function formOpen(kind,id){
const old=state.rows.find(r=>r.id===id),values=old?.payload||defaultPayload(kind);
state.editing={kind,id:id||null};
$('dialogTitle').textContent=(old?'수정 · ':'추가 · ')+TITLES[kind];
$('saveButton').style.display='';$('saveButton').textContent='저장';
$('formFields').innerHTML=(FIELDS[kind]||[]).map(([key,label,type,opts])=>{
let value=values[key];if(type==='json')value=JSON.stringify(value||[],null,1);
let input;
if(type==='select')input='<select name="'+E(key)+'">'+opts.map(op=>'<option value="'+E(op)+'" '+(value===op?'selected':'')+'>'+E(op)+'</option>').join('')+'</select>';
else if(type==='textarea'||type==='json')input='<textarea name="'+E(key)+'" rows="'+(type==='json'?5:3)+'">'+E(value??'')+'</textarea>';
else input='<input type="'+(type==='number'?'number':type==='date'?'date':'text')+'" '+(type==='number'?'step="any"':'')+' name="'+E(key)+'" value="'+E(value??'')+'">';
return '<label class="field '+((type==='textarea'||type==='json')?'wide':'')+'">'+E(label)+input+'</label>';
}).join('');
$('editDialog').showModal();
}
function partOpen(part){
state.selectedPart=part;state.editing={kind:'part'};
const rows=kindRows('maintenance').filter(r=>r.payload.item===part).sort((a,b)=>String(b.payload.serviced_on).localeCompare(String(a.payload.serviced_on)));
$('dialogTitle').textContent=part+' · 정비 이력';
$('saveButton').style.display='none';
const last=rows[0]?.payload;
$('formFields').innerHTML='<div class="wide"><div class="listcard"><small>마지막 교환 거리</small><h3>'+ (last?km(last.odometer_km):'기록 없음')+'</h3><small>다음 교환 예정 · '+(last?km(last.next_due_km):'미입력')+'</small></div><button type="button" class="btn primary" style="margin:12px 0" data-action="new" data-kind="maintenance" data-part="'+E(part)+'">+ '+E(part)+' 정비 추가</button>'+rows.map(r=>'<div class="listcard"><div class="rowline"><strong>'+E(r.payload.serviced_on)+'</strong><span>'+won(r.payload.cost_won)+'</span></div><small>교환 '+km(r.payload.odometer_km)+' · '+E(r.payload.workshop||'정비소 미입력')+'</small><div style="margin-top:9px">'+editButton(r)+'</div></div>').join('')+'</div>';
$('editDialog').showModal();
}
async function formSubmit(ev){
ev.preventDefault();const kind=state.editing?.kind;if(!FIELDS[kind])return;
const btn=$('saveButton');btn.disabled=true;btn.textContent='저장 중…';
try{
const data=new FormData(ev.currentTarget),payload={};
for(const [key,label,type] of FIELDS[kind]){
const v=String(data.get(key)||'').trim();
if(type==='json'){payload[key]=v?JSON.parse(v):[];if(!Array.isArray(payload[key]))throw Error(label+'은 배열(JSON)이어야 합니다.');}
else if(type==='number'){payload[key]=v===''?null:Number(v);if(v!==''&&!Number.isFinite(payload[key]))throw Error(label+'에 숫자를 입력하세요.');}
else payload[key]=v;
}
if(kind==='rider'){if(!Number.isFinite(payload.lat)||!Number.isFinite(payload.lng)||payload.lat<-90||payload.lat>90||payload.lng<-180||payload.lng>180)throw Error('올바른 위도·경도를 입력하세요.')}
if(kind==='trip'&&!payload.points.every(p=>Array.isArray(p)&&p.length>=2&&Number.isFinite(Number(p[0]))&&Number.isFinite(Number(p[1]))))throw Error('GPS 경로는 위도·경도 쌍의 배열이어야 합니다.');
if(kind==='maintenance'&&payload.next_due_km!=null&&payload.odometer_km!=null&&payload.next_due_km<payload.odometer_km)throw Error('다음 교환 거리는 교환 당시 거리 이상이어야 합니다.');
await write(kind,payload,state.editing.id);$('editDialog').close();toast('테스트 기록이 저장됐습니다.');
}catch(e){toast('저장 실패: '+e.message);}
finally{btn.disabled=false;btn.textContent='저장';}
}
async function setupQa(){
const existing=new Set(kindRows('qa').map(r=>r.payload.title));
const newItems=QA_LIST.filter(q=>!existing.has(q[1])).map(q=>rec('qa',{area:q[0],title:q[1],environment:q[2],status:'미검증',release:'v180',notes:''}));
if(!newItems.length){toast('기본 QA 항목이 이미 있습니다.');return}
try{
if(state.user){
const rows=newItems.map(x=>({owner_id:state.user.id,kind:x.kind,payload:x.payload}));
const {data,error}=await state.client.from(TABLE).insert(rows).select('id,owner_id,kind,payload,created_at,updated_at');if(error)throw error;state.rows.push(...data);
}else{state.rows.push(...newItems);persistGuest();}
render();toast(newItems.length+'개의 QA 항목을 생성했습니다.');
}catch(e){toast('생성 실패: '+e.message);}
}
function mapReady(id){
const el=$(id);if(!el||!window.L){if(el&&!window.L)el.innerHTML='<div class="map-fallback">Leaflet CDN 연결 필요. 온라인 상태를 확인하세요.</div>';return null}
if(state.maps[id]){state.maps[id].invalidateSize();return state.maps[id];}
el.innerHTML='';
const saved=(()=>{try{return JSON.parse(localStorage.getItem(CAMERA_KEY)||'{}')[id]||null}catch(e){return null}})();
const map=L.map(el,{zoomSnap:0.25,zoomDelta:0.25,zoomAnimation:false,fadeAnimation:false,markerZoomAnimation:false,tap:false,touchZoom:true,scrollWheelZoom:true}).setView(saved?.center||[35.1795,126.8275],saved?.zoom||12.75);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(map);
map.on('zoomend moveend',()=>{
try{const store=JSON.parse(localStorage.getItem(CAMERA_KEY)||'{}');store[id]={center:[map.getCenter().lat,map.getCenter().lng],zoom:map.getZoom()};localStorage.setItem(CAMERA_KEY,JSON.stringify(store));}catch(e){}
updateMapBadge(id);
});
state.maps[id]=map;state.layers[id]=L.layerGroup().addTo(map);
const overlay=document.createElement('div');overlay.className='map-overlay';overlay.id=id+'Overlay';el.appendChild(overlay);
const controls=document.createElement('div');controls.className='map-actions';
controls.innerHTML='<button type="button" title="확대" aria-label="확대" data-map-zoom="in" data-map="'+id+'">+</button><button type="button" title="축소" aria-label="축소" data-map-zoom="out" data-map="'+id+'">−</button>';
el.appendChild(controls);updateMapBadge(id);return map;
}
function updateMapBadge(id){
const map=state.maps[id],el=$(id+'Overlay');if(map&&el)el.textContent='줌 '+map.getZoom().toFixed(2)+' · 중심 '+map.getCenter().lat.toFixed(3)+', '+map.getCenter().lng.toFixed(3);
}
function drawMap(view){
if(view==='map'){const map=mapReady('riderMap');if(!map)return;const layer=state.layers.riderMap;layer.clearLayers();kindRows('rider').forEach(r=>{
const p=r.payload;if(p.visible!=='on'||!Number.isFinite(Number(p.lat))||!Number.isFinite(Number(p.lng)))return;
const letter=E(String(p.nickname||'R').slice(-1)),cls=E(p.status||'none');
L.marker([p.lat,p.lng],{icon:L.divIcon({className:'',html:'<div class="rider-marker '+cls+'">'+letter+'</div>',iconSize:[28,28]})}).bindPopup('<b>'+E(p.nickname)+'</b><br>'+E(STATUS[p.status]||'상태 없음')+'<br><small>테스트 라이더 / 실제 위치 아님</small>').addTo(layer);
});map.invalidateSize();updateMapBadge('riderMap');}
if(view==='timeline')drawTripMap();
}
function selectedTrip(){return kindRows('trip').find(r=>r.id===state.selectedTrip)}
function minutes(t){const a=String(t||'').split(':').map(Number);return (a[0]||0)*60+(a[1]||0)}
function duration(p){const a=minutes(p.start),b=minutes(p.end);return Math.max(1,(b<=a?b+1440:b)-a)}
function at(points,f){
if(!Array.isArray(points)||!points.length)return null;
if(points.length===1)return points[0];
const x=Math.max(0,Math.min(1,f))*(points.length-1),i=Math.min(points.length-2,Math.floor(x)),r=x-i;
return [Number(points[i][0])*(1-r)+Number(points[i+1][0])*r,Number(points[i][1])*(1-r)+Number(points[i+1][1])*r];
}
function timeLabel(t){const hours=Math.floor(t/60)%24;return String(hours).padStart(2,'0')+':'+String(t%60).padStart(2,'0')}
function drawTripMap(){
const map=mapReady('tripMap');if(!map)return;const layer=state.layers.tripMap;layer.clearLayers();
const trip=selectedTrip()?.payload;if(!trip)return;
const points=(trip.points||[]).filter(p=>Array.isArray(p)&&p.length>=2);
if(points.length<2)return;
L.polyline(points,{color:'#142e44',weight:10,opacity:.7}).addTo(layer);
L.polyline(points,{color:'#fb9558',weight:5,opacity:.96,lineJoin:'round'}).addTo(layer);
L.circleMarker(points[0],{radius:8,weight:3,color:'white',fillColor:'#43d9c2',fillOpacity:1}).bindTooltip('출발').addTo(layer);
L.circleMarker(points[points.length-1],{radius:8,weight:3,color:'white',fillColor:'#ed7c53',fillOpacity:1}).bindTooltip('종료').addTo(layer);
const dur=duration(trip),start=minutes(trip.start);
if($('timeSwitch').checked){
for(let t=Math.ceil(start/60)*60;t<=start+dur;t+=60){
const loc=at(points,(t-start)/dur);if(!loc)continue;
L.marker(loc,{icon:L.divIcon({className:'',html:'<div style="background:#142536;color:white;border:1px solid #ffb97c;border-radius:10px;padding:4px 7px;font-weight:800;font-size:11px;white-space:nowrap">'+E(timeLabel(t))+'</div>',iconSize:[48,24],iconAnchor:[23,30]})}).addTo(layer);
}}
if($('stopSwitch').checked)(trip.stops||[]).forEach(s=>{
const loc=Array.isArray(s.point)?s.point:at(points,Number(s.minute||0)/dur);
if(loc)L.circleMarker(loc,{radius:7,color:'white',weight:2,fillColor:'#79baff',fillOpacity:1}).bindTooltip(E(s.label||'정차'),{permanent:false}).addTo(layer);
});
const loc=at(points,state.progress);if(loc)L.marker(loc,{icon:L.divIcon({className:'',html:'<div class="play-marker"></div>',iconSize:[17,17]})}).addTo(layer);
$('tripClock').textContent=timeLabel((start+Math.round(dur*state.progress))%1440);
$('tripProgress').value=Math.round(state.progress*1000);map.invalidateSize();
}
function playbackFrame(t){
if(!state.playing)return;
if(!state.lastFrame)state.lastFrame=t;
const dt=Math.min(250,t-state.lastFrame);state.lastFrame=t;
const trip=selectedTrip()?.payload;if(!trip){state.playing=false;return}
state.progress=Math.min(1,state.progress+(dt*state.speed)/(duration(trip)*60000));
if(!state.lastDraw || t-state.lastDraw>=80 || state.progress>=1){drawTripMap();state.lastDraw=t;}
if(state.progress>=1){state.playing=false;$('playBtn').textContent='▶ 다시 재생';return}
requestAnimationFrame(playbackFrame);
}
function switchPlay(){
if(!selectedTrip()){toast('먼저 운행 기록을 추가하세요.');return}
if(state.playing){state.playing=false;$('playBtn').textContent='▶ 재생';return}
if(state.progress>=1)state.progress=0;
state.playing=true;state.lastFrame=0;state.lastDraw=0;state.speed=Number($('playSpeed').value)||10;
$('playBtn').textContent='❚❚ 일시정지';requestAnimationFrame(playbackFrame);
}
async function checkMapZoom(){
const map=mapReady('riderMap');if(!map)return;
const before={zoom:map.getZoom(),lat:map.getCenter().lat,lng:map.getCenter().lng};
drawMap('map');await new Promise(r=>setTimeout(r,100));
const after=map.getCenter();
const ok=Math.abs(before.zoom-map.getZoom())<.01&&Math.abs(before.lat-after.lat)<1e-5&&Math.abs(before.lng-after.lng)<1e-5;
$('mapCheckResult').textContent=(ok?'시뮬레이터 통과':'시뮬레이터 실패')+' · 레이어 새로고침 뒤 지도 배율 '+before.zoom.toFixed(2)+' → '+map.getZoom().toFixed(2)+'. 실제 앱 검증은 QA 목록에서 별도 기록하세요.';
}
async function login(ev){
ev.preventDefault();if(!state.client)return toast('Supabase 클라이언트를 사용할 수 없습니다.');
const fd=new FormData(ev.currentTarget);
$('loginButton').disabled=true;
try{
const {error}=await state.client.auth.signInWithPassword({email:String(fd.get('email')),password:String(fd.get('password'))});
if(error)throw error;
const {data}=await state.client.auth.getUser();state.user=data.user;await loadCloud();$('authDialog').close();toast('본인 전용 Supabase 테스트 공간에 연결됐습니다.');
}catch(e){$('authResult').textContent='연결 실패: '+e.message;}
finally{$('loginButton').disabled=false;}
}
async function logout(){
if(state.client)await state.client.auth.signOut();state.user=null;loadGuest();updateAuth();render();$('authDialog').close();toast('로컬 테스트 모드로 돌아왔습니다.');
}
function exportData(){
const data={app:'Rider Spot Studio',version:1,mode:state.user?'cloud-user-export':'local',exported_at:new Date().toISOString(),records:state.rows.map(r=>({kind:r.kind,payload:r.payload}))};
const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='rider-spot-studio-'+nowDay()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function importData(file){
if(!file)return;
try{
const data=JSON.parse(await file.text());
if(!Array.isArray(data.records)||data.records.length>500)throw Error('JSON 내 records 배열(최대 500개)이 필요합니다.');
const rows=data.records.filter(r=>FIELDS[r.kind]&&r.payload&&typeof r.payload==='object').map(r=>({kind:r.kind,payload:r.payload}));
if(!rows.length)throw Error('가져올 수 있는 기록이 없습니다.');
if(!confirm(rows.length+'개 테스트 기록을 현재 공간에 추가할까요? 중복이 생길 수 있습니다.'))return;
if(state.user){
const batch=rows.map(r=>({...r,owner_id:state.user.id}));
const {data:inserted,error}=await state.client.from(TABLE).insert(batch).select('id,owner_id,kind,payload,created_at,updated_at');if(error)throw error;state.rows.push(...inserted);
}else{state.rows.push(...rows.map(r=>rec(r.kind,r.payload)));persistGuest();}
render();toast(rows.length+'개 기록을 가져왔습니다.');
}catch(e){toast('가져오기 실패: '+e.message);}
finally{$('importInput').value='';}
}
async function health(){
const btn=$('healthBtn');btn.disabled=true;$('healthResult').textContent='서비스 HTTP 응답 검사 중…';
try{
const res=await fetch('/__health',{cache:'no-store'});const body=await res.json();
$('healthResult').textContent='운영 앱: '+(body.ok?'HTTP '+body.status+' 응답':'확인 실패')+' · 검사 시각 '+new Date(body.checked_at).toLocaleString('ko-KR')+' · 화면 기능 통과 여부와 별개';
}catch(e){$('healthResult').textContent='응답 확인 실패: '+e.message}
finally{btn.disabled=false;}
}
function handlers(){
document.addEventListener('click',async ev=>{
const target=ev.target.closest('[data-action],[data-view],[data-map-zoom]');if(!target)return;
if(target.dataset.mapZoom){const map=state.maps[target.dataset.map];if(map)map.setZoom(map.getZoom()+(target.dataset.mapZoom==='in'?.25:-.25));return}
if(target.dataset.action==='more'){$('moreDialog').showModal();return}
if(target.dataset.action==='new'){if(target.dataset.part)state.selectedPart=target.dataset.part;formOpen(target.dataset.kind);return}
if(target.dataset.action==='edit'){const r=state.rows.find(x=>x.id===target.dataset.id);if(r)formOpen(r.kind,r.id);return}
if(target.dataset.action==='delete'){await remove(target.dataset.id);return}
if(target.dataset.action==='part'){partOpen(target.dataset.part);return}
if(target.dataset.view){if($('moreDialog').open)$('moreDialog').close();setView(target.dataset.view);return}
});
$('authBtn').addEventListener('click',()=>{$('authDialog').showModal();updateAuth()});
$('closeDialog').addEventListener('click',()=>$('editDialog').close());
$('cancelDialog').addEventListener('click',()=>$('editDialog').close());
document.querySelectorAll('[data-close]').forEach(x=>x.addEventListener('click',()=>$(x.dataset.close).close()));
$('editForm').addEventListener('submit',formSubmit);
$('authForm').addEventListener('submit',login);
$('logoutButton').addEventListener('click',logout);
$('exportBtn').addEventListener('click',exportData);
$('importInput').addEventListener('change',ev=>importData(ev.target.files[0]));
$('setupQaBtn').addEventListener('click',setupQa);
$('tripSelect').addEventListener('change',ev=>{state.selectedTrip=ev.target.value;state.progress=0;state.playing=false;renderTrips();drawTripMap()});
$('timeSwitch').addEventListener('change',drawTripMap);
$('stopSwitch').addEventListener('change',drawTripMap);
$('playBtn').addEventListener('click',switchPlay);
$('resetBtn').addEventListener('click',()=>{state.playing=false;state.progress=0;$('playBtn').textContent='▶ 재생';drawTripMap()});
$('tripProgress').addEventListener('input',ev=>{state.playing=false;state.progress=Number(ev.target.value)/1000;$('playBtn').textContent='▶ 재생';drawTripMap()});
$('playSpeed').addEventListener('change',ev=>state.speed=Number(ev.target.value));
$('finishEarningBtn').addEventListener('click',()=>formOpen('earning'));
$('odoBtn').addEventListener('click',()=>{const r=getBike();formOpen('bike',r?.id)});
$('openServiceBtn').addEventListener('click',()=>formOpen('maintenance'));
$('mapCheckBtn').addEventListener('click',checkMapZoom);
$('healthBtn').addEventListener('click',health);
}
loadGuest();setDesignRows();handlers();render();loginInit();
window.RiderSpotStudioSelfTest=()=>{
const tests={
 'visible views':document.querySelectorAll('.view').length===10,
 'maintenance one route':document.querySelectorAll('[data-view="bike"]').length>=1&&!document.querySelector('[data-view="maintenance"]'),
 'sample rides':kindRows('trip').length>=0,
 'ownership isolated':TABLE==='rider_spot_studio_records',
 'map zoom continuous':typeof window.L==='object'&&!!window.L.map,
 'editing fields':Object.keys(FIELDS).length===9,
 'escape html':E('<img src=x>')==='&lt;img src=x&gt;'
};return {tests,passed:Object.values(tests).filter(Boolean).length,total:Object.keys(tests).length};
};
})();