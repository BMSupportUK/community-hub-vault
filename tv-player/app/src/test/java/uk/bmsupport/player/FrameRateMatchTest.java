package uk.bmsupport.player;

import static org.junit.Assert.assertEquals;
import org.junit.Test;

public class FrameRateMatchTest {
    private final float[] rates = {60f, 50f, 59.94f, 100f, 24f, 60f};
    private final int[] w = {1920, 1920, 1920, 1920, 1920, 3840};
    private final int[] h = {1080, 1080, 1080, 1080, 1080, 2160};

    @Test public void ukSportOn60HzSwitchesTo50() { assertEquals(1, FrameRateMatch.pick(50f, rates, w, h, 1920, 1080, 60f)); }
    @Test public void interlaced25fpsAlsoPicks50() { assertEquals(1, FrameRateMatch.pick(25f, rates, w, h, 1920, 1080, 60f)); }
    @Test public void alreadyMatchingStays() { assertEquals(-1, FrameRateMatch.pick(50f, rates, w, h, 1920, 1080, 50f)); }
    @Test public void everyNewWindowPins50EvenWhenAlreadyAt50() {
        assertEquals(1, FrameRateMatch.windowMode(50f, rates, w, h, 0));
        assertEquals(1, FrameRateMatch.windowMode(50f, rates, w, h, 1));
        assertEquals(1, FrameRateMatch.windowMode(25f, rates, w, h, 1));
    }
    @Test public void sixtyHzContentStillChangesFrom50() {
        assertEquals(2, FrameRateMatch.windowMode(60f, rates, w, h, 1));
        assertEquals(59.94f, rates[FrameRateMatch.windowMode(60f, rates, w, h, 1)], 0.001f);
    }
    @Test public void windowPinNeverChangesResolutionOrUsesUnknownFps() {
        assertEquals(-1, FrameRateMatch.windowMode(50f, rates, w, h, 5));
        assertEquals(-1, FrameRateMatch.windowMode(-1f, rates, w, h, 1));
    }
    @Test public void usContentKeeps5994() { assertEquals(-1, FrameRateMatch.pick(29.97f, rates, w, h, 1920, 1080, 59.94f)); }
    @Test public void unknownRateDoesNothing() { assertEquals(-1, FrameRateMatch.pick(-1f, rates, w, h, 1920, 1080, 60f)); }
    @Test public void measures50fpsFromFrameTimes() {
        long[] t = new long[31]; for (int i = 0; i < t.length; i++) t[i] = 1_000_000L + i * 20_000L;
        assertEquals(50f, FrameRateMatch.measure(t), 0.001f);
    }
    @Test public void neverChangesResolution() { assertEquals(-1, FrameRateMatch.pick(50f, rates, w, h, 3840, 2160, 60f)); }

    @org.junit.Test public void pictureStaysCoveredOnlyWhileTheTvSwitches() {
        org.junit.Assert.assertEquals(FrameRateMatch.SETTLE_MS, FrameRateMatch.uncoverDelay(true));
        org.junit.Assert.assertEquals(0, FrameRateMatch.uncoverDelay(false));
        org.junit.Assert.assertTrue(FrameRateMatch.MAX_HOLD_MS <= 4000);
    }
}
