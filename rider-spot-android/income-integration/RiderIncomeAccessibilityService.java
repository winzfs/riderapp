package com.riderspot.android;

import android.accessibilityservice.AccessibilityService;
import android.graphics.Rect;
import android.os.SystemClock;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import java.util.ArrayDeque;
import java.util.List;

/**
 * Local-only RiderSpot income candidate collection.
 * Explicit opt-in is required in the trusted RiderSpot WebView.
 * Never reads customer identity, addresses, order identifiers, or other apps.
 */
public final class RiderIncomeAccessibilityService extends AccessibilityService {
    private static final String COUPANG="com.coupang.mobile.eats.courier";
    private static final String BAEMIN="com.woowahan.bros";
    private final PrototypeCaptureGate gate=new PrototypeCaptureGate();
    private long lastScan=0L;
    private static final class Visit {
        final AccessibilityNodeInfo node; final int parent;
        Visit(AccessibilityNodeInfo node,int parent){this.node=node;this.parent=parent;}
    }
    @Override public void onAccessibilityEvent(AccessibilityEvent event){
        if(event==null||!IncomePrototypeStore.enabled(this))return;
        String pkg=event.getPackageName()==null?"":event.getPackageName().toString();
        if(!COUPANG.equals(pkg)&&!BAEMIN.equals(pkg))return;
        final long clock=SystemClock.elapsedRealtime();
        if(clock-lastScan<350L)return;
        lastScan=clock;
        StringBuilder visible=new StringBuilder();
        for(CharSequence text:event.getText())append(visible,text);
        NodeContextProbe probe=new NodeContextProbe();
        try{
            AccessibilityNodeInfo root=getRootInActiveWindow();
            if(root==null||root.getPackageName()==null||
                 !pkg.equals(root.getPackageName().toString()))return;
            ArrayDeque<Visit> queue=new ArrayDeque<>();
            queue.add(new Visit(root,-1));
            int visited=0;
            while(!queue.isEmpty()&&visited++<200&&visible.length()<24000){
                Visit visit=queue.removeFirst();
                AccessibilityNodeInfo node=visit.node;
                int parent=visit.parent;
                if(node.isVisibleToUser()){
                    CharSequence t=node.getText();
                    CharSequence d=node.getContentDescription();
                    append(visible,t);append(visible,d);
                    Rect bounds=new Rect();
                    node.getBoundsInScreen(bounds);
                    parent=probe.add(visit.parent,bounds.centerX(),bounds.centerY(),
                         t,d,node.getViewIdResourceName(),node.getClassName());
                } else {
                    parent=probe.add(visit.parent,0,0,null,null,null,node.getClassName());
                }
                for(int i=0;i<Math.min(node.getChildCount(),30)&&queue.size()<240;i++){
                    AccessibilityNodeInfo child=node.getChild(i);
                    if(child!=null)queue.add(new Visit(child,parent));
                }
            }
        }catch(RuntimeException ignored){return;}
        AmountAnalyzer.Result parsed=AmountAnalyzer.inspect(visible.toString());
        gate.observe(parsed.completed,clock);
        if(!parsed.completed)return;
        List<NodeContextProbe.Entry> linked=probe.describe();
        IncomePrototypeClassifier.Decision decision=
            IncomePrototypeClassifier.classify(parsed,linked);
        if(!decision.collectable())return;
        long now=System.currentTimeMillis();
        String platform=COUPANG.equals(pkg)?"쿠팡이츠":"배민";
        if(gate.armed()){
            // Capture even if transiently offline; the JavaScript bridge syncs later.
            IncomePrototypeStore.capture(this,platform,decision,now);
            gate.markCaptured();
        }else{
            IncomePrototypeStore.promoteRecent(this,platform,decision,now);
        }
    }
    private static void append(StringBuilder output,CharSequence value){
        if(value==null||output.length()>22000)return;
        String item=value.toString().trim();
        if(item.length()==0)return;
        if(item.length()>240)item=item.substring(0,240);
        output.append(' ').append(item).append(' ');
    }
    @Override public void onInterrupt(){}
}
