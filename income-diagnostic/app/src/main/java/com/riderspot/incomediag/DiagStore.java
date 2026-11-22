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
          .putInt("startBattery",battery(c)).putString("logs","[]").apply();
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
    static synchronized void addObservation(Context c,String platform,int amount,String status) {
        try {
            SharedPreferences p=prefs(c);
            JSONArray a=new JSONArray(p.getString("logs","[]"));
            JSONObject item=new JSONObject();
            item.put("time",System.currentTimeMillis());
            item.put("platform",platform);
            item.put("amount",amount);
            item.put("status",status);
            a.put(item);
            JSONArray limited=new JSONArray();
            for(int i=Math.max(0,a.length()-120);i<a.length();i++)limited.put(a.getJSONObject(i));
            SharedPreferences.Editor e=p.edit().putString("logs",limited.toString());
            if("단일 금액 후보".equals(status)) {
                e.putInt("accepted",p.getInt("accepted",0)+1)
                  .putLong("sum",p.getLong("sum",0)+amount);
            } else {
                e.putInt("uncertain",p.getInt("uncertain",0)+1);
            }
            e.apply();
        } catch(Exception ignored) { }
    }
    static JSONArray observations(Context c) {
        try { return new JSONArray(prefs(c).getString("logs","[]")); }
        catch(Exception e) { return new JSONArray(); }
    }
}
