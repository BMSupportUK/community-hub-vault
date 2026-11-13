package uk.bmsupport.player;

import org.junit.Test;
import static org.junit.Assert.*;

public class HighLevelAvcRendererTest {
    @Test public void pictureStampedSecondsAheadOfSoundLearnsShift() {
        assertEquals(5_000_000 - 30_000, HighLevelAvcRenderer.learnShift(0, 5_000_000, 300));
    }
    @Test public void briefHoldOrNormalTimingKeepsShift() {
        assertEquals(-1, HighLevelAvcRenderer.learnShift(0, 5_000_000, 100));
        assertEquals(-1, HighLevelAvcRenderer.learnShift(0, 20_000, 5_000));
    }
    @Test public void overshootWhenVideoFallsBehindIsReduced() {
        assertEquals(2_000_000 - 1_000_000 + 30_000, HighLevelAvcRenderer.learnShift(2_000_000, -1_000_000, 0));
        assertEquals(-1, HighLevelAvcRenderer.learnShift(0, -1_000_000, 0));
    }
}
