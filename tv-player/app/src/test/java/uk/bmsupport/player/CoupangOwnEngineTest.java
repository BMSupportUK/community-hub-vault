package uk.bmsupport.player;

import org.junit.Test;
import static org.junit.Assert.*;

public class CoupangOwnEngineTest {
    @Test public void coupangLiveOpensInTheMainEngine() {
        assertFalse(PlayerActivity.backupFirst("live", false, false, "Coupang Play 3", "Sports Pass"));
    }
    @Test public void ordinaryLiveStartsInTheBackupEngine() {
        // Original behaviour: every non-UHD/4K live channel starts in the built-in backup engine.
        assertTrue(PlayerActivity.backupFirst("live", false, false, "BBC One", "UK | Free to air"));
        assertTrue(PlayerActivity.backupFirst("live", false, false, "Sky Sports Main Event", "Sports"));
    }
    @Test public void loopedChannelsStayOnBackupEngine() {
        assertTrue(PlayerActivity.backupFirst("live", false, false, "VIP Cinema 4", "VIP Cinema"));
        assertTrue(PlayerActivity.backupFirst("live", false, false, "24/7 Friends", "24/7 Movies/Series"));
        assertTrue(PlayerActivity.backupFirst("live", false, false, "UK: Box Sets 2", "Box Sets"));
        assertTrue(PlayerActivity.backupFirst("live", false, false, "Sky Store Premier 1", "VIP Sky Store Premier"));
        assertTrue(PlayerActivity.backupFirst("live", false, false, "Kids Corner 1", "VIP Kids Corner"));
        assertTrue(PlayerActivity.backupFirst("live", false, false, "Bollywood 4", "24/7 Bollywood"));
        // Real provider names: Sky Store sits in "UK I Sky Store Premier" with no VIP marker.
        assertTrue(PlayerActivity.backupFirst("live", false, false, "Sky Store Premiere | 1 |", "UK I Sky Store Premier"));
        assertTrue(PlayerActivity.backupFirst("live", false, false, "Movie Premiere ᴴᴰ", "VIP | Cinema Collection"));
    }
    @Test public void coupangCatchUpUnchanged() {
        assertTrue(PlayerActivity.backupFirst("catchup", true, false, "Coupang Play 3", "Sports Pass"));
    }
}
