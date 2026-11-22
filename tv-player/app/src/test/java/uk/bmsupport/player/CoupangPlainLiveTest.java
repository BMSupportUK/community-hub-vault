package uk.bmsupport.player;

import static org.junit.Assert.*;
import org.junit.Test;

public class CoupangPlainLiveTest {
    @Test public void coupangNeverJumpsToLive() { assertFalse(StreamRecovery.drifted(500000, 30000, "Coupang Play 3")); }
    @Test public void otherChannelsStillJump() { assertTrue(StreamRecovery.drifted(91000, 30000, "DAZN 1")); }
    @Test public void coupangHasNoSpeedEasing() { assertNull(StreamRecovery.hlsLiveSpeeds("http://x/a.m3u8", "Coupang Play 3")); assertNotNull(StreamRecovery.hlsLiveSpeeds("http://x/a.m3u8", "Sky Sports")); }
    @Test public void coupangWaitsFifteenSecondsBeforeFreeze() {
        assertFalse(StreamRecovery.frozen(14, "Coupang Play 3")); assertTrue(StreamRecovery.frozen(15, "Coupang Play 3")); assertTrue(StreamRecovery.frozen(4, "Sky Sports"));
    }
    @Test public void coupangVlcWaitsThirtySeconds() {
        LiveRideThrough r = new LiveRideThrough(); r.channel("Coupang Play 3");
        r.frozen(10, 10, 0); r.frozen(10, 20, 1000); assertFalse(r.frozen(10, 30, 20000)); assertTrue(r.frozen(10, 40, 31000));
    }
}
