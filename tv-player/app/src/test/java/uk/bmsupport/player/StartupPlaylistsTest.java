package uk.bmsupport.player;

import org.junit.Test;
import static org.junit.Assert.*;

public class StartupPlaylistsTest {
    @Test public void everyStartupRefreshesLiveMoviesAndSeries() {
        assertEquals(java.util.Arrays.asList("live", "film", "series"), new StartupPlaylists().claim(true));
    }
    @Test public void returningToMenusDoesNotRefreshAgain() {
        StartupPlaylists startup = new StartupPlaylists();
        assertEquals(3, startup.claim(true).size());
        assertTrue(startup.claim(true).isEmpty());
        assertEquals(3, new StartupPlaylists().claim(true).size());
    }
    @Test public void noPlaylistUpdatesBeforeVerifiedSignIn() {
        StartupPlaylists startup = new StartupPlaylists();
        assertTrue(startup.claim(false).isEmpty());
        assertEquals(3, startup.claim(true).size());
    }
}