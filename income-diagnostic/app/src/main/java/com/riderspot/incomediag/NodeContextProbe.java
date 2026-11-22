package com.riderspot.incomediag;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Privacy-preserving UI-tree diagnostics.
 * A Record contains numbers, approved label tokens and tree geometry only.
 * Raw accessibility text and resource ID values are NEVER retained.
 */
final class NodeContextProbe {
    private static final Pattern WON=Pattern.compile("(?<![\\d,])(?:\\d{1,3}(?:,\\d{3})+|\\d{3,6})\\s*원");
    // Specific concepts first. All exported labels are fixed strings, never user content.
    private static final String[] LABELS={
        "총 배달료","총배달료","기본 배달료","기본배달료","추가 배달료","추가배달료",
        "배달 완료","배달완료","배달료","배달 요금","배달요금","기본료",
        "할증료","할증","추가 요금","추가요금","추가금","수수료","라이더 수익",
        "이번 배달","이번배달","금액","배달 수익","배달수익","팁",
        "프로모션","미션","보너스","이벤트","정산금","정산",
        "누적 수익","누적수익","총 수익","총수익","오늘 수익","오늘수익","합계","총액"
    };
    static final class Record {
        final int parent,x,y;
        final boolean hasId;
        final String role,label;
        final List<Integer> amounts;
        Record(int parent,int x,int y,boolean hasId,String role,String label,List<Integer> amounts){
            this.parent=parent;this.x=x;this.y=y;this.hasId=hasId;
            this.role=role;this.label=label;this.amounts=amounts;
        }
    }
    static final class Entry {
        final int amount;
        final String label,relation,proximity,role;
        final boolean hasId;
        Entry(int amount,String label,String relation,String proximity,String role,boolean hasId){
            this.amount=amount;this.label=label;this.relation=relation;
            this.proximity=proximity;this.role=role;this.hasId=hasId;
        }
        String diagnostic(){
            return String.format(Locale.KOREA,"%,d원 · 문구:%s · 관계:%s · 거리:%s · 요소:%s · ID:%s",
                amount,label,relation,proximity,role,hasId?"있음":"없음");
        }
    }
    private final List<Record> nodes=new ArrayList<>();

    int add(int parent,int x,int y,CharSequence text,CharSequence description,
            String resourceId,CharSequence className){
        String t=text==null?"":text.toString();
        String d=description==null?"":description.toString();
        // No raw t, d, resourceId or class name is stored in Record.
        String label=approvedLabel(t);
        if(label.isEmpty())label=approvedLabel(d);
        LinkedHashSet<Integer> money=new LinkedHashSet<>();
        collectMoney(t,money);
        collectMoney(d,money);
        String classType=approvedRole(className);
        Record record=new Record(parent,x,y,resourceId!=null&&!resourceId.isEmpty(),
                classType,label,new ArrayList<>(money));
        nodes.add(record);
        return nodes.size()-1;
    }
    int count(){return nodes.size();}
    List<Entry> describe(){
        List<Entry> entries=new ArrayList<>();
        for(int i=0;i<nodes.size()&&entries.size()<16;i++){
            Record money=nodes.get(i);
            for(int amount:money.amounts){
                if(entries.size()>=16)break;
                int best=-1,score=Integer.MAX_VALUE;
                for(int j=0;j<nodes.size();j++){
                    Record label=nodes.get(j);
                    if(label.label.isEmpty())continue;
                    int distance=Math.abs(money.x-label.x)+Math.abs(money.y-label.y);
                    int rel=relationRank(i,j);
                    if(rel>=3&&distance>650)continue;
                    int preference="배달 완료".equals(label.label)||"배달완료".equals(label.label)?180:0;
                    int candidate=rel*1400+Math.min(650,distance)+preference;
                    if(candidate<score){score=candidate;best=j;}
                }
                String relation=best<0?"미확인":relationName(i,best);
                String label=best<0?"탐지 안 됨":nodes.get(best).label;
                String proximity=best<0?"미확인":distanceName(money,nodes.get(best));
                entries.add(new Entry(amount,label,relation,proximity,money.role,money.hasId));
            }
        }
        return entries;
    }
    private int relationRank(int i,int j){
        if(i==j)return 0;
        Record a=nodes.get(i),b=nodes.get(j);
        if(a.parent>=0&&a.parent==j)return 1;
        if(a.parent>=0&&a.parent==b.parent)return 2;
        if(b.parent>=0&&b.parent==i)return 2;
        if(a.parent>=0&&b.parent>=0){
            int ap=nodes.get(a.parent).parent;
            int bp=nodes.get(b.parent).parent;
            if(ap>=0&&ap==bp)return 3;
            if(ap>=0&&ap==j)return 3;
            if(bp>=0&&bp==i)return 3;
        }
        return 4;
    }
    private String relationName(int i,int j){
        int rank=relationRank(i,j);
        if(rank==0)return "동일 요소";
        if(rank==1)return "부모 요소";
        if(rank==2)return "형제·자식";
        if(rank==3)return "인접 그룹";
        return "화면 근처";
    }
    private static String distanceName(Record a,Record b){
        int dx=Math.abs(a.x-b.x),dy=Math.abs(a.y-b.y);
        int d=dx+dy;
        if(d<70)return "매우 가까움";
        if(d<240)return "가까움";
        if(d<550)return "중간";
        return "멀리 떨어짐";
    }
    private static void collectMoney(String raw,LinkedHashSet<Integer> out){
        Matcher m=WON.matcher(raw);
        while(m.find()&&out.size()<4){
            try{
                String digits=m.group().replaceAll("[^0-9]","");
                int n=Integer.parseInt(digits);
                if(n>=500&&n<=150000)out.add(n);
            }catch(NumberFormatException ignored){}
        }
    }
    private static String approvedLabel(String raw){
        if(raw==null||raw.isEmpty())return "";
        // Exclude long free-form strings such as addresses or instructions.
        if(raw.length()>80)return "";
        for(String term:LABELS){
            if(raw.contains(term)){
                if(term.equals("배달완료"))return "배달 완료";
                if(term.equals("총배달료"))return "총 배달료";
                if(term.equals("기본배달료"))return "기본 배달료";
                if(term.equals("추가배달료"))return "추가 배달료";
                if(term.equals("배달요금"))return "배달 요금";
                if(term.equals("할증료"))return "할증료";
                if(term.equals("이번배달"))return "이번 배달";
                if(term.equals("배달수익"))return "배달 수익";
                if(term.equals("누적수익"))return "누적 수익";
                if(term.equals("총수익"))return "총 수익";
                if(term.equals("오늘수익"))return "오늘 수익";
                return term;
            }
        }
        return "";
    }
    private static String approvedRole(CharSequence raw){
        if(raw==null)return "기타";
        String s=raw.toString();
        if(s.endsWith("TextView"))return "텍스트";
        if(s.endsWith("Button"))return "버튼";
        if(s.endsWith("ImageView"))return "이미지";
        if(s.contains("Layout")||s.endsWith("ViewGroup"))return "그룹";
        return "기타";
    }
}
