package com.riderspot.incomediag;

import org.junit.Test;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import static org.junit.Assert.*;

public class IncomePrototypeClassifierTest {
    private NodeContextProbe.Entry fee(String label,int amount){
        return new NodeContextProbe.Entry(amount,label,"같은 문자열","문구 바로 뒤","기타",false);
    }
    private NodeContextProbe.Entry done(int amount){
        return new NodeContextProbe.Entry(amount,"배달 완료","동일 요소","매우 가까움","기타",false);
    }
    @Test public void threeComponentsMatchingTotalAreStrong(){
        AmountAnalyzer.Result a=AmountAnalyzer.inspect("배달 완료 3,346원 기본수수료 2,700원 추가수수료 210원 리워드 436원");
        IncomePrototypeClassifier.Decision d=IncomePrototypeClassifier.classify(a,
            Arrays.asList(fee("기본수수료",2700),fee("추가수수료",210),fee("리워드",436),done(3346)));
        assertEquals("STRONG",d.level);assertEquals(3346,d.amount);
    }
    @Test public void twoComponentsMatchingTotalAreStrong(){
        AmountAnalyzer.Result a=AmountAnalyzer.inspect("배달 완료 3,105원 기본수수료 2,700원 리워드 405원");
        IncomePrototypeClassifier.Decision d=IncomePrototypeClassifier.classify(a,
            Arrays.asList(fee("기본수수료",2700),fee("리워드",405),done(3105)));
        assertEquals("STRONG",d.level);assertEquals(3105,d.amount);
    }
    @Test public void distant14900IsNeverCaptured(){
        AmountAnalyzer.Result a=AmountAnalyzer.inspect("배달 완료 14,900원");
        NodeContextProbe.Entry far=new NodeContextProbe.Entry(14900,"금액","형제·자식","멀리 떨어짐","기타",false);
        assertEquals("IGNORE",IncomePrototypeClassifier.classify(a,Collections.singletonList(far)).level);
    }
    @Test public void ordinaryRewardDisplayIsNotCompletion(){
        AmountAnalyzer.Result a=AmountAnalyzer.inspect("리워드 600원 기본수수료 2700원");
        assertEquals("IGNORE",IncomePrototypeClassifier.classify(a,
            Arrays.asList(fee("기본수수료",2700),fee("리워드",600),done(3300))).level);
    }
    @Test public void componentSumWithoutCompletedTotalOnlyReview(){
        AmountAnalyzer.Result a=AmountAnalyzer.inspect("배달 완료 3,105원 기본수수료 2,700원 리워드 405원");
        assertEquals("REVIEW",IncomePrototypeClassifier.classify(a,
            Arrays.asList(fee("기본수수료",2700),fee("리워드",405))).level);
    }
    @Test public void conflictingComponentLabelsCannotBeStrong(){
        AmountAnalyzer.Result a=AmountAnalyzer.inspect("배달 완료 3,105원 기본수수료 2,700원 리워드 405원");
        assertNotEquals("STRONG",IncomePrototypeClassifier.classify(a,
            Arrays.asList(fee("기본수수료",2700),fee("기본수수료",2600),fee("리워드",405),done(3105))).level);
    }
    @Test public void totalWithoutComponentsMustBeReviewed(){
        AmountAnalyzer.Result a=AmountAnalyzer.inspect("배달 완료 3,105원");
        assertEquals("REVIEW",IncomePrototypeClassifier.classify(a,
            Collections.singletonList(done(3105))).level);
    }
}
