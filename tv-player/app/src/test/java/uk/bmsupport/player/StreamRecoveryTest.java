package uk.bmsupport.player;

import static org.junit.Assert.*;

import org.junit.Test;

public class StreamRecoveryTest {
    @Test public void smoothIsDefaultAndBiggerThanNormal() {
        assertEquals("smooth", StreamRecovery.DEFAULT_BUFFER);
        assertEquals(30000, StreamRecovery.bufferMs(null)[0]);
        assertEquals(60000, StreamRecovery.bufferMs("smooth")[1]);
        assertTrue(StreamRecovery.bufferMs("smooth")[1] > StreamRecovery.bufferMs("normal")[1]);
    }

    @Test public void backoffDoublesAndGivesUpAfterEight() {
        assertEquals(1000, StreamRecovery.backoffMs(1));
        assertEquals(2000, StreamRecovery.backoffMs(2));
        assertEquals(4000, StreamRecovery.backoffMs(3));
        assertEquals(10000, StreamRecovery.backoffMs(7));
        assertFalse(StreamRecovery.giveUp(8));
        assertTrue(StreamRecovery.giveUp(9));
    }

    @Test public void stallsOutsideTwoMinutesDontCount() {
        long[] t = {0, 100000, 150000};
        assertEquals(2, StreamRecovery.recentStalls(t, 3, 200000));
    }

    @Test public void qualityCapDropsTo60Percent() {
        assertEquals(3000000, StreamRecovery.lowerCap(5000000));
        assertEquals(300000, StreamRecovery.lowerCap(400000));
    }

    @Test public void hdNamesDetected() {
        assertTrue(StreamRecovery.isHdName("Sky Sports Main Event FHD"));
        assertTrue(StreamRecovery.isHdName("BBC One HD"));
        assertFalse(StreamRecovery.isHdName("BBC One"));
        assertFalse(StreamRecovery.isHdName("Shadow TV"));
    }
}
