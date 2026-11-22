package com.riderspot.android;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.UUID;

/** Binding between this APK's offline candidate ledger and a single signed-in account. */
final class RiderIncomeOwner {
    private static final String FILE="rs_income_owner_v1";
    static String owner(Context c){
        return c.getSharedPreferences(FILE,Context.MODE_PRIVATE).getString("owner","");
    }
    static boolean ownedBy(Context c,String uid){
        return uid!=null&&!uid.isEmpty()&&uid.equals(owner(c));
    }
    static boolean bind(Context c,String uid){
        try{UUID.fromString(uid);}catch(Exception e){return false;}
        SharedPreferences p=c.getSharedPreferences(FILE,Context.MODE_PRIVATE);
        String old=owner(c);
        if(!old.isEmpty()&&!old.equals(uid))return false;
        return p.edit().putString("owner",uid).commit();
    }
    static synchronized boolean ack(Context c,String id,String status){
        if(!("applied".equals(status)||"needs_review".equals(status)||
            "covered".equals(status)||"rejected".equals(status)))return false;
        try{
            SharedPreferences p=c.getSharedPreferences("riderspot_income_prototype_v07",Context.MODE_PRIVATE);
            JSONArray rows=IncomePrototypeStore.records(c);
            for(int i=0;i<rows.length();i++){
                JSONObject r=rows.optJSONObject(i);
                if(r!=null&&id.equals(r.optString("id"))){
                    r.put("server_status",status);
                    r.put("synced_at",System.currentTimeMillis());
                    return p.edit().putString("records",rows.toString()).commit();
                }
            }
        }catch(Exception ignored){}
        return false;
    }
}
