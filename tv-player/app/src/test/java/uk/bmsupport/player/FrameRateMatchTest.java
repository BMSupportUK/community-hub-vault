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
    @Test public void usContentKeeps5994() { assertEquals(-1, FrameRateMatch.pick(29.97f, rates, w, h, 1920, 1080, 59.94f)); }
    @Test public void unknownRateDoesNothing() { assertEquals(-1, FrameRateMatch.pick(-1f, rates, w, h, 1920, 1080, 60f)); }
    @Test public void neverChangesResolution() { assertEquals(-1, FrameRateMatch.pick(50f, rates, w, h, 3840, 2160, 60f)); }
}
