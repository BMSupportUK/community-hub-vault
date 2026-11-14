package uk.bmsupport.player;

import static org.junit.Assert.assertEquals;
import org.junit.Test;

public class WatchSpeedTest {
    @Test public void sixtyMegabytesInAMinuteIsEightMbps() { assertEquals(8000, WatchSpeed.rate(0, 0, 60_000_000L, 60_000)); }
    @Test public void firstSampleOrCounterResetGivesNoReading() {
        assertEquals(0, WatchSpeed.rate(-1, 0, 1000, 60_000));
        assertEquals(0, WatchSpeed.rate(5000, 0, 1000, 60_000));
    }
}
