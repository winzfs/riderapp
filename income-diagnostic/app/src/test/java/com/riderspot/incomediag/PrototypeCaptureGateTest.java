package com.riderspot.incomediag;

import org.junit.Test;
import static org.junit.Assert.*;

public class PrototypeCaptureGateTest {
    @Test public void repeatedCompleteScreensAreOneEpisode(){
        PrototypeCaptureGate gate=new PrototypeCaptureGate();
        assertTrue(gate.armed());
        gate.observe(true,1000);
        gate.markCaptured();
        gate.observe(true,5000);
        assertFalse(gate.armed());
        gate.observe(false,6000);
        gate.observe(true,6500);
        assertFalse(gate.armed());
    }
    @Test public void newStableNonCompleteEpisodeRearms(){
        PrototypeCaptureGate gate=new PrototypeCaptureGate();
        gate.markCaptured();
        gate.observe(false,10000);
        gate.observe(false,13000);
        assertFalse(gate.armed());
        gate.observe(false,16000);
        assertTrue(gate.armed());
    }
}
