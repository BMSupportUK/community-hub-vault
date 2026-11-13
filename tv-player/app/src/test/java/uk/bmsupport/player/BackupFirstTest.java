package uk.bmsupport.player;

import org.junit.Test;
import static org.junit.Assert.*;

public class BackupFirstTest {
    @Test public void liveTvStartsInBackupEngine() { assertTrue(PlayerActivity.backupFirst("live", false, false)); }
    @Test public void catchUpStaysOnMainPlayer() { assertFalse(PlayerActivity.backupFirst("live", true, false)); }
    @Test public void filmsAndEpisodesStayOnMainPlayer() {
        assertFalse(PlayerActivity.backupFirst("movie", false, false));
        assertFalse(PlayerActivity.backupFirst("episode", false, false));
    }
    @Test public void mainPlayerIsFallbackWhenBackupGivesUp() { assertFalse(PlayerActivity.backupFirst("live", false, true)); }
}
