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
    /** Each press validates ONE user-confirmed completed delivery, not a session total. */
    static synchronized String verifyLastDelivery(Context c,int actual) {
        if(actual<500||actual>150000)return "실제 배달료를 500~150,000원으로 입력하세요.";
        try {
            SharedPreferences p=prefs(c);
            long now=System.currentTimeMillis();
            JSONArray observed=observations(c);
            long anchor=0;
            for(int i=observed.length()-1;i>=0;i--) {
                JSONObject row=observed.optJSONObject(i);
                if(row==null)continue;
                long time=row.optLong("time",0);
                if(time>anchor){anchor=time;break;}
            }
            long lastCompared=p.getLong("lastComparedAnchor",0);
            boolean fresh=anchor>lastCompared && now-anchor<=300000L;
            long previousCheck=p.getLong("lastVerifiedAt",0);
            if(!fresh && now-previousCheck<20000L)
                return "최근 비교를 이미 저장했어요. 다음 배달 완료 후 다시 입력해 주세요.";
            java.util.ArrayList<Integer> predicted=new java.util.ArrayList<>();
            java.util.ArrayList<String> details=new java.util.ArrayList<>();
            String platform="알 수 없음";
            long evidenceTime=0;
            if(fresh) {
                long lower=Math.max(lastCompared+1,anchor-30000L);
                for(int i=0;i<observed.length();i++){
                    JSONObject row=observed.optJSONObject(i);
                    if(row==null)continue;
                    long time=row.optLong("time",0);
                    if(time<lower||time>anchor)continue;
                    details.add(row.optString("detail",""));
                    int value=row.optInt("amount",0);
                    if(value>0)predicted.add(value);
                    platform=row.optString("platform",platform);
                }
                evidenceTime=anchor;
            }
            DeliveryVerifier.Verdict v=DeliveryVerifier.classify(actual,predicted,details);
            JSONArray previous=verifications(c);
            JSONObject record=new JSONObject();
            record.put("time",now);
            record.put("evidenceTime",evidenceTime);
            record.put("platform",platform);
            record.put("actual",actual);
            record.put("predicted",v.predicted);
            record.put("status",v.status);
            record.put("visible",v.visible);
            record.put("screens",v.candidateScreens);
            previous.put(record);
            JSONArray limited=new JSONArray();
            for(int i=Math.max(0,previous.length()-150);i<previous.length();i++)
                limited.put(previous.getJSONObject(i));
            SharedPreferences.Editor editor=p.edit()
                .putString("verifications",limited.toString())
                .putLong("lastVerifiedAt",now);
            if(fresh)editor.putLong("lastComparedAnchor",anchor);
            editor.apply();
            return "저장됨: "+v.status+" · 실제 "+actual+"원"+(v.predicted>0?" · 자동 "+v.predicted+"원":" · 자동 확정 없음");
        }catch(Exception error){
            return "건별 비교 기록에 실패했어요. 다시 시도해 주세요.";
        }
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
