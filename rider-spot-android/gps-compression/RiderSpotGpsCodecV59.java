package com.riderspot.android;

import com.github.luben.zstd.Zstd;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * v59: bit-exact GPS archive. Sequence and timestamps are lossless delta-coded;
 * six REAL fields are XOR encoded using their original IEEE-754 bits.
 * Each independently indexed block is then compressed with Zstandard.
 * NEVER round coordinates or simplify points in this archival codec.
 */
public final class RiderSpotGpsCodecV59 {
    public static final int VERSION = 1;
    public static final int BLOCK_POINTS = 512;
    public static final int MAX_RAW_BYTES = 256 * 1024;
    public static final int ZSTD_LEVEL = 17;
    private static final int MAGIC = 0x52534731; // RSG1
    private RiderSpotGpsCodecV59() {}

    public static final class Fix {
        public final long seq, time;
        public final double lat, lng, accuracy, heading, speed;
        public Fix(long seq, long time, double lat, double lng,
                   double accuracy, double heading, double speed) {
            this.seq=seq; this.time=time; this.lat=lat; this.lng=lng;
            this.accuracy=accuracy; this.heading=heading; this.speed=speed;
        }
        public boolean sameBits(Fix other) {
            if(other==null)return false;
            return seq==other.seq && time==other.time &&
                Double.doubleToRawLongBits(lat)==Double.doubleToRawLongBits(other.lat) &&
                Double.doubleToRawLongBits(lng)==Double.doubleToRawLongBits(other.lng) &&
                Double.doubleToRawLongBits(accuracy)==Double.doubleToRawLongBits(other.accuracy) &&
                Double.doubleToRawLongBits(heading)==Double.doubleToRawLongBits(other.heading) &&
                Double.doubleToRawLongBits(speed)==Double.doubleToRawLongBits(other.speed);
        }
    }

    public static final class Packed {
        public final byte[] zstd, sha256;
        public final int rawLength, count;
        public final long firstSeq, lastSeq, minTime, maxTime;
        Packed(byte[] zstd, byte[] sha256, int rawLength, int count,
               long firstSeq, long lastSeq, long minTime, long maxTime) {
            this.zstd=zstd; this.sha256=sha256; this.rawLength=rawLength;
            this.count=count; this.firstSeq=firstSeq; this.lastSeq=lastSeq;
            this.minTime=minTime; this.maxTime=maxTime;
        }
    }

    private static void uint(DataOutputStream out, long value) throws IOException {
        while ((value & ~127L) != 0) {
            out.writeByte((int)(value & 127L) | 128);
            value >>>= 7;
        }
        out.writeByte((int)value);
    }
    private static long readUint(DataInputStream in) throws IOException {
        long result=0;
        for(int i=0;i<10;i++){
            int b=in.readUnsignedByte();
            if(i==9 && (b&0xfe)!=0) throw new IOException("Invalid 64-bit varint");
            result|=((long)(b&127))<<(i*7);
            if((b&128)==0)return result;
        }
        throw new IOException("Unterminated varint");
    }
    private static long zig(long v) { return (v<<1) ^ (v>>63); }
    private static long unzig(long v) { return (v>>>1) ^ -(v&1); }
    private static byte[] hash(byte[] raw) throws IOException {
        try { return MessageDigest.getInstance("SHA-256").digest(raw); }
        catch(NoSuchAlgorithmException e){throw new IOException(e);}
    }
    private static void value(DataOutputStream out,double number,long[] prev,int index)
        throws IOException {
        long bits=Double.doubleToRawLongBits(number);
        uint(out,bits^prev[index]);
        prev[index]=bits;
    }
    private static double readValue(DataInputStream in,long[] prev,int index)
        throws IOException {
        prev[index]^=readUint(in);
        return Double.longBitsToDouble(prev[index]);
    }

    public static Packed encode(List<Fix> fixes) throws IOException {
        if(fixes==null || fixes.isEmpty() || fixes.size()>BLOCK_POINTS)
            throw new IOException("Invalid archive block size");
        ByteArrayOutputStream b=new ByteArrayOutputStream(fixes.size()*30);
        DataOutputStream out=new DataOutputStream(b);
        out.writeInt(MAGIC);
        out.writeInt(VERSION);
        out.writeInt(fixes.size());
        long prevSeq=0, prevTime=0, prevTimeDelta=0;
        long[] prev=new long[5];
        long minTime=Long.MAX_VALUE,maxTime=Long.MIN_VALUE;
        for(Fix p:fixes){
            if(p.seq<=prevSeq || p.seq<1 || p.time<1)
                throw new IOException("Non-increasing sequence or invalid timestamp");
            uint(out,p.seq-prevSeq);
            long delta=p.time-prevTime;
            uint(out,zig(delta-prevTimeDelta));
            prevSeq=p.seq;
            prevTime=p.time;
            prevTimeDelta=delta;
            value(out,p.lat,prev,0);
            value(out,p.lng,prev,1);
            value(out,p.accuracy,prev,2);
            value(out,p.heading,prev,3);
            value(out,p.speed,prev,4);
            minTime=Math.min(minTime,p.time);
            maxTime=Math.max(maxTime,p.time);
        }
        out.flush();
        byte[] raw=b.toByteArray();
        if(raw.length>MAX_RAW_BYTES)throw new IOException("Oversized uncompressed block");
        byte[] compressed=Zstd.compress(raw,ZSTD_LEVEL);
        if(compressed==null || compressed.length==0)
            throw new IOException("Zstandard compression failed");
        return new Packed(compressed,hash(raw),raw.length,fixes.size(),
            fixes.get(0).seq,fixes.get(fixes.size()-1).seq,minTime,maxTime);
    }

    public static List<Fix> decode(byte[] compressed,int rawLength,byte[] expectedSha)
        throws IOException {
        if(compressed==null || compressed.length==0 ||
           rawLength<12 || rawLength>MAX_RAW_BYTES ||
           expectedSha==null || expectedSha.length!=32)
            throw new IOException("Invalid compressed GPS block metadata");
        byte[] raw;
        try{raw=Zstd.decompress(compressed,rawLength);}
        catch(RuntimeException|LinkageError e){throw new IOException("Cannot decompress GPS",e);}
        if(raw==null || raw.length!=rawLength ||
           !MessageDigest.isEqual(hash(raw),expectedSha))
            throw new IOException("GPS block checksum mismatch");
        DataInputStream in=new DataInputStream(new ByteArrayInputStream(raw));
        if(in.readInt()!=MAGIC || in.readInt()!=VERSION)
            throw new IOException("Unknown GPS archive format");
        int count=in.readInt();
        if(count<1 || count>BLOCK_POINTS)
            throw new IOException("Invalid GPS archive point count");
        List<Fix> result=new ArrayList<>(count);
        long prevSeq=0,prevTime=0,prevTimeDelta=0;
        long[] prev=new long[5];
        for(int i=0;i<count;i++){
            long seqDelta=readUint(in);
            long seq=prevSeq+seqDelta;
            long delta=prevTimeDelta+unzig(readUint(in));
            long time=prevTime+delta;
            if(seqDelta<=0 || seq<=prevSeq || time<=0)
                throw new IOException("Corrupt GPS archive index");
            result.add(new Fix(seq,time,
                readValue(in,prev,0),readValue(in,prev,1),
                readValue(in,prev,2),readValue(in,prev,3),readValue(in,prev,4)));
            prevSeq=seq;
            prevTime=time;
            prevTimeDelta=delta;
        }
        if(in.available()!=0)throw new IOException("GPS block trailing bytes");
        return result;
    }
}
