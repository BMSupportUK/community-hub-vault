package uk.bmsupport.player;

import org.junit.Test;
import static org.junit.Assert.*;

public class CoupangOwnEngineTest {
    @Test public void coupangLiveOpensInTheMainEngine() {
        assertFalse(PlayerActivity.backupFirst("live", false, false, "Coupang Play 3"));
    }
    @Test public void ordinaryLiveStillStartsInBackupEngine() {
        assertTrue(PlayerActivity.backupFirst("live", false, false, "BBC One"));
    }
    @Test public void coupangCatchUpUnchanged() {
        assertTrue(PlayerActivity.backupFirst("catchup", true, false, "Coupang Play 3"));
    }
}
