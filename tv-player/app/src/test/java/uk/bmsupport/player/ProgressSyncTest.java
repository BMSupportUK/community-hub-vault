package uk.bmsupport.player;

import static org.junit.Assert.*;
import org.junit.Test;

public class ProgressSyncTest {
    @Test public void syncedKeysAreFilmsEpisodesSeriesOnly() {
        assertEquals("film:12", ProgressSync.portable("watch:abc+/=:film:12"));
        assertEquals("episode:9", ProgressSync.portable("watch:h:episode:9"));
        assertEquals("series:4", ProgressSync.portable("watch:h:series:4"));
        assertNull(ProgressSync.portable("watch:h:live:4"));
        assertNull(ProgressSync.portable("fav"));
    }
    @Test public void newerRemotePositionWins() {
        assertTrue(ProgressSync.remoteWins(1000, 2000));
        assertFalse(ProgressSync.remoteWins(2000, 1000));
        assertFalse(ProgressSync.remoteWins(2000, 2000));
    }
}
