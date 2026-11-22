package com.riderspot.incomediag;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Read-only income evidence classifier. A strong candidate is NOT a settled payment.
 * Only known fee labels/amounts and structural relationships reach this class.
 */
final class IncomePrototypeClassifier {
    static final String IGNORE="IGNORE", REVIEW="REVIEW", STRONG="STRONG";
    static final class Decision {
        final String level, reason;
        final int amount, base, extra, reward;
        Decision(String level,int amount,int base,int extra,int reward,String reason) {
            this.level=level;this.amount=amount;this.base=base;this.extra=extra;this.reward=reward;this.reason=reason;
        }
        boolean collectable(){return !IGNORE.equals(level)&&amount>=500&&amount<=150000;}
        String fingerprint(){return amount+"|"+base+"|"+extra+"|"+reward;}
    }
    private static Decision ignore(){return new Decision(IGNORE,0,0,0,0,"근거 불충분");}
    private static boolean feeLabel(String s){
        return "기본수수료".equals(s)||"추가수수료".equals(s)||"리워드".equals(s);
    }
    static Decision classify(AmountAnalyzer.Result analysis,List<NodeContextProbe.Entry> entries){
        if(analysis==null||!analysis.completed||entries==null)return ignore();
        Map<String,Integer> components=new HashMap<>();
        boolean conflict=false;
        for(NodeContextProbe.Entry e:entries){
            if(!feeLabel(e.label) || !"같은 문자열".equals(e.relation) ||
                !"문구 바로 뒤".equals(e.proximity))continue;
            Integer prior=components.putIfAbsent(e.label,e.amount);
            if(prior!=null&&prior.intValue()!=e.amount) conflict=true;
        }
        int base=components.getOrDefault("기본수수료",0);
        int extra=components.getOrDefault("추가수수료",0);
        int reward=components.getOrDefault("리워드",0);
        int sum=base+extra+reward;
        boolean hasComponentPair=components.containsKey("기본수수료")&&
            (components.containsKey("추가수수료")||components.containsKey("리워드"));
        boolean totalInText=false;
        for(AmountAnalyzer.Money money:analysis.amounts)if(money.amount==sum)totalInText=true;
        boolean nearCompletedTotal=false;
        boolean conflictingCompletedTotals=false;
        int completedTotal=0;
        for(NodeContextProbe.Entry e:entries){
            if(!("배달 완료".equals(e.label)||"배달완료".equals(e.label)||
                "총 배달료".equals(e.label)))continue;
            boolean same="동일 요소".equals(e.relation);
            boolean closelyRelated="부모 요소".equals(e.relation)&&
                ("매우 가까움".equals(e.proximity)||"가까움".equals(e.proximity));
            if(!same&&!closelyRelated)continue;
            if(e.amount<500||e.amount>150000)continue;
            if(completedTotal!=0&&completedTotal!=e.amount)conflictingCompletedTotals=true;
            completedTotal=e.amount;
            if(e.amount==sum)nearCompletedTotal=true;
        }
        if(!conflict && !conflictingCompletedTotals && hasComponentPair && sum>=500 &&
            sum<=150000 && totalInText && nearCompletedTotal)
            return new Decision(STRONG,sum,base,extra,reward,"완료 총액·수수료 항목 합산 일치");
        // Totals without the expected UI link may be from another part of the screen.
        // Keep them review-only; do not silently recognize them as income.
        if(hasComponentPair && !conflict && sum>=500&&sum<=150000&&totalInText)
            return new Decision(REVIEW,sum,base,extra,reward,"수수료 합계 확인·완료 영역 미확인");
        if(completedTotal>=500&&!conflictingCompletedTotals)
            return new Decision(REVIEW,completedTotal,base,extra,reward,"완료 금액 후보·항목 검증 필요");
        return ignore();
    }
}
