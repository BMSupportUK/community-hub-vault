package uk.bmsupport.player;

import org.junit.Test;
import static org.junit.Assert.*;

public class StartupPlaylistsTest {
    @Test public void everyStartupRefreshesLiveMoviesAndSeries() {
        assertEquals(java.util.Arrays.asList("live", "film", "series"), new StartupPlaylists().claim());
    }
    @Test public void returningToMenusDoesNotRefreshAgain() {
        StartupPlaylists startup = new StartupPlaylists();
        assertEquals(3, startup.claim().size());
        assertTrue(startup.claim().isEmpty());
        assertEquals(3, new StartupPlaylists().claim().size());
    }
}