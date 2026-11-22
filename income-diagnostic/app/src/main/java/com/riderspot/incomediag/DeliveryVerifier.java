package com.riderspot.incomediag;

import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Compares manually entered truth against independently captured screen evidence. */
final class DeliveryVerifier {
    private static final Pattern AMOUNT=Pattern.compile("(?<![0-9])([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{3,6})\\s*원");
    static final class Verdict {
        final String status;
        final int predicted;
        final int candidateScreens;
        final boolean visible;
        Verdict(String status,int predicted,int screens,boolean visible) {
            this.status=status;this.predicted=predicted;this.candidateScreens=screens;this.visible=visible;
        }
    }
    static Verdict classify(int actual,List<Integer> predictions,List<String> observed) {
        Set<Integer> confirmed=new HashSet<>();
        for(Integer value:predictions)if(value!=null&&value>0)confirmed.add(value);
        Set<Integer> screenAmounts=new HashSet<>();
        for(String source:observed) {
            if(source==null)continue;
            Matcher m=AMOUNT.matcher(source);
            while(m.find()) {
                try{screenAmounts.add(Integer.parseInt(m.group(1).replace(",","")));}
                catch(NumberFormatException ignored){}
            }
        }
        int predicted=confirmed.size()==1?confirmed.iterator().next():0;
        boolean visible=screenAmounts.contains(actual);
        if(confirmed.size()==1&&predicted==actual)
            return new Verdict("자동 후보 일치",predicted,observed.size(),visible);
        if(confirmed.size()>1)
            return new Verdict("자동 후보 충돌",0,observed.size(),visible);
        if(confirmed.size()==1)
            return new Verdict("자동 후보 오인식",predicted,observed.size(),visible);
        if(visible)
            return new Verdict("금액 감지·자동 미인식",0,observed.size(),true);
        return new Verdict("금액 미탐지",0,observed.size(),false);
    }
}
