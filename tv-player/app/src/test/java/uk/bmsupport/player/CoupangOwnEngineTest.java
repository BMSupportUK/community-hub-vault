package uk.bmsupport.player;

import org.junit.Test;
import static org.junit.Assert.*;

public class CoupangOwnEngineTest {
    @Test public void coupangLiveOpensInTheMainEngine() {
        assertFalse(PlayerActivity.backupFirst("live", false, false, "Coupang Play 3"));
    }
    @Test public void ordinaryLiveOpensInTheMainEngine() {
        assertFalse(PlayerActivity.backupFirst("live", false, false, "BBC One"));
    }
    @Test public void loopedChannelsStayOnBackupEngine() {
        assertTrue(PlayerActivity.backupFirst("live", false, false, "VIP Cinema 4"));
        assertTrue(PlayerActivity.backupFirst("live", false, false, "24/7 Friends"));
        assertTrue(PlayerActivity.backupFirst("live", false, false, "UK: Box Sets 2"));
    }
    @Test public void coupangCatchUpUnchanged() {
        assertTrue(PlayerActivity.backupFirst("catchup", true, false, "Coupang Play 3"));
    }
}
