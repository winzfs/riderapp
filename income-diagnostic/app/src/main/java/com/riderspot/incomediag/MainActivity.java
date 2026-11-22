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
    private TextView status,counts,resources,accuracy,history;
    private EditText actualCount,actualTotal;
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
        add(body,text("RIDERSPOT  /  DEVELOPER LAB",12,ACCENT,true),0);
        add(body,text("수익 인식 진단",28,INK,true),8);
        add(body,text("실제 쿠팡이츠 · 배민 화면의 접근성 이벤트를 측정합니다. 화면 캡처, OCR, 서버 전송은 사용하지 않습니다.",13,SUB,false),10);

        LinearLayout state=card(body,"측정 상태");
        status=text("",14,SUB,false);add(state,status,10);
        buttons(state,button("접근성 설정",false,v->{
            startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS));
        }),button("측정 시작",true,v->{DiagStore.start(this);render();}));
        buttons(state,button("측정 종료",false,v->{DiagStore.stop(this);render();}),
                      button("보고서 공유",false,v->share()));

        LinearLayout measures=card(body,"인식 이벤트");
        counts=text("",14,INK,false);add(measures,counts,10);

        LinearLayout system=card(body,"리소스 측정");
        resources=text("",14,INK,false);add(system,resources,10);
        add(system,text("배터리 변화는 휴대폰 전체 값이며 이 앱만의 전력 소비량이 아닙니다. CPU 시간과 메모리도 진단 화면을 포함한 앱 프로세스 전체 측정치입니다.",12,SUB,false),12);

        LinearLayout truth=card(body,"실제 배달 결과와 비교");
        add(truth,text("테스트가 끝난 뒤 쿠팡이츠·배민에서 확인한 실제 완료 건수와 총배달료를 입력하세요. 건수·총액 일치 여부만 판단하며 개별 건 정확도는 아직 측정하지 않습니다.",12,SUB,false),8);
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
        add(events,text("단일 금액 후보도 실제 배달 완료라고 확정된 값은 아닙니다. 원본 화면 내용·주소·고객 정보는 저장하지 않습니다.",12,SUB,false),12);

        LinearLayout guide=card(body,"테스트 방법");
        add(guide,text("1. 접근성 설정에서 ‘라이더스팟 수익 인식 테스트’를 허용합니다.\n2. 측정 시작을 누른 뒤 평소처럼 배달합니다.\n3. 배달 완료 화면을 지나갈 때 감지 기록이 남는지 확인합니다.\n4. 운행을 마친 후 측정 종료를 누르고 실제 건수·총액을 입력합니다.\n5. 보고서 공유로 결과를 내보냅니다.\n\nAndroid가 설치된 앱의 접근성 설정을 제한하면 앱 정보 화면의 ⋮ → 제한된 설정 허용을 확인하세요.",13,INK,false),12);
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
            if(s.getId()!=null&&s.getId().contains("com.riderspot.incomediag")&&s.getId().contains("IncomeAccessibilityService"))
                return true;
        return false;
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
        counts.setText("접수된 접근성 이벤트  "+num(raw)+"회\n분석 실행  "+num(scan)+"회\n텍스트 접근 가능  "+num(readable)+"회\n화면 트리 미확인  "+num(p.getLong("missingRoot",0))+"회\n완료 문구 감지 화면  "+num(p.getLong("completion",0))+"회\n금액 표시 화면  "+num(p.getLong("money",0))+"회\n단일 금액 후보  "+num(accepted)+"건 / "+num(sum)+"원\n확인 필요 후보  "+num(uncertain)+"건\n중복 화면 억제  "+num(p.getLong("duplicates",0))+"회");
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
            accuracy.setText("감지 후보 "+accepted+"건 / 실제 "+truthCount+"건\n건수 후보 비율 "+ratio+" (정확도 아님)\n자동 인식 금액 "+num(sum)+"원 / 실제 "+num(truthTotal)+"원\n금액 차이 "+(sum-truthTotal>=0?"+":"")+num(sum-truthTotal)+"원\n건수 "+(accepted==truthCount?"일치":"불일치")+" · 총액 "+(sum==truthTotal?"일치":"불일치"));
        }else accuracy.setText("실제 배달 결과를 저장하면 건수·총액 비교가 표시됩니다.");
        JSONArray logs=DiagStore.observations(this);
        StringBuilder out=new StringBuilder();
        for(int i=logs.length()-1;i>=Math.max(0,logs.length()-10);i--){
            JSONObject o=logs.optJSONObject(i);if(o==null)continue;
            out.append(stamp(o.optLong("time",System.currentTimeMillis()))).append(" · ")
              .append(o.optString("platform")).append("\n")
              .append(o.optString("status"));
            if(o.optInt("amount",0)>0)out.append(" · ").append(num(o.optInt("amount"))).append("원");
            out.append("\n\n");
        }
        history.setText(out.length()==0?"아직 감지된 배달 완료 후보가 없습니다.":out.toString().trim());
    }
    private void share(){
        render();
        String report="라이더스팟 수익 인식 진단 v0.1.0\n\n"
            +status.getText()+"\n\n"+counts.getText()+"\n\n"
            +resources.getText()+"\n\n"+accuracy.getText()
            +"\n\n최근 후보\n"+history.getText()
            +"\n\n주의: 후보 비율은 실제 인식 정확도가 아니며, 배터리 변화는 기기 전체 수치입니다.";
        Intent send=new Intent(Intent.ACTION_SEND);
        send.setType("text/plain");send.putExtra(Intent.EXTRA_TEXT,report);
        startActivity(Intent.createChooser(send,"진단 결과 공유"));
    }
}
