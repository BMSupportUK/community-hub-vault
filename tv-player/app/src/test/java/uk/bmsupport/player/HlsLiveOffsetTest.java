package uk.bmsupport.player;

import static org.junit.Assert.*;
import org.junit.Test;

public class HlsLiveOffsetTest {
    @Test public void hlsKeepsProviderHoldBack() {
        assertFalse(StreamRecovery.overrideLiveOffset("http://x/live/u/p/123.m3u8"));
        assertFalse(StreamRecovery.overrideLiveOffset("http://x/live/u/p/123.M3U8?token=1"));
        assertTrue(StreamRecovery.overrideLiveOffset("http://x/live/u/p/123.ts"));
    }
    @Test public void driftCountsFromProviderLivePoint() {
        // Provider holds back 30s: sitting there is normal, not drift.
        assertFalse(StreamRecovery.drifted(45000, 30000, "Sky Sports"));
        assertTrue(StreamRecovery.drifted(61000, 30000, "Sky Sports"));
        assertFalse(StreamRecovery.drifted(85000, 30000, "Coupang Play 3"));
        assertTrue(StreamRecovery.drifted(91000, 30000, "Coupang Play 3"));
    }
    @Test public void oneStallNoLongerFlipsFormat() {
        assertEquals(3, StreamRecovery.formatSwapStalls("Coupang Play 3"));
        assertEquals(3, StreamRecovery.formatSwapStalls("BBC One"));
    }
}
