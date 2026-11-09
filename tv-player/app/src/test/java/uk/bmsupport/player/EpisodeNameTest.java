package uk.bmsupport.player;

import org.junit.Test;
import static org.junit.Assert.*;

public class EpisodeNameTest {
    @Test public void stripsSeriesNameAndEpisodeCode() {
        assertEquals("Pilot", EpisodeName.clean("Breaking Bad S01E03 - Pilot", "Breaking Bad"));
        assertEquals("Pilot", EpisodeName.clean("Breaking Bad (2008) - S01 E03 - Pilot", "Breaking Bad (2008)"));
        assertEquals("Grilled", EpisodeName.clean("S02E01 Grilled", "Breaking Bad"));
        assertEquals("Blue Moon", EpisodeName.clean("Blue Moon", "Breaking Bad"));
    }
    @Test public void ninetyPercentCountsAsWatched() {
        assertTrue(WatchProgress.finished(90, 100));
        assertFalse(WatchProgress.finished(89, 100));
    }
}
