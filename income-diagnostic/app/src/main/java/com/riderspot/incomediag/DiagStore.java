package com.riderspot.incomediag;

import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.os.BatteryManager;
import android.os.Process;
import android.os.SystemClock;
import org.json.JSONArray;
import org.json.JSONObject;

final class DiagStore {
    static final String FILE = "income_probe_private";
    static SharedPreferences prefs(Context c) { return c.getSharedPreferences(FILE, Context.MODE_PRIVATE); }
    static boolean running(Context c) { return prefs(c).getBoolean("running", false); }
    static long session(Context c) { return prefs(c).getLong("session", 0L); }
    static int battery(Context c) {
        Intent i = c.registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
        if (i == null) return -1;
        int l=i.getIntExtra(BatteryManager.EXTRA_LEVEL,-1);
        int s=i.getIntExtra(BatteryManager.EXTRA_SCALE,-1);
        return l<0||s<=0?-1:Math.round(100f*l/s);
    }
    static void start(Context c) {
        long id = System.currentTimeMillis();
        prefs(c).edit().clear().putBoolean("running",true).putLong("session",id)
          .putLong("startElapsed",SystemClock.elapsedRealtime())
          .putLong("startCpu",Process.getElapsedCpuTime())
          .putInt("startBattery",battery(c)).putString("logs","[]").putString("snapshots","[]").putString("verifications","[]").putString("structures","[]").apply();
    }
    static void stop(Context c) {
        prefs(c).edit().putBoolean("running",false)
          .putLong("endElapsed",SystemClock.elapsedRealtime())
          .putLong("endCpu",Process.getElapsedCpuTime())
          .putInt("endBattery",battery(c)).apply();
    }
    static void saveCounters(Context c,long raw,long examined,long readable,long missingRoot,
                             long completion,long money,long dedup,long lastAt) {
        prefs(c).edit().putLong("raw",raw).putLong("examined",examined)
          .putLong("readable",readable).putLong("missingRoot",missingRoot)
          .putLong("completion",completion).putLong("money",money)
          .putLong("duplicates",dedup).putLong("lastAt",lastAt).apply();
    }
    static synchronized void addObservation(Context c,String platform,int amount,String status,String detail) {
        try {
            SharedPreferences p=prefs(c);
            JSONArray a=new JSONArray(p.getString("logs","[]"));
            JSONObject item=new JSONObject();
            item.put("time",System.currentTimeMillis());
            item.put("platform",platform);
            item.put("amount",amount);
            item.put("status",status);
            item.put("detail",detail);
            a.put(item);
            JSONArray limited=new JSONArray();
            for(int i=Math.max(0,a.length()-120);i<a.length();i++)limited.put(a.getJSONObject(i));
            SharedPreferences.Editor e=p.edit().putString("logs",limited.toString());
            if("배달료 라벨 후보".equals(status)||"합계 일치 후보".equals(status)) {
                e.putInt("accepted",p.getInt("accepted",0)+1)
                  .putLong("sum",p.getLong("sum",0)+amount);
            } else {
                e.putInt("uncertain",p.getInt("uncertain",0)+1);
            }
            e.apply();
        } catch(Exception ignored) { }
    }
    static synchronized void addSnapshot(Context c,String platform,boolean complete,String amounts) {
        try {
            SharedPreferences p=prefs(c);
            JSONArray a=new JSONArray(p.getString("snapshots","[]"));
            JSONObject item=new JSONObject();
            item.put("time",System.currentTimeMillis());
            item.put("platform",platform);
            item.put("completed",complete);
            item.put("amounts",amounts);
            a.put(item);
            JSONArray recent=new JSONArray();
            for(int i=Math.max(0,a.length()-30);i<a.length();i++)recent.put(a.getJSONObject(i));
            p.edit().putString("snapshots",recent.toString()).apply();
        } catch(Exception ignored) { }
    }
    static JSONArray snapshots(Context c) {
        try{return new JSONArray(prefs(c).getString("snapshots","[]"));}
        catch(Exception e){return new JSONArray();}
    }
    /** Compare one new completion evidence window. Repeated submit must never count as a new delivery. */
    static synchronized String verifyLastDelivery(Context c,int actual) {
        if(actual<500||actual>150000)return "실제 배달료를 500~150,000원으로 입력하세요.";
        try {
            SharedPreferences p=prefs(c);
            if(!running(c))return "먼저 측정을 시작해 주세요.";
            long now=System.currentTimeMillis();
            JSONArray observed=observations(c);
            long anchor=0;
            String platform="알 수 없음";
            for(int i=observed.length()-1;i>=0;i--) {
                JSONObject row=observed.optJSONObject(i);
                if(row!=null&&row.optLong("time",0)>0){
                    anchor=row.optLong("time");
                    platform=row.optString("platform",platform);
                    break;
                }
            }
            long previousAnchor=p.getLong("lastComparedAnchor",0);
            if(anchor>0 && anchor<=previousAnchor)
                return "이 완료 화면은 이미 검증했어요. 재입력은 중복 건으로 저장하지 않습니다.";
            if(!DeliveryVerifier.isNewEvidence(anchor,previousAnchor,now))
                return "최근 5분 내 새 완료 화면이 없어요. 실제 배달이 있었다면 '감지 누락 수동 기록'을 사용해 주세요.";

            long from=Math.max(previousAnchor+1,anchor-30000L);
            java.util.ArrayList<Integer> predicted=new java.util.ArrayList<>();
            java.util.ArrayList<String> details=new java.util.ArrayList<>();
            JSONArray snapshots=snapshots(c);
            // Capture any recognized amount on the same completion screen even when
            // the conservative auto-accept rules abstain from selecting one.
            for(int i=0;i<snapshots.length();i++){
                JSONObject row=snapshots.optJSONObject(i);
                if(row==null||!row.optBoolean("completed"))continue;
                long at=row.optLong("time",0);
                if(at>=from&&at<=anchor)details.add(row.optString("amounts",""));
            }
            for(int i=0;i<observed.length();i++){
                JSONObject row=observed.optJSONObject(i);
                if(row==null)continue;
                long at=row.optLong("time",0);
                if(at<from||at>anchor)continue;
                details.add(row.optString("detail",""));
                int amount=row.optInt("amount",0);
                if(amount>0)predicted.add(amount);
            }
            DeliveryVerifier.Verdict verdict=DeliveryVerifier.classify(actual,predicted,details);
            JSONObject record=new JSONObject();
            record.put("time",now);
            record.put("evidenceTime",anchor);
            record.put("platform",platform);
            record.put("actual",actual);
            record.put("predicted",verdict.predicted);
            record.put("status",verdict.status);
            record.put("visible",verdict.visible);
            record.put("screens",verdict.candidateScreens);
            appendVerification(c,record);
            p.edit().putLong("lastComparedAnchor",anchor).apply();
            return "저장됨: "+verdict.status+" · 실제 "+actual+"원"+
                (verdict.predicted>0?" · 자동 "+verdict.predicted+"원":" · 자동 확정 없음");
        }catch(Exception error){
            return "건별 비교 기록에 실패했어요. 다시 시도해 주세요.";
        }
    }

    /** Explicit manual fallback for a real order with no *new* completion evidence. */
    static synchronized String recordUnseenDelivery(Context c,int actual){
        if(actual<500||actual>150000)return "실제 배달료를 500~150,000원으로 입력하세요.";
        if(!running(c))return "먼저 측정을 시작해 주세요.";
        try{
            SharedPreferences p=prefs(c);
            long now=System.currentTimeMillis();
            long latestObservation=0L;
            JSONArray events=observations(c);
            for(int i=events.length()-1;i>=0;i--){
                JSONObject row=events.optJSONObject(i);
                if(row!=null){latestObservation=row.optLong("time",0);break;}
            }
            if(DeliveryVerifier.isNewEvidence(latestObservation,
                    p.getLong("lastComparedAnchor",0),now))
                return "최근 완료 화면 기록이 있습니다. 먼저 '마지막 배달 비교'를 이용해 주세요.";
            if(now-p.getLong("lastManualUnseenAt",0)<20000L)
                return "방금 수동 기록을 추가했어요. 중복 입력을 확인해 주세요.";
            JSONObject record=new JSONObject();
            record.put("time",now);
            record.put("evidenceTime",0L);
            record.put("platform","미확인");
            record.put("actual",actual);
            record.put("predicted",0);
            record.put("status","완료 화면 미탐지·수동 기록");
            record.put("visible",false);
            record.put("screens",0);
            appendVerification(c,record);
            p.edit().putLong("lastManualUnseenAt",now).apply();
            return "저장됨: 완료 화면 미탐지 · 실제 "+actual+"원 · 자동 인식 0건";
        }catch(Exception error){return "수동 누락 기록에 실패했어요.";}
    }

    private static void appendVerification(Context c,JSONObject record) throws Exception{
        SharedPreferences p=prefs(c);
        JSONArray previous=verifications(c);
        previous.put(record);
        JSONArray limited=new JSONArray();
        for(int i=Math.max(0,previous.length()-150);i<previous.length();i++)
            limited.put(previous.getJSONObject(i));
        p.edit().putString("verifications",limited.toString())
            .putLong("lastVerifiedAt",System.currentTimeMillis()).apply();
    }
    static JSONArray verifications(Context c){
        try{return new JSONArray(prefs(c).getString("verifications","[]"));}
        catch(Exception e){return new JSONArray();}
    }

    /** Persist sanitized, predefined label tokens and categorical spatial relations only. */
    static synchronized void addStructureSnapshot(Context c,String platform,boolean complete,
            String safeSummary,int componentSum,int matchingAmounts){
        try{
            SharedPreferences p=prefs(c);
            JSONArray arr=structures(c);
            JSONObject row=new JSONObject();
            row.put("time",System.currentTimeMillis());
            row.put("platform",platform);
            row.put("complete",complete);
            row.put("summary",safeSummary);
            row.put("sum",componentSum);
            row.put("count",matchingAmounts);
            arr.put(row);
            JSONArray recent=new JSONArray();
            for(int i=Math.max(0,arr.length()-30);i<arr.length();i++)recent.put(arr.getJSONObject(i));
            p.edit().putString("structures",recent.toString()).apply();
        }catch(Exception ignored){}
    }
    static JSONArray structures(Context c){
        try{return new JSONArray(prefs(c).getString("structures","[]"));}
        catch(Exception e){return new JSONArray();}
    }
    static JSONArray observations(Context c) {
        try { return new JSONArray(prefs(c).getString("logs","[]")); }
        catch(Exception e) { return new JSONArray(); }
    }
}
