package uk.bmsupport.player;

import org.junit.Test;
import static org.junit.Assert.*;

public class StartupPlaylistsTest {
    private StartupPlaylists checked() {
        StartupPlaylists startup = new StartupPlaylists();
        startup.allowAfterUpdate(); return startup;
    }
    @Test public void everyStartupRefreshesLiveMoviesAndSeries() {
        assertEquals(java.util.Arrays.asList("live", "film", "series"), checked().claim(true));
    }
    @Test public void returningToMenusDoesNotRefreshAgain() {
        StartupPlaylists startup = checked();
        assertEquals(3, startup.claim(true).size());
        assertTrue(startup.claim(true).isEmpty());
        assertEquals(3, checked().claim(true).size());
    }
    @Test public void noPlaylistUpdatesBeforeVerifiedSignIn() {
        StartupPlaylists startup = checked();
        assertTrue(startup.claim(false).isEmpty());
        assertEquals(3, startup.claim(true).size());
    }
    @Test public void updateCheckAndChosenDownloadBlockPlaylistsUntilResolved() {
        StartupPlaylists startup = new StartupPlaylists();
        assertTrue(startup.claim(true).isEmpty());
        assertTrue(startup.claim(true).isEmpty());
        startup.allowAfterUpdate();
        assertEquals(java.util.Arrays.asList("live", "film", "series"), startup.claim(true));
        assertTrue(startup.claim(true).isEmpty());
    }
}