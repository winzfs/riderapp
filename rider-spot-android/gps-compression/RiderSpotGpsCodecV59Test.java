package com.riderspot.android;

import org.junit.Test;
import static org.junit.Assert.*;
import java.io.IOException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;

public final class RiderSpotGpsCodecV59Test {
    private static RiderSpotGpsCodecV59.Fix fix(long seq,long t,
        double lat,double lng,double accuracy,double heading,double speed) {
        return new RiderSpotGpsCodecV59.Fix(seq,t,lat,lng,accuracy,heading,speed);
    }
    private static void identical(List<RiderSpotGpsCodecV59.Fix> original) throws Exception {
        RiderSpotGpsCodecV59.Packed packed=RiderSpotGpsCodecV59.encode(original);
        List<RiderSpotGpsCodecV59.Fix> restored=
            RiderSpotGpsCodecV59.decode(packed.zstd,packed.rawLength,packed.sha256);
        assertEquals(original.size(),restored.size());
        for(int i=0;i<original.size();i++)
            assertTrue("GPS coordinate/timestamp bit mismatch at "+i,
                original.get(i).sameBits(restored.get(i)));
        assertEquals(original.get(0).seq,packed.firstSeq);
        assertEquals(original.get(original.size()-1).seq,packed.lastSeq);
        System.out.println("V59 GPS lossless: "+original.size()+
            " points, encoded="+packed.rawLength+"B, zstd="+packed.zstd.length+"B");
    }
    @Test public void exactBitwiseRoundtripWithUnsortedTimestampsAndRepeatedMilliseconds()
        throws Exception {
        List<RiderSpotGpsCodecV59.Fix> fixes=new ArrayList<>();
        long start=Instant.parse("2026-11-23T14:55:00Z").toEpochMilli();
        Random r=new Random(59L);
        double lat=35.17000000000001,lng=126.84200000000001;
        for(int i=0;i<512;i++){
            lat+=r.nextGaussian()*0.000013;
            lng+=r.nextGaussian()*0.000023;
            long ts=start+(i*2000L)+(i%19==0?-4000:0);
            if(i==12)ts=start+22_000L; // exact timestamp duplicates
            if(i==13)ts=start+22_000L;
            fixes.add(fix(i*3L+1,ts,lat,lng,2.71828+(i%3)*0.000001,
                (i*0.0333333)%360,10.7+(i%6)*0.000001));
        }
        identical(fixes);
    }
    @Test public void edgeCaseDoublesAndTimeGapsAreRetained() throws Exception {
        long a=Instant.parse("2026-11-23T14:59:59Z").toEpochMilli();
        List<RiderSpotGpsCodecV59.Fix> fixes=List.of(
            fix(1,a,35.123456789012345,126.12345678901234,-0.0,359.99999,0.0),
            fix(2,a,35.123456789012346,126.12345678901235,0.0,359.99999,-0.0),
            fix(500,a+60_000,Math.nextUp(35.123456789012345),
                Math.nextDown(126.12345678901234),13.0,0.0,999.0),
            fix(501,a-40_000,35.0,126.0,0.0,45.0,1.0)
        );
        identical(fixes);
    }
    @Test public void singlePointAndPartialBlocks() throws Exception {
        identical(List.of(fix(9812444,1700000000000L,35.1,126.1,0.0,0.0,0.0)));
        List<RiderSpotGpsCodecV59.Fix> fixes=new ArrayList<>();
        for(int i=0;i<113;i++)
            fixes.add(fix(1L+i,1700000000000L+i*1000,35.0+i/1000000d,
                126.0,5.0,180.0,8.0));
        identical(fixes);
    }
    @Test public void rejectCorruptDataAndWrongDigests() throws Exception {
        var p=RiderSpotGpsCodecV59.encode(List.of(
            fix(15,1700000000000L,35.0,126.0,1.2,3.0,4.0)));
        byte[] wrong=p.sha256.clone();
        wrong[0]^=1;
        try{RiderSpotGpsCodecV59.decode(p.zstd,p.rawLength,wrong);fail("bad digest accepted");}
        catch(IOException expected){assertTrue(expected.getMessage().contains("checksum"));}
        byte[] bad=p.zstd.clone();
        bad[bad.length/2]^=7;
        try{RiderSpotGpsCodecV59.decode(bad,p.rawLength,p.sha256);fail("corrupt frame accepted");}
        catch(IOException expected){/* expected */}
    }
    @Test public void repeatedTimesAndStopHeartbeatAreNotDeduplicated() throws Exception {
        List<RiderSpotGpsCodecV59.Fix> fixes=new ArrayList<>();
        long start=Instant.parse("2026-11-23T22:55:00Z").toEpochMilli();
        for(int i=0;i<512;i++) {
            long t=start+Math.floorDiv(i,2)*10000L;
            fixes.add(fix(15000L+i,t,35.22+(i%2)*0.00000001,
                126.82,3.0,0.0,0.0));
        }
        identical(fixes);
    }
}
