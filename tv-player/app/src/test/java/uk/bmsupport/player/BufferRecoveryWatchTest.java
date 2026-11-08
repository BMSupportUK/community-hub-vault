package uk.bmsupport.player;
import org.junit.Test;
import static org.junit.Assert.*;
public class BufferRecoveryWatchTest {
    @Test public void accumulatingBufferIsNotDiscardedAtSixSeconds() {
        BufferRecoveryWatch w = new BufferRecoveryWatch();
        for (int t=0;t<=20000;t+=1000) assertFalse(w.retry(t,t,6000,true,true));
    }
    @Test public void eachReopenedConnectionHasItsOwnBoundedWatch() {
        BufferRecoveryWatch w = new BufferRecoveryWatch();
        assertFalse(w.retry(0,0,6000,true,true));
        assertTrue(w.retry(6000,0,6000,true,true));
        w.reset();
        assertFalse(w.retry(7000,0,6000,true,true));
        assertTrue(w.retry(13000,0,6000,true,true));
    }
    @Test public void pauseAndResumedPlaybackDoNotCauseRetries() {
        BufferRecoveryWatch w = new BufferRecoveryWatch();
        assertFalse(w.retry(0,0,6000,true,true));
        assertFalse(w.retry(9000,0,6000,true,false));
        assertFalse(w.retry(10000,0,6000,false,true));
        assertFalse(w.retry(11000,0,6000,true,true));
    }
}