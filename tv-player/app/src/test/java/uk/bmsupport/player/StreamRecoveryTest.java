package uk.bmsupport.player;

import static org.junit.Assert.*;

import org.junit.Test;

public class StreamRecoveryTest {
    @Test public void daznSteadyProfileAndUnicodeNames() {
        assertTrue(StreamRecovery.isDazn("ᴰᴬᶻᴺ ¹ 18 (CA | Main)"));
        assertFalse(StreamRecovery.isDazn("19 | BKFC 96"));
        assertArrayEquals(new int[]{40000,90000,3000,6000}, StreamRecovery.bufferMs("small", "DAZN CA 19"));
        assertEquals(30000, StreamRecovery.liveTargetMs("DAZN CA 19"));
        assertFalse(StreamRecovery.drifted(31000, "DAZN CA 19"));
        assertTrue(StreamRecovery.drifted(61000, "DAZN CA 19"));
    }
    @Test public void coupangGetsTheSameSteadyProfileAsDazn() {
        assertTrue(StreamRecovery.isCoupang("Coupang Play 1"));
        assertTrue(StreamRecovery.isCoupang("COUPANG PLAY 05"));
        assertFalse(StreamRecovery.isCoupang("BBC One"));
        assertArrayEquals(new int[]{40000,90000,3000,6000}, StreamRecovery.bufferMs("small", "Coupang Play 3"));
        assertEquals(30000, StreamRecovery.liveTargetMs("Coupang Play 3"));
        assertEquals(6000, StreamRecovery.stallReconnectMs("Coupang Play 3"));
        assertEquals(3, StreamRecovery.formatSwapStalls("Coupang Play 3"));
        assertFalse(StreamRecovery.drifted(31000, "Coupang Play 3"));
        assertTrue(StreamRecovery.drifted(61000, "Coupang Play 3"));
        assertEquals("coupang", StreamRecovery.providerTag("Coupang Play 3"));
        assertEquals("dazn", StreamRecovery.providerTag("DAZN CA 19"));
        assertNull(StreamRecovery.providerTag("BBC One"));
    }
    @Test public void daznRecoversAfterSixSecondsAndFirstStall() {
        assertEquals(6000, StreamRecovery.stallReconnectMs("DAZN CA 19"));
        assertEquals(3, StreamRecovery.formatSwapStalls("DAZN CA 19"));
        assertEquals(12000, StreamRecovery.stallReconnectMs("Sky Sports"));
        assertEquals(3, StreamRecovery.formatSwapStalls("Sky Sports"));
        assertArrayEquals(StreamRecovery.bufferMs("normal"), StreamRecovery.bufferMs("normal", "BBC One"));
    }
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

    @org.junit.Test public void skyStartsOnHlsUnlessLearned() {
        org.junit.Assert.assertEquals("m3u8", StreamRecovery.startFormat(null, "Sky Sports News | NowTV |"));
        org.junit.Assert.assertNull(StreamRecovery.startFormat(null, "BBC One"));
        org.junit.Assert.assertEquals("ts", StreamRecovery.startFormat("ts", "Sky Sports Main Event"));
    }
    @org.junit.Test public void advertSwitchWithinFourSeconds() {
        org.junit.Assert.assertTrue(StreamRecovery.advertSwitch(1500));
        org.junit.Assert.assertFalse(StreamRecovery.advertSwitch(9000));
    }
}
