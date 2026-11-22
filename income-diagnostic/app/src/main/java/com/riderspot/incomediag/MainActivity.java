package com.riderspot.incomediag;

import android.app.Activity;
import android.accessibilityservice.AccessibilityServiceInfo;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.os.Debug;
import android.os.Handler;
import android.os.Looper;
import android.os.Process;
import android.os.SystemClock;
import android.provider.Settings;
import android.text.InputType;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import android.view.accessibility.AccessibilityManager;
import org.json.JSONArray;
import org.json.JSONObject;
import java.text.DateFormat;
import java.util.Date;
import java.util.List;
import java.util.Locale;

/** Standalone development probe. Never writes to the production Rider Spot database. */
public final class MainActivity extends Activity {
    private final Handler handler=new Handler(Looper.getMainLooper());
    private final int INK=Color.rgb(23,33,55),SUB=Color.rgb(99,112,133),ACCENT=Color.rgb(56,85,231);
    private TextView status,counts,resources,accuracy,history,traces,deliverySummary,deliveryHistory,structureHistory,prototypeSummary;
    private LinearLayout prototypeRows;
    private Button prototypeToggle;
    private EditText actualCount,actualTotal,lastFee;
    private final Runnable updater=new Runnable() {
        @Override public void run() { render();handler.postDelayed(this,5000); }
    };
    private int dp(float n) { return (int)(n*getResources().getDisplayMetrics().density+0.5f); }
    private GradientDrawable bg(int color,int radius) {
        GradientDrawable d=new GradientDrawable();d.setColor(color);d.setCornerRadius(dp(radius));return d;
    }
    private LinearLayout col() {
        LinearLayout l=new LinearLayout(this);l.setOrientation(LinearLayout.VERTICAL);return l;
    }
    private TextView text(String value,int size,int color,boolean bold) {
        TextView t=new TextView(this);t.setText(value);t.setTextSize(size);t.setTextColor(color);
        if(bold)t.setTypeface(Typeface.DEFAULT,Typeface.BOLD);
        t.setLineSpacing(dp(3),1.0f);return t;
    }
    private void add(LinearLayout parent,View child,int top) {
        LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,-2);
        lp.topMargin=dp(top);parent.addView(child,lp);
    }
    private LinearLayout card(LinearLayout parent,String title) {
        LinearLayout c=col();c.setPadding(dp(18),dp(18),dp(18),dp(18));
        c.setBackground(bg(Color.WHITE,18));add(parent,c,12);
        add(c,text(title,16,INK,true),0);
        return c;
    }
    private Button button(String text,boolean accent,View.OnClickListener click) {
        Button b=new Button(this);b.setText(text);b.setAllCaps(false);b.setTextSize(13);
        b.setTextColor(accent?Color.WHITE:INK);
        b.setBackground(bg(accent?ACCENT:Color.rgb(233,238,247),12));
        b.setOnClickListener(click);b.setMinimumHeight(dp(48));return b;
    }
    private void buttons(LinearLayout parent,Button... items) {
        LinearLayout row=new LinearLayout(this);row.setOrientation(LinearLayout.HORIZONTAL);
        LinearLayout.LayoutParams rlp=new LinearLayout.LayoutParams(-1,-2);
        rlp.topMargin=dp(12);parent.addView(row,rlp);
        for(int i=0;i<items.length;i++) {
            LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(0,dp(48),1);
            if(i>0)p.leftMargin=dp(8);row.addView(items[i],p);
        }
    }
    private EditText number(String hint) {
        EditText e=new EditText(this);
        e.setTextSize(15);e.setTextColor(INK);e.setHint(hint);e.setSingleLine(true);
        e.setPadding(dp(12),0,dp(12),0);
        e.setBackground(bg(Color.rgb(244,247,252),12));
        e.setInputType(InputType.TYPE_CLASS_NUMBER);
        return e;
    }
    @Override public void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().setStatusBarColor(Color.rgb(245,247,251));
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
        ScrollView scroll=new ScrollView(this);
        scroll.setFillViewport(true);scroll.setBackgroundColor(Color.rgb(245,247,251));
        LinearLayout body=col();body.setPadding(dp(18),dp(28),dp(18),dp(36));scroll.addView(body);
        add(body,text("RIDERSPOT  /  INCOME LAB v0.7",12,ACCENT,true),0);
        add(body,text("수익 인식 실사용 프로토타입",26,INK,true),8);
        add(body,text("접근성 화면 텍스트에서 금액 후보와 주변 라벨을 분류합니다. 화면 캡처·OCR·서버 전송·원문 저장은 하지 않습니다.",13,SUB,false),10);

        LinearLayout state=card(body,"측정 상태");
        status=text("",14,SUB,false);add(state,status,10);
        buttons(state,button("접근성 설정",false,v->{
            startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS));
        }),button("측정 시작",true,v->{DiagStore.start(this);render();}));
        buttons(state,button("측정 종료",false,v->{DiagStore.stop(this);render();}),
                      button("보고서 공유",false,v->share()));

        LinearLayout prototype=card(body,"실사용 수익 수집 · 로컬 프로토타입");
        add(prototype,text("완료 화면의 수수료 항목과 합계가 연결되면 자동 후보로 보관합니다. 후보는 실제 수익에 자동 합산되지 않습니다. 수동 승인된 금액만 별도 합계에 들어갑니다. 서버 전송·본앱 수익 변경 없음.",12,SUB,false),9);
        prototypeToggle=button("프로토타입 수집 켜기",true,v->togglePrototype());
        buttons(prototype,prototypeToggle,button("CSV 공유",false,v->sharePrototypeCsv()));
        prototypeSummary=text("",14,INK,false);
        add(prototype,prototypeSummary,12);
        add(prototype,text("최근 자동 수집 내역 · 검토는 안전하게 정차한 뒤 진행하세요.",12,SUB,false),10);
        prototypeRows=col();add(prototype,prototypeRows,8);

        LinearLayout individual=card(body,"건별 검증 · 마지막 배달료");
        add(individual,text("배달 1건을 완료할 때마다 마지막 배달료를 입력하세요. 최근 완료 화면에서 앱이 스스로 추출한 후보와 비교하며, 수동 입력 금액은 인식 결과에 반영하지 않습니다.",12,SUB,false),8);
        lastFee=number("방금 완료한 배달료 (예: 7307)");
        add(individual,lastFee,12);
        buttons(individual,button("마지막 배달 1건 비교 · 저장",true,v->verifyLastFee()));
        buttons(individual,button("완료 화면 미감지 · 수동 누락 기록",false,v->recordMissedFee()));
        deliverySummary=text("",14,INK,false);
        add(individual,deliverySummary,12);
        deliveryHistory=text("",12,SUB,false);
        add(individual,deliveryHistory,8);
        add(individual,text("이미 검증한 완료 화면을 다시 입력해도 새 배달로 중복 저장하지 않습니다. 실제 배달을 마쳤는데 완료 화면을 못 읽었다면 '수동 누락 기록'을 선택하세요. 정차 후 입력하세요.",12,SUB,false),12);

        LinearLayout measures=card(body,"인식 이벤트");
        counts=text("",14,INK,false);add(measures,counts,10);

        LinearLayout system=card(body,"리소스 측정");
        resources=text("",14,INK,false);add(system,resources,10);
        add(system,text("배터리 변화는 휴대폰 전체 값이며 이 앱만의 전력 소비량이 아닙니다. CPU 시간과 메모리도 진단 화면을 포함한 앱 프로세스 전체 측정치입니다.",12,SUB,false),12);

        LinearLayout truth=card(body,"전체 운행 합계 비교 (선택사항)");
        add(truth,text("테스트가 끝난 뒤 쿠팡이츠·배민에서 확인한 실제 완료 건수와 총배달료를 입력하세요. 건별 검증은 위쪽에서 입력하세요. 이 칸은 하루·운행의 합계를 확인하는 참고용입니다.",12,SUB,false),8);
        actualCount=number("실제 완료 건수");add(truth,actualCount,12);
        actualTotal=number("실제 총배달료(원)");add(truth,actualTotal,8);
        SharedPreferences p=DiagStore.prefs(this);
        int savedCount=p.getInt("truthCount",-1);
        long savedTotal=p.getLong("truthTotal",-1);
        if(savedCount>=0)actualCount.setText(String.valueOf(savedCount));
        if(savedTotal>=0)actualTotal.setText(String.valueOf(savedTotal));
        buttons(truth,button("실제 결과 저장 · 비교",true,v->saveTruth()));
        accuracy=text("",14,INK,false);add(truth,accuracy,12);

        LinearLayout events=card(body,"최근 배달 완료 후보");
        history=text("",13,INK,false);add(events,history,10);
        add(events,text("금액 구조 후보도 실제 배달로 확정된 값은 아닙니다. 화면 구조 변경이나 동시 표시 금액에 주의하세요.",12,SUB,false),12);
        LinearLayout clues=card(body,"화면별 금액 단서 · 최대 최근 12개");
        traces=text("",12,INK,false);add(clues,traces,10);
        add(clues,text("금액과 미리 정한 라벨 분류만 저장합니다. 전체 화면 텍스트·고객 이름·주소는 저장하지 않습니다. 3,280원 + 3,074원 + 953원 = 7,307원 같은 합계 구조를 감지합니다.",12,SUB,false),12);

        LinearLayout structure=card(body,"수수료 항목 · 접근성 UI 구조");
        add(structure,text("기본수수료 · 추가수수료 · 리워드의 금액과 UI 관계를 확인합니다. 405원 같은 500원 미만의 추가수수료도 수집하며, 동일한 UI 문자열 안에서 직접 짝지어진 항목을 따로 표시합니다.",12,SUB,false),8);
        structureHistory=text("",12,INK,false);
        add(structure,structureHistory,10);
        add(structure,text("화면 원문, 고객 이름·주소, UI 리소스 ID 값, 정확한 좌표는 저장하지 않습니다. 분류된 라벨·금액·관계 유형만 기록합니다.",12,SUB,false),12);

        LinearLayout guide=card(body,"테스트 방법");
        add(guide,text("1. 이전 v0.6 접근성 서비스를 끄고 v0.7만 켭니다.\n2. 측정 시작 → 프로토타입 수집 켜기(동의)를 순서대로 누릅니다.\n3. 배달 완료 때 자동 후보가 로컬 원장에 추가됩니다. 같은 금액의 연속 배달은 90초 이내 중복으로 오판할 수 있으니 비교 검증이 필요합니다.\n4. 정차 후 후보의 수익 여부를 승인하거나 제외할 수 있습니다. 수동 승인 내역도 실제 라이더스팟 수익 탭에는 반영되지 않습니다.\n5. 측정을 재시작해도 프로토타입 원장은 남지만 진단 세션 로그는 초기화됩니다.\n6. CSV 공유 또는 보고서 공유로 결과를 내보냅니다.\n\nAndroid 접근성 설정이 제한되면 앱 정보 ⋮ → 제한된 설정 허용을 확인하세요.",13,INK,false),12);
        setContentView(scroll);
        render();
    }
    @Override protected void onResume(){super.onResume();handler.removeCallbacks(updater);handler.post(updater);}
    @Override protected void onPause(){handler.removeCallbacks(updater);super.onPause();}
    private boolean enabled(){
        AccessibilityManager a=(AccessibilityManager)getSystemService(Context.ACCESSIBILITY_SERVICE);
        if(a==null)return false;
        List<AccessibilityServiceInfo> list=a.getEnabledAccessibilityServiceList(AccessibilityServiceInfo.FEEDBACK_ALL_MASK);
        for(AccessibilityServiceInfo s:list)
            if(s.getId()!=null&&s.getId().startsWith(getPackageName()+"/")&&s.getId().contains("IncomeAccessibilityService"))
                return true;
        return false;
    }
    private void recordMissedFee(){
        try{
            String raw=lastFee.getText().toString().replace(",","").trim();
            if(raw.isEmpty())throw new IllegalArgumentException();
            int value=Integer.parseInt(raw);
            if(value<500||value>150000)throw new IllegalArgumentException();
            new android.app.AlertDialog.Builder(this)
                .setTitle("완료 화면 수집 누락")
                .setMessage("실제 배달을 한 건 더 완료했지만, 새로운 완료 화면이 감지되지 않았나요?\n\n"+
                    String.format(Locale.KOREA,"실제 배달료 %,d원은 수동 누락 건으로만 저장됩니다.",value))
                .setNegativeButton("취소",null)
                .setPositiveButton("누락 건 저장",(dialog,which)->{
                    String message=DiagStore.recordUnseenDelivery(this,value);
                    Toast.makeText(this,message,Toast.LENGTH_LONG).show();
                    if(message.startsWith("저장됨:"))lastFee.setText("");
                    render();
                }).show();
        }catch(Exception e){
            Toast.makeText(this,"마지막 배달료를 정확히 입력하세요.",Toast.LENGTH_LONG).show();
        }
    }
    private void verifyLastFee(){
        try{
            String text=lastFee.getText().toString().replace(",","").trim();
            if(text.isEmpty())throw new IllegalArgumentException();
            int value=Integer.parseInt(text);
            String message=DiagStore.verifyLastDelivery(this,value);
            Toast.makeText(this,message,Toast.LENGTH_LONG).show();
            if(message.startsWith("저장됨:")){
                lastFee.setText("");
                IncomePrototypeStore.noteManualComparison(this,value,message.contains("자동 후보 일치"));
            }
            render();
        }catch(Exception e){
            Toast.makeText(this,"마지막 배달 1건의 금액을 숫자로 입력하세요",Toast.LENGTH_LONG).show();
        }
    }
    private void togglePrototype(){
        if(IncomePrototypeStore.enabled(this)){
            IncomePrototypeStore.setEnabled(this,false);
            render();return;
        }
        if(!DiagStore.running(this)){
            Toast.makeText(this,"먼저 '측정 시작'을 눌러주세요.",Toast.LENGTH_LONG).show();
            return;
        }
        new android.app.AlertDialog.Builder(this)
            .setTitle("수익 자동수집 프로토타입 켜기")
            .setMessage("쿠팡이츠·배민커넥트 접근성 화면에서 수수료 항목·총액만 분석해 이 기기의 별도 원장에 기록합니다.\n\n화면 원문·주문 주소·고객 정보는 저장하지 않고, 라이더스팟 운영 수익에는 반영하지 않습니다.\n\n동일한 배달을 여러 번 잡거나 실제 배달을 누락할 수 있으니 진단용으로 사용하세요.")
            .setNegativeButton("취소",null)
            .setPositiveButton("동의하고 켜기",(dialog,which)->{
                IncomePrototypeStore.setEnabled(this,true);
                render();
            }).show();
    }
    private void reviewPrototype(String id,String state){
        boolean confirmed="CONFIRMED".equals(state);
        new android.app.AlertDialog.Builder(this)
            .setTitle(confirmed?"수익 후보 승인":"수익 후보 제외")
            .setMessage(confirmed?
                "실제 배달 수익인지 직접 확인했나요? 이 승인 내역은 로컬 원장에만 반영됩니다.":
                "이 후보를 로컬 수익 합계에서 제외할까요?")
            .setNegativeButton("취소",null)
            .setPositiveButton(confirmed?"승인":"제외",(dialog,which)->{
                boolean changed=IncomePrototypeStore.setState(this,id,state);
                Toast.makeText(this,changed?"로컬 원장을 업데이트했어요.":"변경할 수 없는 내역이에요.",Toast.LENGTH_SHORT).show();
                render();
            }).show();
    }
    private void sharePrototypeCsv(){
        Intent send=new Intent(Intent.ACTION_SEND);
        send.setType("text/plain");
        send.putExtra(Intent.EXTRA_SUBJECT,"RiderSpot income prototype v0.7 CSV");
        send.putExtra(Intent.EXTRA_TEXT,IncomePrototypeStore.csv(this));
        startActivity(Intent.createChooser(send,"수익 원장 CSV 텍스트 공유"));
    }
    private void renderPrototype(){
        if(prototypeRows==null)return;
        boolean active=IncomePrototypeStore.enabled(this);
        prototypeToggle.setText(active?"프로토타입 수집 끄기":"프로토타입 수집 켜기");
        prototypeSummary.setText("수집 상태: "+(active?"켜짐":"꺼짐")+"\n"+
            IncomePrototypeStore.summary(this));
        prototypeRows.removeAllViews();
        JSONArray rows=IncomePrototypeStore.records(this);
        if(rows.length()==0){
            add(prototypeRows,text("아직 수집된 수익 후보가 없습니다.",13,SUB,false),4);
            return;
        }
        for(int i=rows.length()-1;i>=Math.max(0,rows.length()-8);i--){
            JSONObject r=rows.optJSONObject(i);
            if(r==null)continue;
            String id=r.optString("id"),state=r.optString("state");
            String label="CANDIDATE".equals(state)?"강한 자동 후보":
                "REVIEW".equals(state)?"확인 필요":
                "CONFIRMED".equals(state)?"수동 승인":"제외";
            LinearLayout item=col();
            item.setPadding(dp(12),dp(11),dp(12),dp(11));
            item.setBackground(bg(Color.rgb(244,247,252),12));
            add(prototypeRows,item,8);
            add(item,text(stamp(r.optLong("time",System.currentTimeMillis()))+
                " · "+r.optString("platform")+" · "+num(r.optInt("amount"))+"원",14,INK,true),0);
            add(item,text(label+" · "+r.optString("reason"),12,SUB,false),4);
            add(item,text("기본 "+num(r.optInt("base"))+" · 추가 "+num(r.optInt("extra"))+
                " · 리워드 "+num(r.optInt("reward")),12,SUB,false),4);
            if(r.has("manual_actual"))
                add(item,text("실제 입력 "+num(r.optInt("manual_actual"))+"원 · "+
                    (r.optBoolean("manual_match")?"금액 일치":"금액 불일치"),12,SUB,false),4);
            if("CANDIDATE".equals(state)||"REVIEW".equals(state))
                buttons(item,button("수익 승인",true,v->reviewPrototype(id,"CONFIRMED")),
                    button("제외",false,v->reviewPrototype(id,"REJECTED")));
        }
    }
    private void saveTruth(){
        try{
            String c=actualCount.getText().toString().trim();
            String a=actualTotal.getText().toString().trim();
            if(c.isEmpty()||a.isEmpty())throw new IllegalArgumentException();
            int count=Integer.parseInt(c);
            long total=Long.parseLong(a);
            if(count<0||count>5000||total<0||total>100000000L)throw new IllegalArgumentException();
            DiagStore.prefs(this).edit().putInt("truthCount",count).putLong("truthTotal",total).apply();
            Toast.makeText(this,"비교 결과를 저장했어요",Toast.LENGTH_SHORT).show();
            render();
        }catch(Exception e){Toast.makeText(this,"실제 건수·금액을 숫자로 입력하세요",Toast.LENGTH_LONG).show();}
    }
    private String num(long n){return String.format(Locale.KOREA,"%,d",n);}
    private String stamp(long ms){return DateFormat.getTimeInstance(DateFormat.SHORT,Locale.KOREA).format(new Date(ms));}
    private void render(){
        if(status==null)return;
        SharedPreferences p=DiagStore.prefs(this);
        boolean running=p.getBoolean("running",false);
        long started=p.getLong("startElapsed",0);
        long elapsed=started==0?0:(running?SystemClock.elapsedRealtime():p.getLong("endElapsed",started))-started;
        if(elapsed<0)elapsed=0;
        long raw=p.getLong("raw",0),scan=p.getLong("examined",0),readable=p.getLong("readable",0);
        int accepted=p.getInt("accepted",0),uncertain=p.getInt("uncertain",0);
        long sum=p.getLong("sum",0);
        status.setText("접근성 권한: "+(enabled()?"연결됨":"미설정")+"\n측정: "+(running?"진행 중":"중지")+"\n경과 시간: "+(elapsed/3600000)+"시간 "+((elapsed/60000)%60)+"분\n기록 대상: 쿠팡이츠 배달파트너 · 배민커넥트");
        counts.setText("접수된 접근성 이벤트  "+num(raw)+"회\n분석 실행  "+num(scan)+"회\n텍스트 접근 가능  "+num(readable)+"회\n화면 트리 미확인  "+num(p.getLong("missingRoot",0))+"회\n완료 문구 감지 화면  "+num(p.getLong("completion",0))+"회\n금액 표시 화면  "+num(p.getLong("money",0))+"회\n금액 구조 후보  "+num(accepted)+"건 / "+num(sum)+"원\n확인 필요 후보  "+num(uncertain)+"건\n중복 화면 억제  "+num(p.getLong("duplicates",0))+"회");
        long baseCpu=p.getLong("startCpu",Process.getElapsedCpuTime());
        long nowCpu=running?Process.getElapsedCpuTime():p.getLong("endCpu",baseCpu);
        long cpu=Math.max(0,nowCpu-baseCpu);
        double cpuPct=elapsed>0?100.0*cpu/elapsed:0;
        int b0=p.getInt("startBattery",-1),b1=running?DiagStore.battery(this):p.getInt("endBattery",-1);
        String battery=b0<0||b1<0?"측정 불가":b0+"% → "+b1+"% ("+(b1-b0)+"%p)";
        resources.setText("앱 프로세스 누적 CPU 시간  "+num(cpu)+"ms\n세션 평균 CPU 사용 비율  "+String.format(Locale.KOREA,"%.2f%%",cpuPct)+"\n현재 앱 프로세스 메모리(PSS)  "+num(Debug.getPss()/1024)+"MB\n휴대폰 전체 배터리 잔량  "+battery);
        int truthCount=p.getInt("truthCount",-1);
        long truthTotal=p.getLong("truthTotal",-1);
        if(truthCount>=0&&truthTotal>=0){
            String ratio=truthCount>0?String.format(Locale.KOREA,"%.1f%%",100.0*accepted/truthCount):"해당 없음";
            accuracy.setText("금액 구조 후보 "+accepted+"건 / 실제 "+truthCount+"건\n금액 후보/실제 건수 "+ratio+" (정확도 아님)\n금액 구조 후보 합계 "+num(sum)+"원 / 실제 "+num(truthTotal)+"원\n금액 차이 "+(sum-truthTotal>=0?"+":"")+num(sum-truthTotal)+"원\n건수 "+(accepted==truthCount?"일치":"불일치")+" · 총액 "+(sum==truthTotal?"일치":"불일치"));
        }else accuracy.setText("실제 배달 결과를 저장하면 건수·총액 비교가 표시됩니다.");
        JSONArray checks=DiagStore.verifications(this);
        int matched=0, wrong=0, visible=0, missed=0, collided=0;
        StringBuilder checkedLines=new StringBuilder();
        for(int i=0;i<checks.length();i++){
            JSONObject row=checks.optJSONObject(i);
            if(row==null)continue;
            String result=row.optString("status","");
            if(result.equals("자동 후보 일치"))matched++;
            else if(result.equals("자동 후보 오인식"))wrong++;
            else if(result.equals("자동 후보 충돌"))collided++;
            else if(result.equals("금액 감지·자동 미인식"))visible++;
            else missed++;
        }
        for(int i=checks.length()-1;i>=Math.max(0,checks.length()-8);i--){
            JSONObject row=checks.optJSONObject(i);
            if(row==null)continue;
            checkedLines.append(stamp(row.optLong("time",System.currentTimeMillis())))
                .append(" · 실제 ").append(num(row.optLong("actual",0))).append("원")
                .append(" / 자동 ").append(row.optInt("predicted",0)>0?num(row.optInt("predicted"))+"원":"미확정")
                .append("\n").append(row.optString("status",""))
                .append(" · 포착 화면 ").append(row.optInt("screens",0)).append("개")
                .append("\n\n");
        }
        String rate=checks.length()>0?String.format(Locale.KOREA,"%.1f%%",100.0*matched/checks.length()):"—";
        deliverySummary.setText("수동 검증 "+checks.length()+"건 · 자동 금액 일치 "+matched+"건 ("+rate+")\n"+
            "자동 오인식 "+wrong+" · 후보 충돌 "+collided+"\n금액 포착·미확정 "+visible+" · 미탐지 "+missed);
        deliveryHistory.setText(checkedLines.length()==0?"아직 건별 비교 내역이 없습니다.":checkedLines.toString().trim());

        JSONArray logs=DiagStore.observations(this);
        StringBuilder out=new StringBuilder();
        for(int i=logs.length()-1;i>=Math.max(0,logs.length()-10);i--){
            JSONObject o=logs.optJSONObject(i);if(o==null)continue;
            out.append(stamp(o.optLong("time",System.currentTimeMillis()))).append(" · ")
              .append(o.optString("platform")).append("\n")
              .append(o.optString("status"));
            if(o.optInt("amount",0)>0)out.append(" · ").append(num(o.optInt("amount"))).append("원");
            String details=o.optString("detail","");
            if(!details.isEmpty())out.append("\n금액 단서: ").append(details);
            out.append("\n\n");
        }
        history.setText(out.length()==0?"아직 감지된 배달 완료 후보가 없습니다.":out.toString().trim());
        JSONArray snapshots=DiagStore.snapshots(this);
        StringBuilder recent=new StringBuilder();
        for(int i=snapshots.length()-1;i>=Math.max(0,snapshots.length()-12);i--){
            JSONObject o=snapshots.optJSONObject(i);
            if(o==null)continue;
            recent.append(stamp(o.optLong("time",System.currentTimeMillis()))).append(" · ")
                .append(o.optString("platform")).append(o.optBoolean("completed")?" · 완료 문구":" · 일반 화면")
                .append("\n").append(o.optString("amounts","금액 없음")).append("\n\n");
        }
        traces.setText(recent.length()==0?"수집된 금액 단서가 없습니다.":recent.toString().trim());
        JSONArray structures=DiagStore.structures(this);
        StringBuilder structural=new StringBuilder();
        for(int i=structures.length()-1;i>=Math.max(0,structures.length()-6);i--){
            JSONObject o=structures.optJSONObject(i);
            if(o==null)continue;
            structural.append(stamp(o.optLong("time",System.currentTimeMillis())))
              .append(" · ").append(o.optString("platform"))
              .append(o.optBoolean("complete")?" · 완료 화면":" · 일반 화면")
              .append("\n")
              .append(o.optString("summary",""))
              .append("\n\n");
        }
        structureHistory.setText(structural.length()==0?"아직 구조화된 금액·라벨 자료가 없습니다.":structural.toString().trim());
        renderPrototype();
    }
    private void share(){
        render();
        String report="라이더스팟 수익 인식 진단 v0.7.0\n\n"
            +status.getText()+"\n\n"+counts.getText()+"\n\n"
            +resources.getText()+"\n\n건별 검증\n"+deliverySummary.getText()+"\n"+deliveryHistory.getText()+"\n\n전체 운행 비교\n"+accuracy.getText()
            +"\n\n최근 후보\n"+history.getText()+"\n\n화면별 금액 단서\n"+traces.getText()+"\n\nUI 구조 분석\n"+structureHistory.getText()
            +"\n\n프로토타입 수익 원장\n"+IncomePrototypeStore.report(this)
            +"\n\n주의: 건수 후보 비율은 인식 정확도가 아닙니다. 배터리 변화는 휴대폰 전체 수치입니다.";
        Intent send=new Intent(Intent.ACTION_SEND);
        send.setType("text/plain");send.putExtra(Intent.EXTRA_TEXT,report);
        startActivity(Intent.createChooser(send,"진단 결과 공유"));
    }
}
