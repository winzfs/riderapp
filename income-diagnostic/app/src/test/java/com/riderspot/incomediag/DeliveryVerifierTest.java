package com.riderspot.incomediag;

import org.junit.Test;
import java.util.Arrays;
import java.util.Collections;
import static org.junit.Assert.*;

public class DeliveryVerifierTest {
    @Test public void exactAutomaticMatch(){
        DeliveryVerifier.Verdict v=DeliveryVerifier.classify(7307,
            Arrays.asList(7307),Arrays.asList("7,307원 (라벨 없음) · 3,280원 (라벨 없음)"));
        assertEquals("자동 후보 일치",v.status);
        assertEquals(7307,v.predicted);
        assertTrue(v.visible);
    }
    @Test public void detectedButNotSelected(){
        DeliveryVerifier.Verdict v=DeliveryVerifier.classify(7307,
            Collections.emptyList(),Arrays.asList("7,307원 (라벨 없음) · 17,800원 (라벨 없음)"));
        assertEquals("금액 감지·자동 미인식",v.status);
        assertEquals(0,v.predicted);
    }
    @Test public void wrongSelectedAmount(){
        DeliveryVerifier.Verdict v=DeliveryVerifier.classify(3697,
            Arrays.asList(48000),Arrays.asList("48,000원 (라벨 없음)"));
        assertEquals("자동 후보 오인식",v.status);
        assertEquals(48000,v.predicted);
        assertFalse(v.visible);
    }
    @Test public void twoCompetingAutoCandidates(){
        DeliveryVerifier.Verdict v=DeliveryVerifier.classify(7307,
            Arrays.asList(7307,17800),Arrays.asList("7,307원 (라벨 없음)"));
        assertEquals("자동 후보 충돌",v.status);
        assertEquals(0,v.predicted);
    }
    @Test public void noDetection(){
        DeliveryVerifier.Verdict v=DeliveryVerifier.classify(5000,
            Collections.emptyList(),Collections.emptyList());
        assertEquals("금액 미탐지",v.status);
        assertEquals(0,v.candidateScreens);
    }
    @Test public void rejectSubstringFalseMatch(){
        DeliveryVerifier.Verdict v=DeliveryVerifier.classify(307,
            Collections.emptyList(),Arrays.asList("7,307원 (라벨 없음)"));
        assertFalse(v.visible);
    }
}
