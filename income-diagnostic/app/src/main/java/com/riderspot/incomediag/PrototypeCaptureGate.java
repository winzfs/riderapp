package com.riderspot.incomediag;

/** Per-service completion-episode gate. Amount equality alone cannot identify an order. */
final class PrototypeCaptureGate {
    private boolean latched;
    private long awaySince=-1;
    private int awayScreens;
    void observe(boolean completed,long elapsedMs){
        if(completed){
            awaySince=-1;awayScreens=0;return;
        }
        if(!latched)return;
        if(awaySince<0)awaySince=elapsedMs;
        awayScreens++;
        if(awayScreens>=3&&elapsedMs-awaySince>=6000L){
            latched=false;awaySince=-1;awayScreens=0;
        }
    }
    boolean armed(){return !latched;}
    void markCaptured(){latched=true;awaySince=-1;awayScreens=0;}
}
