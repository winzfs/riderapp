package com.riderspot.incomediag;

import android.accessibilityservice.AccessibilityService;
import android.content.SharedPreferences;
import android.os.SystemClock;
import android.graphics.Rect;
import java.util.List;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import java.util.ArrayDeque;

/**
 * Event-driven on-device diagnostic. No screenshot, OCR, network, or original screen text persistence.
 * Observations are *screen candidates* and must never be treated as final payment records.
 */
public final class IncomeAccessibilityService extends AccessibilityService {
    private long currentSession=0, raw, scanned, readable, missingRoot, completeScreens, moneyScreens, dedup, lastAt;
    private long lastScan=0,lastFlush=0,lastCandidateAt=0,lastTraceAt=0;
    private String lastCandidateFingerprint="",lastTraceFingerprint="",lastStructureFingerprint="";
    private long lastStructureAt=0;
    private static final class Visit {
        final AccessibilityNodeInfo node;
        final int parent;
        Visit(AccessibilityNodeInfo node,int parent){this.node=node;this.parent=parent;}
    }
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
        lastScan=0;lastCandidateAt=0;lastCandidateFingerprint="";
        lastTraceAt=0;lastTraceFingerprint="";
        lastStructureAt=0;lastStructureFingerprint="";
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
        // 350ms sampling allows short-lived completion screens, without periodic polling.
        if(clock-lastScan<350) {
            if(clock-lastFlush>10000)flush();
            return;
        }
        lastScan=clock;scanned++;lastAt=System.currentTimeMillis();
        StringBuilder visible=new StringBuilder();
        NodeContextProbe structureProbe=new NodeContextProbe();
        for(CharSequence cs:e.getText())append(visible,cs);
        try {
            AccessibilityNodeInfo root=getRootInActiveWindow();
            if(root!=null&&root.getPackageName()!=null&&pkg.equals(root.getPackageName().toString())) {
                ArrayDeque<Visit> nodes=new ArrayDeque<>();
                nodes.add(new Visit(root,-1));
                int count=0;
                while(!nodes.isEmpty()&&count++<200&&visible.length()<24000) {
                    Visit visit=nodes.removeFirst();
                    AccessibilityNodeInfo n=visit.node;
                    int parentForChildren=visit.parent;
                    if(n.isVisibleToUser()) {
                        CharSequence t=n.getText();
                        CharSequence description=n.getContentDescription();
                        append(visible,t);
                        append(visible,description);
                        Rect bounds=new Rect();
                        n.getBoundsInScreen(bounds);
                        parentForChildren=structureProbe.add(visit.parent,
                            bounds.centerX(),bounds.centerY(),t,description,
                            n.getViewIdResourceName(),n.getClassName());
                    } else {
                        parentForChildren=structureProbe.add(visit.parent,0,0,
                            null,null,null,n.getClassName());
                    }
                    for(int i=0;i<Math.min(n.getChildCount(),30)&&nodes.size()<240;i++) {
                        AccessibilityNodeInfo child=n.getChild(i);
                        if(child!=null)nodes.add(new Visit(child,parentForChildren));
                    }
                }
            } else missingRoot++;
        } catch(RuntimeException ignored) { missingRoot++; }
        if(visible.length()>0)readable++;
        AmountAnalyzer.Result result=AmountAnalyzer.inspect(visible.toString());
        if(result.completed)completeScreens++;
        if(!result.amounts.isEmpty())moneyScreens++;
        String platform=pkg.equals("com.woowahan.bros")?"배민":"쿠팡이츠";
        List<NodeContextProbe.Entry> grouped=structureProbe.describe();
        if(!grouped.isEmpty()){
            String summary=NodeContextProbe.safeSummary(grouped);
            String structuralSignature=platform+"|"+result.completed+"|"+summary;
            if(!structuralSignature.equals(lastStructureFingerprint)||clock-lastStructureAt>=30000){
                DiagStore.addStructureSnapshot(this,platform,result.completed,
                    summary,NodeContextProbe.verifiedComponentSum(grouped),grouped.size());
                lastStructureFingerprint=structuralSignature;
                lastStructureAt=clock;
            }
        }
        String signature=platform+"|"+result.completed+"|"+result.summary();
        if((result.completed||!result.amounts.isEmpty())&&
           (!signature.equals(lastTraceFingerprint)||clock-lastTraceAt>=30000)) {
            // Store amounts and fixed category labels only, not extracted text or UI tree.
            DiagStore.addSnapshot(this,platform,result.completed,result.summary());
            lastTraceFingerprint=signature;
            lastTraceAt=clock;
        }
        if(result.completed) {
            String fingerprint=platform+"|"+result.summary();
            if(fingerprint.equals(lastCandidateFingerprint)&&clock-lastCandidateAt<60000) {
                dedup++;
            } else {
                int amount=0;
                String status;
                AmountAnalyzer.Money direct=result.uniqueDirect();
                int composite=result.uniqueCompositeTotal();
                if(composite>0){amount=composite;status="합계 일치 후보";}
                else if(result.amounts.isEmpty())status="금액 없음";
                else if(result.amounts.size()>1)status="복수 금액 후보";
                else if(direct!=null) {
                    amount=direct.amount;
                    status="배달료 라벨 후보";
                } else if("합계·미션 인접".equals(result.amounts.get(0).category))status="합계·미션 의심";
                else status="금액 근거 불명";
                DiagStore.addObservation(this,platform,amount,status,result.summary());
                lastCandidateFingerprint=fingerprint;
                lastCandidateAt=clock;
            }
        }
        if(result.completed||clock-lastFlush>=10000)flush();
    }
    private static void append(StringBuilder out,CharSequence cs) {
        if(cs==null||out.length()>22000)return;
        String text=cs.toString().trim();
        if(text.length()==0)return;
        if(text.length()>240)text=text.substring(0,240);
        out.append(' ').append(text).append(' ');
    }
    @Override public void onInterrupt(){flush();}
    @Override public void onDestroy(){flush();super.onDestroy();}
}
