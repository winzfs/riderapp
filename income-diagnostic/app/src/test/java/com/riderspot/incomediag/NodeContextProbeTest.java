package com.riderspot.incomediag;

import org.junit.Test;
import java.util.List;
import static org.junit.Assert.*;

public class NodeContextProbeTest {
    @Test public void sameParentAssociatesMoneyWithLabel(){
        NodeContextProbe p=new NodeContextProbe();
        int root=p.add(-1,300,200,"","",null,"android.widget.LinearLayout");
        p.add(root,100,400,"기본 배달료","",null,"android.widget.TextView");
        p.add(root,330,400,"3,280원","", "com.test:id/fee", "android.widget.TextView");
        List<NodeContextProbe.Entry> items=p.describe();
        assertEquals(1,items.size());
        assertEquals(3280,items.get(0).amount);
        assertEquals("기본 배달료",items.get(0).label);
        assertEquals("형제·자식",items.get(0).relation);
        assertTrue(items.get(0).hasId);
    }
    @Test public void exactSameNodeLabel(){
        NodeContextProbe p=new NodeContextProbe();
        p.add(-1,300,200,"총 배달료 7,307원","",null,"android.widget.TextView");
        assertEquals("총 배달료",p.describe().get(0).label);
        assertEquals("동일 요소",p.describe().get(0).relation);
    }
    @Test public void completelyUnrelatedSensitiveStringNotStored(){
        NodeContextProbe p=new NodeContextProbe();
        p.add(-1,500,200,"홍길동 서울시 강남구 테헤란로 12","",null,"android.widget.TextView");
        p.add(-1,700,300,"4,489원","",null,"android.widget.TextView");
        String item=p.describe().get(0).diagnostic();
        assertFalse(item.contains("홍길동"));
        assertFalse(item.contains("테헤란"));
        assertTrue(item.contains("탐지 안 됨"));
    }
    @Test public void nonWonNumbersNeverBecomeAmount(){
        NodeContextProbe p=new NodeContextProbe();
        p.add(-1,300,200,"배달 완료 주문번호 3074","",null,"android.widget.TextView");
        assertTrue(p.describe().isEmpty());
    }
    @Test public void labelWhitelistedAndResourceIdNotExported(){
        NodeContextProbe p=new NodeContextProbe();
        p.add(-1,200,100,"고객 김철수 수수료",null,"secret:customer-name-123","android.widget.TextView");
        p.add(-1,250,100,"624원","",null,"android.widget.TextView");
        String report=p.describe().get(0).diagnostic();
        assertFalse(report.contains("김철수"));
        assertFalse(report.contains("secret"));
        assertTrue(report.contains("수수료"));
    }
}
