package uk.bmsupport.player;

import static org.junit.Assert.*;
import org.junit.Test;

public class FeedSwitchReportTest {
    @Test public void sameChannelAndTypeCountsOncePer30Seconds() {
        assertTrue(BufferReporter.countSwitch("sound|ch1", 1_000));
        assertFalse(BufferReporter.countSwitch("sound|ch1", 30_999));
        assertTrue(BufferReporter.countSwitch("sound|ch1", 31_000));
        assertTrue(BufferReporter.countSwitch("picture|ch1", 1_000));
    }
}
