// Rider Spot model reference catalog, 2026-11. This is NOT a replacement for the
// owner's manual for a particular model year/market. Verified manufacturer
// entries are marked separately from general delivery-use estimates.
// Cost ranges are Korean repair-shop MARKET ESTIMATES (parts + labor), not quotes.
const brands={
  Honda:"혼다",Yamaha:"야마하",SYM:"SYM",Kymco:"킴코",
  DN:"디앤에이모터스",Suzuki:"스즈키",Piaggio:"피아지오",Vespa:"베스파",NIU:"NIU"
};
const entry=(brand,key,name,cc,kind="scooter",priceTier=null,aliases=[])=>Object.freeze({
  brand,brandLabel:brands[brand],key,name,cc,kind,
  tier:priceTier||(cc<=125?"small":cc<=200?"mid":"maxi"),
  aliases,
});
export const bikeModels=Object.freeze([
  entry("Honda","honda-pcx125","PCX125 (2021~)",125,"scooter","small",["PCX125","PCX 125","피씨엑스125","혼다 PCX125"]),
  entry("Honda","honda-pcx125-old","PCX125 (2020 이전)",125,"scooter","small",["PCX125 구형"]),
  entry("Honda","honda-pcx160","PCX160",160),
  entry("Honda","honda-adv160","ADV160",160),
  entry("Honda","honda-adv150","ADV150",150),
  entry("Honda","honda-vision110","VISION110",110),
  entry("Honda","honda-dio110","DIO110",110),
  entry("Honda","honda-lead125","LEAD125",125),
  entry("Honda","honda-sh125i","SH125i",125),
  entry("Honda","honda-sh150i","SH150i",150),
  entry("Honda","honda-forza125","FORZA125",125,"scooter","mid"),
  entry("Honda","honda-forza350","FORZA350",350),
  entry("Honda","honda-supercub110","SUPER CUB 110",110,"chain","small",["슈퍼커브110","슈퍼커브 110"]),
  entry("Honda","honda-supercubc125","SUPER CUB C125",125,"chain","small",["C125","슈퍼커브 C125"]),
  entry("Honda","honda-ct125","CT125",125,"chain","small",["헌터커브"]),
  entry("Honda","honda-benly110","BENLY110",110),
  entry("Yamaha","yamaha-nmax125","NMAX125",125,"scooter","small",["NMAX 125","엔맥스125","야마하 NMAX125"]),
  entry("Yamaha","yamaha-nmax155","NMAX155",155),
  entry("Yamaha","yamaha-xmax125","XMAX125",125,"scooter","mid"),
  entry("Yamaha","yamaha-xmax300","XMAX300",300),
  entry("Yamaha","yamaha-aerox155","AEROX155",155),
  entry("Yamaha","yamaha-tricity125","TRICITY125",125,"scooter","mid"),
  entry("Yamaha","yamaha-tricity155","TRICITY155",155,"scooter","mid"),
  entry("Yamaha","yamaha-cygnusx125","CYGNUS X125",125),
  entry("Yamaha","yamaha-rayzr125","RAYZR125",125),
  entry("Yamaha","yamaha-lexi125","LEXI125",125),
  entry("Yamaha","yamaha-bws125","BW'S125",125),
  entry("SYM","sym-jet14-125","JET14 125",125),
  entry("SYM","sym-jetx125","JET X 125",125),
  entry("SYM","sym-joymaxz125","JOYMAX Z125",125,"scooter","mid"),
  entry("SYM","sym-joymaxz300","JOYMAX Z300",300),
  entry("SYM","sym-cruisym125","CRUISYM125",125,"scooter","mid"),
  entry("SYM","sym-cruisym300","CRUISYM300",300),
  entry("SYM","sym-husky150","HUSKY150",150),
  entry("SYM","sym-fiddle125","FIDDLE125",125),
  entry("SYM","sym-mio115","MIO115",115),
  entry("SYM","sym-drg158","DRG158",158),
  entry("SYM","sym-symphonyst125","SYMPHONY ST125",125),
  entry("Kymco","kymco-agility125","AGILITY125",125),
  entry("Kymco","kymco-like125","LIKE125",125),
  entry("Kymco","kymco-vjr125","VJR125",125),
  entry("Kymco","kymco-racing125","RACING S125",125),
  entry("Kymco","kymco-people125","PEOPLE S125",125),
  entry("Kymco","kymco-gdink125","G-DINK125",125,"scooter","mid"),
  entry("Kymco","kymco-downtown125","DOWNTOWN125",125,"scooter","mid"),
  entry("Kymco","kymco-downtown350","DOWNTOWN350",350),
  entry("Kymco","kymco-xtown125","X-TOWN125",125,"scooter","mid"),
  entry("Kymco","kymco-xtown300","X-TOWN300",300),
  entry("DN","dn-uhr125","UHR125",125,"scooter","small",["UHR 125","디엔에이 UHR125"]),
  entry("DN","dn-xq125","XQ125",125,"scooter","mid"),
  entry("DN","dn-xq250","XQ250",250),
  entry("DN","dn-vf100","VF100",100,"scooter","small",["대림 VF100"]),
  entry("DN","dn-vf125","VF125",125),
  entry("DN","dn-cityace110","CITI ACE110",110,"chain","small",["시티에이스","시티에이스110"]),
  entry("DN","dn-q2-125","Q2 125",125,"scooter","mid"),
  entry("DN","dn-q3-250","Q3 250",250),
  entry("DN","dn-daystar125","DAYSTAR125",125,"chain","small"),
  entry("Suzuki","suzuki-address125","ADDRESS125",125),
  entry("Suzuki","suzuki-avenis125","AVENIS125",125),
  entry("Suzuki","suzuki-access125","ACCESS125",125),
  entry("Suzuki","suzuki-burgman125","BURGMAN125",125,"scooter","mid"),
  entry("Suzuki","suzuki-burgman200","BURGMAN200",200),
  entry("Suzuki","suzuki-burgman400","BURGMAN400",400),
  entry("Piaggio","piaggio-liberty125","LIBERTY125",125),
  entry("Piaggio","piaggio-medley125","MEDLEY125",125,"scooter","mid"),
  entry("Piaggio","piaggio-medley150","MEDLEY150",150),
  entry("Piaggio","piaggio-beverly300","BEVERLY300",300),
  entry("Vespa","vespa-primavera125","PRIMAVERA125",125,"scooter","mid"),
  entry("Vespa","vespa-sprint125","SPRINT125",125,"scooter","mid"),
  entry("Vespa","vespa-gts300","GTS300",300),
  entry("NIU","niu-nqi-gts","NQi GTS",125,"electric","mid"),
  entry("NIU","niu-mqi-gt","MQi GT",125,"electric","mid")
]);
const byKey=new Map(bikeModels.map(model=>[model.key,model]));
export const bikeBrands=Object.freeze(Object.entries(brands).map(([key,name])=>({key,name})));
export const findBikeModel=key=>byKey.get(String(key||""))||null;
const normalize=s=>String(s||"").normalize("NFKC").toUpperCase().replace(/[^A-Z0-9가-힣]/g,"");
export function inferBikeModel(name){
  const n=normalize(name);
  if(!n)return null;
  return bikeModels.find(m=>[m.name,...m.aliases].some(a=>normalize(a)===n))||null;
}
export const modelLabel=m=>m?m.brandLabel+" "+m.name:"모델 미선택";
// Manufacturer manual vs derived delivery reference. Wear components are
// inspection/replacement ESTIMATES only, not mandatory manufacturer limits.
export const costSources=Object.freeze({
  market:"https://ddalbae.kr/guide/repair-cost-guide",
  shop:"https://gtbikemall.com/maintenance-cost",
  labor:"https://vroomservice.kr/sub/mechanic.php",
  pcxManual:"https://2rom-prd-data.hondamotopub.com/om/HMEE/WW125S_A%20%28PCX%29/2025/WW125SA_OM_32K1YE00_web.pdf",
  nmaxManual:"https://www.manualzz.com/doc/91139001/yamaha-nmax-125-scooter-owner-s-manual",
});
const range={
  small:{"엔진오일":[18000,40000],"앞 타이어":[55000,120000],"뒤 타이어":[65000,145000],"브레이크 패드":[25000,65000],"구동벨트":[70000,170000],"에어필터":[15000,45000],"구동체인":[45000,120000],"배터리":[55000,130000]},
  mid:{"엔진오일":[25000,55000],"앞 타이어":[75000,165000],"뒤 타이어":[90000,185000],"브레이크 패드":[35000,85000],"구동벨트":[100000,240000],"에어필터":[22000,55000],"구동체인":[65000,150000],"배터리":[70000,170000]},
  maxi:{"엔진오일":[35000,85000],"앞 타이어":[95000,210000],"뒤 타이어":[115000,260000],"브레이크 패드":[45000,120000],"구동벨트":[140000,320000],"에어필터":[30000,75000],"구동체인":[85000,190000],"배터리":[85000,230000]}
};
const approximate={
  "엔진오일":{interval_km:3000,interval_days:180,note:"일반 배달 운행 참고값 · 연식별 설명서 확인"},
  "앞 타이어":{interval_km:18000,interval_days:null,note:"마모·공기압 우선 점검 · 교체 거리 보장 아님"},
  "뒤 타이어":{interval_km:14000,interval_days:null,note:"마모·공기압 우선 점검 · 교체 거리 보장 아님"},
  "브레이크 패드":{interval_km:12000,interval_days:null,note:"두께·제동 상태 우선 · 교체 거리 보장 아님"},
  "구동벨트":{interval_km:20000,interval_days:null,note:"벨트 손상·연식 점검 · 설명서 우선"},
  "에어필터":{interval_km:12000,interval_days:null,note:"먼지 많은 배달환경 참고값 · 설명서 우선"},
  "구동체인":{interval_km:15000,interval_days:null,note:"체인 늘어남·윤활·마모 기준 교환"},
  "배터리":{interval_km:null,interval_days:null,note:"교체주기 없음 · 성능·상태 점검 후 교환"}
};
const verified={
  "honda-pcx125":{
    "엔진오일":{interval_km:6000,interval_days:365,note:"2025 유럽판 Honda 설명서 · 첫 교환 1,000 km, 이후 6,000 km",source:costSources.pcxManual},
    "구동벨트":{interval_km:24000,interval_days:null,note:"2025 Honda 설명서 · 12,000 km 점검, 24,000 km 교체",source:costSources.pcxManual}
  },
  "honda-pcx125-old":{
    "구동벨트":{interval_km:24000,interval_days:null,note:"구형 PCX 설명서 기준 · 8,000 km마다 점검, 24,000 km 교체",source:"https://2rom-prd-data.hondamotopub.com/om/HKO/PCX/2010/10PCX125_32KWN600_0.pdf"}
  },
  "yamaha-nmax125":{
    "구동벨트":{interval_km:18000,interval_days:null,note:"NMAX125 GPD125 설명서 V벨트 표시 18,000 km · 연식 확인",source:costSources.nmaxManual}
  }
};
export const modelParts=model=>{
  if(model?.kind==="electric")return ["앞 타이어","뒤 타이어","브레이크 패드","배터리"];
  if(model?.kind==="chain")return ["엔진오일","앞 타이어","뒤 타이어","브레이크 패드","구동체인","에어필터"];
  return ["엔진오일","앞 타이어","뒤 타이어","브레이크 패드","구동벨트","에어필터"];
};
export function modelDefaults(model,item){
  if(!model||!modelParts(model).includes(item))return null;
  const basic=approximate[item]||{interval_km:null,interval_days:null,note:"정비소 점검 필요"};
  const official=verified[model.key]?.[item];
  const [costLow,costHigh]=range[model.tier]?.[item]||[null,null];
  return {
    item_key:item, interval_km:official?.interval_km??basic.interval_km,
    interval_days:official?official.interval_days:basic.interval_days,
    cost_low_won:costLow,cost_high_won:costHigh,
    estimated_cost_won:costLow!=null?Math.round((costLow+costHigh)/2000)*1000:null,
    interval_source:official?"manual":"estimate",
    source_url:official?.source||costSources.market,
    note:official?.note||basic.note
  };
}
// User values are independent per model. Legacy pre-catalog custom cycles
// are considered only until a model is explicitly selected.
export function resolveMaintenance(model,item,modelSettings=[],legacyCycles=[],explicitModel=false){
  const base=modelDefaults(model,item);
  const override=modelSettings.find(x=>x.model_key===model?.key && x.item_key===item);
  if(override)return {...base,...override,source:"personal",is_custom:true,
    cost_low_won:override.estimated_cost_won??base?.cost_low_won,
    cost_high_won:override.estimated_cost_won??base?.cost_high_won};
  const legacy=!explicitModel&&legacyCycles.find(x=>x.item_key===item);
  if(legacy)return {...base,...legacy,source:"legacy",is_custom:true};
  return base?{...base,source:"default",is_custom:false}:null;
}
export const won=n=>n==null?"가격 정보 없음":Number(n).toLocaleString("ko-KR")+"원";
export function costLabel(setting){
  if(!setting||setting.estimated_cost_won==null)return "비용 미설정";
  if(setting.source==="personal")return won(setting.estimated_cost_won)+" · 직접 설정";
  const low=setting.cost_low_won,high=setting.cost_high_won;
  return low!=null&&high!=null?won(low)+" ~ "+won(high):won(setting.estimated_cost_won);
}
