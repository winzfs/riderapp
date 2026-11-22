package com.riderspot.incomediag;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Only exports fixed fee labels and numeric amounts; raw accessibility text is discarded.
 * A same-text label/amount pair is evidence, not proof of a specific completed delivery.
 */
final class FeeComponentParser {
    private static final Pattern LABEL = Pattern.compile("기본수수료|추가수수료|리워드");
    private static final Pattern DIRECT_AMOUNT = Pattern.compile("^[：:=+·-]*([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{1,6})원");
    static final class Item {
        final String label;
        final int amount;
        Item(String label,int amount){this.label=label;this.amount=amount;}
    }
    static List<Item> extract(String text) {
        List<Item> items=new ArrayList<>();
        if(text==null||text.isEmpty()||text.length()>12000)return items;
        String compact=compact(text);
        Matcher matcher=LABEL.matcher(compact);
        Set<String> dedup=new HashSet<>();
        while(matcher.find()&&items.size()<12) {
            int start=matcher.end();
            String right=compact.substring(start,Math.min(compact.length(),start+22));
            Matcher amount=DIRECT_AMOUNT.matcher(right);
            if(!amount.find())continue;
            try{
                int value=Integer.parseInt(amount.group(1).replace(",",""));
                if(value<0||value>150000)continue;
                String key=matcher.group()+":"+value;
                if(dedup.add(key))items.add(new Item(matcher.group(),value));
            }catch(NumberFormatException ignored){}
        }
        return items;
    }
    static String compact(String raw){
        StringBuilder s=new StringBuilder(raw.length());
        for(int i=0;i<raw.length();){
            int cp=raw.codePointAt(i);
            i+=Character.charCount(cp);
            if(Character.isWhitespace(cp)||Character.isSpaceChar(cp)
                    ||cp==0x200B||cp==0xFEFF)continue;
            s.appendCodePoint(cp);
        }
        return s.toString();
    }
}
