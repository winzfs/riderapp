package com.riderspot.incomediag;

import android.accessibilityservice.AccessibilityService;
import android.content.SharedPreferences;
import android.os.SystemClock;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import java.util.ArrayDeque;
import java.util.LinkedHashSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** On-device, event-driven diagnostic. No screenshot, OCR, uploads or saved screen text. */
public final class IncomeAccessibilityService extends AccessibilityService {
    private static final Pattern MONEY=Pattern.compile("(?<![0-9,])(?:[0-9]{1,3}(?:,[0-9]{3})+|[0-9]{3,6})\\s*원");
    private static final Pattern COMPLETE=Pattern.compile("배달\\s*완료|배달을\\s*완료|배달이\\s*완료|전달\\s*완료|배송\\s*완료");
    private static final Pattern TOTAL=Pattern.compile("총\\s*수익|누적\\s*수익|총\\s*금액|총액|정산\\s*금액|이번\\s*주\\s*수익");
    private long currentSession=0, raw, scanned, readable, missingRoot, completeScreens, moneyScreens, dedup, lastAt;
    private long lastScan=0,lastFlush=0,lastCandidateAt=0;
    private String lastCandidateFingerprint="";
    private boolean completionPreviously=false;
    private void restoreForSession() {
        SharedPreferences p=DiagStore.prefs(this);
        currentSession=DiagStore.session(this);
        raw=p.getLong("raw",0);
        scanned=p.getLong("examined",0);
        readable=p.getLong("readable",0);
        missingRoot=p.getLong("missingRoot",0);
        completeScreens=p.getLong("completion",0);
        moneyScreens=p.getLong("money",0);
        dedup=p.getLong("duplicates",0);
        lastAt=p.getLong("lastAt",0);
        lastScan=0;lastCandidateAt=0;lastCandidateFingerprint="";completionPreviously=false;
        lastFlush=SystemClock.elapsedRealtime();
    }
    private void flush() {
        if(currentSession==0)return;
        DiagStore.saveCounters(this,raw,scanned,readable,missingRoot,completeScreens,moneyScreens,dedup,lastAt);
        lastFlush=SystemClock.elapsedRealtime();
    }
    @Override public void onAccessibilityEvent(AccessibilityEvent e) {
        if(e==null||!DiagStore.running(this))return;
        String pkg=e.getPackageName()==null?"":e.getPackageName().toString();
        if(!pkg.equals("com.coupang.mobile.eats.courier")&&!pkg.equals("com.woowahan.bros"))return;
        if(currentSession!=DiagStore.session(this))restoreForSession();
        raw++;
        long clock=SystemClock.elapsedRealtime();
        if(clock-lastScan<850) {
            if(clock-lastFlush>10000)flush();
            return;
        }
        lastScan=clock;scanned++;lastAt=System.currentTimeMillis();
        StringBuilder visible=new StringBuilder();
        int[] nodes={0};
        for(CharSequence cs:e.getText()) append(visible,cs);
        AccessibilityNodeInfo root=null;
        try {
            root=getRootInActiveWindow();
            if(root!=null&&root.getPackageName()!=null&&pkg.equals(root.getPackageName().toString())) {
                ArrayDeque<AccessibilityNodeInfo> q=new ArrayDeque<>();
                q.add(root);
                while(!q.isEmpty()&&nodes[0]<180&&visible.length()<28000) {
                    AccessibilityNodeInfo node=q.removeFirst();
                    nodes[0]++;
                    if(node.isVisibleToUser()) {
                        append(visible,node.getText());
                        append(visible,node.getContentDescription());
                    }
                    int count=Math.min(node.getChildCount(),30);
                    for(int i=0;i<count&&q.size()<250;i++) {
                        AccessibilityNodeInfo child=node.getChild(i);
                        if(child!=null)q.add(child);
                    }
                }
            } else missingRoot++;
        }catch(RuntimeException ignored) { missingRoot++; }
        if(visible.length()>0)readable++;
        String screen=visible.toString();
        LinkedHashSet<Integer> amounts=new LinkedHashSet<>();
        Matcher m=MONEY.matcher(screen);
        while(m.find()&&amounts.size()<12) {
            String s=m.group().replaceAll("[^0-9]","");
            try {
                int n=Integer.parseInt(s);
                if(n>=500&&n<=150000)amounts.add(n);
            }catch(NumberFormatException ignored){}
        }
        boolean complete=COMPLETE.matcher(screen).find();
        if(!amounts.isEmpty())moneyScreens++;
        if(complete)completeScreens++;
        if(complete) {
            String fingerprint=pkg+"|"+amounts.toString();
            boolean duplicate=completionPreviously&&lastCandidateFingerprint.equals(fingerprint)
                   &&clock-lastCandidateAt<120000;
            if(duplicate) {
                dedup++;
            } else {
                boolean total=TOTAL.matcher(screen).find();
                String status;
                int amount=0;
                if(amounts.size()==1&&!total) { status="단일 금액 후보";amount=amounts.iterator().next(); }
                else if(amounts.isEmpty())status="금액 없음";
                else if(total)status="합계 화면 의심";
                else status="여러 금액 표시";
                DiagStore.addObservation(this,pkg.equals("com.woowahan.bros")?"배민":"쿠팡이츠",amount,status);
                lastCandidateFingerprint=fingerprint;
                lastCandidateAt=clock;
            }
        }
        completionPreviously=complete;
        if(complete||clock-lastFlush>=10000)flush();
    }
    private static void append(StringBuilder out,CharSequence s) {
        if(s==null||out.length()>27000)return;
        String v=s.toString().trim();
        if(v.isEmpty())return;
        if(v.length()>240)v=v.substring(0,240);
        out.append(' ').append(v).append(' ');
    }
    @Override public void onInterrupt() { flush(); }
    @Override public void onDestroy() {flush();super.onDestroy();}
}
