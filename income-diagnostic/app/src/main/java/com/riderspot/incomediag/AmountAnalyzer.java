package com.riderspot.incomediag;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Conservative diagnostics, NOT authoritative payout extraction.
 * Results never contain original screen text, only amount candidates and label categories.
 */
final class AmountAnalyzer {
    private static final Pattern NUMBER = Pattern.compile("(?<![\\d,])(?:\\d{1,3}(?:,\\d{3})+|\\d{1,6})(?![\\d,])\\s*(?:원)?");
    private static final Pattern COMPLETE = Pattern.compile("배달\\s*완료|배달을\\s*완료|배달이\\s*완료|전달\\s*완료|배송\\s*완료");
    private static final Pattern DIRECT = Pattern.compile("배달료|배달\\s*요금|건당\\s*수익|이번\\s*배달|기본\\s*배달료|배달\\s*수입");
    private static final Pattern TOTAL = Pattern.compile("누적|총\\s*수익|총액|정산|이번\\s*주|이번주|주간|월간|미션|프로모션|보너스|목표|오늘\\s*수익|전체\\s*수익|적립금");
    static final class Money {
        final int amount;
        final String category; // 배달료 인접 / 합계·미션 인접 / 라벨 없음
        Money(int amount,String category){this.amount=amount;this.category=category;}
        String summary(){return String.format(java.util.Locale.KOREA,"%,d원 (%s)",amount,category);}
    }
    static final class Result {
        final boolean completed;
        final List<Money> amounts;
        Result(boolean completed,List<Money> amounts){this.completed=completed;this.amounts=amounts;}
        String summary(){
            if(amounts.isEmpty())return "금액 없음";
            StringBuilder b=new StringBuilder();
            for(Money m:amounts){if(b.length()>0)b.append(" · ");b.append(m.summary());}
            return b.toString();
        }
        /** Exactly equal arithmetic total from two to four other amounts on one screen.
         * Never proof of a completed delivery or its final earnings.
         */
        int uniqueCompositeTotal(){
            int found=0;
            for(Money candidate:amounts){
                List<Money> rest=new ArrayList<>(amounts);
                rest.remove(candidate);
                int size=rest.size();
                boolean match=false;
                for(int mask=1;mask<(1<<size)&&!match;mask++){
                    int count=Integer.bitCount(mask);
                    if(count<2||count>4)continue;
                    long sum=0;
                    for(int i=0;i<size;i++)if((mask&(1<<i))!=0)sum+=rest.get(i).amount;
                    if(sum==candidate.amount)match=true;
                }
                if(match){if(found!=0&&found!=candidate.amount)return 0;found=candidate.amount;}
            }
            return found;
        }
        Money uniqueDirect(){
            Money selected=null;
            for(Money m:amounts)if("배달료 인접".equals(m.category)){
                if(selected!=null)return null;
                selected=m;
            }
            return selected;
        }
    }
    static Result inspect(String raw){
        String s=raw==null?"":raw;
        boolean complete=COMPLETE.matcher(s).find();
        Map<Integer,Money> found=new LinkedHashMap<>();
        Matcher matcher=NUMBER.matcher(s);
        while(matcher.find()&&found.size()<12){
            String token=matcher.group();
            boolean won=token.contains("원");
            String digits=token.replaceAll("[^0-9]","");
            int value;
            try{value=Integer.parseInt(digits);}catch(NumberFormatException e){continue;}
            if(value<1||value>150000)continue;
            int before=Math.max(0,matcher.start()-38);
            int after=Math.min(s.length(),matcher.end()+24);
            String neighborhood=s.substring(before,after);
            // Nearby labels are hints only. Unrelated amounts can appear within this window.
            boolean strong=DIRECT.matcher(neighborhood).find();
            boolean total=TOTAL.matcher(neighborhood).find();
            if(!won&&!strong)continue;
            String category=total?"합계·미션 인접":strong?"배달료 인접":"라벨 없음";
            Money previous=found.get(value);
            if(previous==null || rank(category)>rank(previous.category))
                found.put(value,new Money(value,category));
        }
        return new Result(complete,new ArrayList<>(found.values()));
    }
    private static int rank(String category){
        if("합계·미션 인접".equals(category))return 3;  // conservative: any risky label wins
        if("배달료 인접".equals(category))return 2;
        return 1;
    }
}
