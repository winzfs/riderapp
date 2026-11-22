package com.riderspot.incomediag;

import org.junit.Test;
import static org.junit.Assert.*;

public class AmountAnalyzerTest {
    @Test public void composite7307(){
        assertEquals(7307,AmountAnalyzer.inspect("배달 완료 7,307원 3,280원 3,074원 953원").uniqueCompositeTotal());
    }
    @Test public void isolated17800Uncertain(){
        assertEquals(0,AmountAnalyzer.inspect("배달 완료 17,800원").uniqueCompositeTotal());
    }
    @Test public void isolated48000Uncertain(){
        assertEquals(0,AmountAnalyzer.inspect("배달 완료 48,000원").uniqueCompositeTotal());
    }
    @Test public void incompleteSum(){
        assertEquals(0,AmountAnalyzer.inspect("배달 완료 7,307원 3,280원 3,074원").uniqueCompositeTotal());
    }
    @Test public void deliveryFeeInCompletionScreen(){
        AmountAnalyzer.Result x=AmountAnalyzer.inspect("배달 완료 배달료 3,697원");
        assertTrue(x.completed);
        assertEquals(1,x.amounts.size());
        assertNotNull(x.uniqueDirect());
        assertEquals(3697,x.uniqueDirect().amount);
    }
    @Test public void differentTotalIsNotAcceptedAsFee(){
        AmountAnalyzer.Result x=AmountAnalyzer.inspect("배달 완료 이번주 총 수익 48,000원");
        assertTrue(x.completed);
        assertEquals(1,x.amounts.size());
        assertEquals("합계·미션 인접",x.amounts.get(0).category);
        assertNull(x.uniqueDirect());
    }
    @Test public void twoNumbersRequireManualReview(){
        AmountAnalyzer.Result x=AmountAnalyzer.inspect("배달 완료 48,000원 3,697원");
        assertTrue(x.completed);
        assertEquals(2,x.amounts.size());
        assertNull(x.uniqueDirect());
    }
    @Test public void noWonWithFeeLabelIsCaptured(){
        AmountAnalyzer.Result x=AmountAnalyzer.inspect("배달 완료 배달료 3,697");
        assertEquals(1,x.amounts.size());
        assertEquals(3697,x.amounts.get(0).amount);
    }
    @Test public void unlabeledNumberIsNotClaimedAsMoney(){
        AmountAnalyzer.Result x=AmountAnalyzer.inspect("배달 완료 주문 번호 3697");
        assertEquals(0,x.amounts.size());
    }
    @Test public void withoutCompletionNotADelivery(){
        AmountAnalyzer.Result x=AmountAnalyzer.inspect("오늘 수익 48,000원");
        assertFalse(x.completed);
    }
}
