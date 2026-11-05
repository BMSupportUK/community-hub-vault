package uk.bmsupport.player;

import static org.junit.Assert.*;
import org.junit.Test;

public class PlayerControlsTest {
    @Test public void skipOnlyOnFilmsAndEpisodes() {
        assertTrue(PlayerControls.canSkip("film"));
        assertTrue(PlayerControls.canSkip("episode"));
        assertFalse(PlayerControls.canSkip("live"));
        assertFalse(PlayerControls.canSkip("catchup"));
        assertFalse(PlayerControls.canSkip(null));
    }
    @Test public void noReportOnCatchUp() {
        assertFalse(PlayerControls.canReport("catchup"));
        assertTrue(PlayerControls.canReport("live"));
        assertTrue(PlayerControls.canReport("film"));
        assertTrue(PlayerControls.canReport("episode"));
    }
}
