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

    @Test public void freezeAfterFourStillSeconds() {
        assertFalse(StreamRecovery.frozen(3));
        assertTrue(StreamRecovery.frozen(4));
    }

    @Test public void liveDriftOver30sJumpsBack() {
        assertFalse(StreamRecovery.drifted(20000));
        assertTrue(StreamRecovery.drifted(31000));
    }

    @Test public void rememberedFormatGoesFirst() {
        String[] u = {"a.ts", "a.m3u8", "a"};
        assertArrayEquals(new String[]{"a.m3u8", "a.ts", "a"}, StreamRecovery.preferFormat(u, "m3u8"));
        assertArrayEquals(u, StreamRecovery.preferFormat(u, null));
        assertEquals("m3u8", StreamRecovery.otherFormat("x.ts"));
        assertEquals("ts", StreamRecovery.otherFormat("x.m3u8"));
    }
}
