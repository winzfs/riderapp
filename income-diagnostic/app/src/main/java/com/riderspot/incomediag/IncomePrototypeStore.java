package com.riderspot.incomediag;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONObject;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

/**
 * Isolated, on-device prototype ledger. No network calls, no PII, and no Rider Spot
 * production income writes. All changes are explicit and recorded only after opt-in.
 */
final class IncomePrototypeStore {
    private static final String FILE="riderspot_income_prototype_v07";
    private static final int LIMIT=300;
    private static SharedPreferences prefs(Context c){
        return c.getSharedPreferences(FILE,Context.MODE_PRIVATE);
    }
    static boolean enabled(Context c){return prefs(c).getBoolean("enabled",false);}
    static void setEnabled(Context c,boolean yes){prefs(c).edit().putBoolean("enabled",yes).apply();}
    static JSONArray records(Context c){
        try{return new JSONArray(prefs(c).getString("records","[]"));}
        catch(Exception ignored){return new JSONArray();}
    }
    private static JSONArray trimmed(JSONArray rows) throws Exception{
        JSONArray out=new JSONArray();
        for(int i=Math.max(0,rows.length()-LIMIT);i<rows.length();i++)
            out.put(rows.getJSONObject(i));
        return out;
    }
    private static String workDay(long at){
        Calendar c=Calendar.getInstance(TimeZone.getTimeZone("Asia/Seoul"));
        c.setTimeInMillis(at-3*3600000L);
        return String.format(Locale.ROOT,"%04d-%02d-%02d",
            c.get(Calendar.YEAR),c.get(Calendar.MONTH)+1,c.get(Calendar.DAY_OF_MONTH));
    }
    /**
     * Only opens a new candidate for a new UI completion episode.
     * The 90s same-fingerprint guard survives accessibility process restarts,
     * but identical consecutive deliveries can still be missed (documented limitation).
     */
    static synchronized boolean capture(Context c,String platform,
            IncomePrototypeClassifier.Decision decision,long now){
        if(!enabled(c)||decision==null||!decision.collectable())return false;
        try{
            SharedPreferences p=prefs(c);
            JSONArray rows=records(c);
            String fingerprint=platform+"|"+decision.fingerprint();
            for(int i=rows.length()-1;i>=0&&i>=rows.length()-20;i--){
                JSONObject prior=rows.optJSONObject(i);
                if(prior==null)continue;
                long age=now-prior.optLong("time",0);
                if(age>90000L)break;
                if(age>=0 && fingerprint.equals(prior.optString("fingerprint")) &&
                   !"REJECTED".equals(prior.optString("state")))return false;
            }
            JSONObject row=new JSONObject();
            row.put("id",now+"-"+rows.length());
            row.put("time",now);
            row.put("work_day",workDay(now));
            row.put("platform",platform);
            row.put("amount",decision.amount);
            row.put("base",decision.base);
            row.put("extra",decision.extra);
            row.put("reward",decision.reward);
            row.put("strength",decision.level);
            row.put("state","STRONG".equals(decision.level)?"CANDIDATE":"REVIEW");
            row.put("reason",decision.reason);
            row.put("fingerprint",fingerprint);
            row.put("source","accessibility-v0.7-prototype");
            rows.put(row);
            return p.edit().putString("records",trimmed(rows).toString()).commit();
        }catch(Exception ignored){return false;}
    }
    /** Upgrade an uncertain screen to strong evidence without adding a second order. */
    static synchronized boolean promoteRecent(Context c,String platform,
            IncomePrototypeClassifier.Decision decision,long now){
        if(!enabled(c)||decision==null||!IncomePrototypeClassifier.STRONG.equals(decision.level))return false;
        try{
            SharedPreferences p=prefs(c);
            JSONArray rows=records(c);
            if(rows.length()==0)return false;
            JSONObject last=rows.optJSONObject(rows.length()-1);
            if(last==null||!"REVIEW".equals(last.optString("state"))||
                !platform.equals(last.optString("platform"))||
                now-last.optLong("time")>15000L)return false;
            last.put("amount",decision.amount);
            last.put("base",decision.base);
            last.put("extra",decision.extra);
            last.put("reward",decision.reward);
            last.put("strength",decision.level);
            last.put("state","CANDIDATE");
            last.put("reason",decision.reason);
            last.put("fingerprint",platform+"|"+decision.fingerprint());
            return p.edit().putString("records",rows.toString()).commit();
        }catch(Exception ignored){return false;}
    }
    static synchronized boolean setState(Context c,String id,String state){
        if(!"CONFIRMED".equals(state)&&!"REJECTED".equals(state))return false;
        try{
            SharedPreferences p=prefs(c);
            JSONArray rows=records(c);
            for(int i=0;i<rows.length();i++){
                JSONObject r=rows.getJSONObject(i);
                if(id.equals(r.optString("id"))){
                    if("REJECTED".equals(r.optString("state"))||
                        "CONFIRMED".equals(r.optString("state")))return false;
                    r.put("state",state);
                    r.put("reviewed_at",System.currentTimeMillis());
                    return p.edit().putString("records",rows.toString()).commit();
                }
            }
        }catch(Exception ignored){}
        return false;
    }
    /** A manual truth match annotates the candidate but never changes its predicted amount. */
    static synchronized void noteManualComparison(Context c,int actual,boolean matched){
        if(!enabled(c))return;
        try{
            SharedPreferences p=prefs(c);
            JSONArray rows=records(c);
            long now=System.currentTimeMillis();
            for(int i=rows.length()-1;i>=0;i--){
                JSONObject r=rows.getJSONObject(i);
                long dt=now-r.optLong("time",0);
                if(dt>300000L)break;
                if(dt<0||r.has("manual_actual")||"REJECTED".equals(r.optString("state")))continue;
                r.put("manual_actual",actual);
                r.put("manual_match",matched&&r.optInt("amount")==actual);
                p.edit().putString("records",rows.toString()).apply();
                break;
            }
        }catch(Exception ignored){}
    }
    static String summary(Context c){
        JSONArray rows=records(c);
        int confirm=0,pending=0,review=0,rejected=0;long confirmedSum=0,candidateSum=0;
        String today=workDay(System.currentTimeMillis());
        int todayCount=0;long todaySum=0;
        for(int i=0;i<rows.length();i++){
            JSONObject r=rows.optJSONObject(i);if(r==null)continue;
            int amount=r.optInt("amount",0);
            switch(r.optString("state","")){
                case "CONFIRMED":confirm++;confirmedSum+=amount;
                    if(today.equals(r.optString("work_day"))){todayCount++;todaySum+=amount;}break;
                case "CANDIDATE":pending++;candidateSum+=amount;break;
                case "REVIEW":review++;break;
                case "REJECTED":rejected++;break;
            }
        }
        return "로컬 수집: "+rows.length()+"건 · 강한 후보 "+pending+"건 / "+candidateSum+
            "원 · 확인 필요 "+review+"건\n수동 승인 "+confirm+"건 / "+
            confirmedSum+"원 · 제외 "+rejected+"건\n오늘(새벽 3시 기준) 승인 "+
            todayCount+"건 / "+todaySum+"원";
    }
    static String report(Context c){
        StringBuilder s=new StringBuilder("수익 자동수집 프로토타입 v0.7 · 로컬 보관\n");
        s.append(summary(c)).append("\n자동 후보는 실제 정산 수익이 아닙니다. 서버 전송 없음.\n");
        JSONArray rows=records(c);
        for(int i=0;i<rows.length();i++){
            JSONObject r=rows.optJSONObject(i);if(r==null)continue;
            s.append(r.optString("work_day")).append(" · ")
             .append(r.optString("platform")).append(" · ")
             .append(r.optInt("amount")).append("원 · ")
             .append(r.optString("state")).append(" · 기본 ")
             .append(r.optInt("base")).append(" / 추가 ")
             .append(r.optInt("extra")).append(" / 리워드 ")
             .append(r.optInt("reward")).append("\n");
        }
        return s.toString();
    }
    static String csv(Context c){
        StringBuilder s=new StringBuilder("id,work_day,platform,amount,base,extra,reward,strength,state,manual_actual\n");
        JSONArray rows=records(c);
        for(int i=0;i<rows.length();i++){
            JSONObject r=rows.optJSONObject(i);if(r==null)continue;
            s.append(r.optString("id")).append(",")
              .append(r.optString("work_day")).append(",")
              .append(r.optString("platform")).append(",")
              .append(r.optInt("amount")).append(",")
              .append(r.optInt("base")).append(",")
              .append(r.optInt("extra")).append(",")
              .append(r.optInt("reward")).append(",")
              .append(r.optString("strength")).append(",")
              .append(r.optString("state")).append(",")
              .append(r.optInt("manual_actual",0)).append("\n");
        }
        return s.toString();
    }
}
