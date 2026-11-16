# 라이더스팟 지도 초기화 방지 v48

운영 배포: 2026-11-16T16:30:43Z, Worker rider-spot.

## 증상

지도를 여러 번 축소하다가 화면이 초기 위치로 되돌아가고 다시 로딩되는 현상.

## 수정 내용

- Leaflet/MapLibre 지도에 minZoom=7.5, maxZoom=19 설정; zoomSnap=0 및 zoomDelta=0.25 유지
- 운행 상세 지도에서 moveend마다 좌표 중심, 줌 배율, 시각을 sessionStorage에 기록 (rs:map-camera-v48:<focus>)
- 지도 생성/화면 복귀 시 같은 운행 ID+reset focus의 최근 6시간 내 카메라 기록이 있으면 자동 복원
- '전체 경로' 버튼은 reset focus를 변경하므로 이전 저장 카메라 대신 다시 fitBounds
- 앱 GPS SQLite, Supabase, 운행 이벤트, 로그인, 지명 레이어는 변경 없음
- Service Worker 캐시와 HTML 모듈 쿼리값 v48로 갱신

## 공개 API 근거

MapLibre GL Leaflet 연결 플러그인은 0 줌 단계에서 동기화 문제가 발생할 수 있어 minZoom:1 이상을 권장: https://github.com/maplibre/maplibre-gl-leaflet

## 실제 배포 코드 (발췌)

지도 설정:

```js
Jo.default.map(i.current,{zoomControl:!1,minZoom:7.5,maxZoom:19,zoomSnap:0,zoomDelta:.25,touchZoom:!0,bounceAtZoomLimits:!1,zoomAnimation:!0}
```

카메라 저장:

```js
const rs48SaveCamera=()=>{
  if(!rs48IsCourse.current)return;
  const center=e.getCenter(),zoom=e.getZoom();
  if(!center||!Number.isFinite(center.lat)||!Number.isFinite(center.lng)||!Number.isFinite(zoom))return;
  try{sessionStorage.setItem('rs:map-camera-v48:'+String(rs48CameraFocus.current),
   JSON.stringify({lat:center.lat,lng:center.lng,zoom,t:Date.now()}))}catch(err){}
 };
 e.on('moveend',rs48SaveCamera);
 
```

카메라 복원:

```js
let rs48Restored=false;
if(course){
 try{
  const saved=JSON.parse(sessionStorage.getItem('rs:map-camera-v48:'+String(r))||'null');
  if(saved&&saved.t>Date.now()-21600000&&Number.isFinite(saved.lat)&&Number.isFinite(saved.lng)
   &&Number.isFinite(saved.zoom)&&Math.abs(saved.lat)<=90&&Math.abs(saved.lng)<=180){
   a.current.setView([saved.lat,saved.lng],Math.max(7.5,Math.min(19,saved.zoom)),{animate:false});
   rs48Restored=true;
  }
 }catch(err){}
}
if(!rs48Restored){
 if(points.length)a.current.fitBounds(points.map(p=>[p.lat,p.lng]),{padding:[45,66],maxZoom:16});
 else if(e)a.current.setView([e.lat,e.lng],15);
}

```

코드 보존 및 버전 캐시 검사 12개 항목 통과. Android 실제 줌 제스처 재현 시험은 아직 미검증.
