package com.riderspot.incomediag;

import org.junit.Test;
import java.util.List;
import static org.junit.Assert.*;

public class FeeComponentParserTest {
    @Test public void threeFeeLabelsWithSpacesAndTinyReward(){
        List<FeeComponentParser.Item> out=FeeComponentParser.extract(
            "기본 수수료 2,700원\n추가 수수료 405원\n리워드 0원");
        assertEquals(3,out.size());
        assertEquals("기본수수료",out.get(0).label);
        assertEquals(2700,out.get(0).amount);
        assertEquals("추가수수료",out.get(1).label);
        assertEquals(405,out.get(1).amount);
        assertEquals("리워드",out.get(2).label);
        assertEquals(0,out.get(2).amount);
    }
    @Test public void unknownTextOrOrderNumberNeverLeaks(){
        List<FeeComponentParser.Item> out=FeeComponentParser.extract(
            "고객 이름 김철수 주문번호 1234 서울시 강남구 20 3,105원");
        assertTrue(out.isEmpty());
    }
    @Test public void generalCompletionTotalIsNotAComponent(){
        List<FeeComponentParser.Item> out=FeeComponentParser.extract(
            "배달 완료 3,105원 기본수수료 2,700원 추가수수료 405원");
        assertEquals(2,out.size());
        assertEquals(2700,out.get(0).amount);
        assertEquals(405,out.get(1).amount);
    }
    @Test public void containsSpecialWhitespace(){
        List<FeeComponentParser.Item> out=FeeComponentParser.extract(
            "추가\n 수수료：\u00a0405원 / 리\u200b워드\u00a00원");
        assertEquals(2,out.size());
        assertEquals(405,out.get(0).amount);
    }
    @Test public void noNextAmountCannotBeInvented(){
        assertTrue(FeeComponentParser.extract("추가수수료 없음").isEmpty());
    }
}
