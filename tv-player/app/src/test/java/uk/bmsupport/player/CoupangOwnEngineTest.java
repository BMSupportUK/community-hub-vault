package uk.bmsupport.player;

import org.junit.Test;
import static org.junit.Assert.*;

public class CoupangOwnEngineTest {
    @Test public void coupangLiveOpensInTheMainEngine() {
        assertFalse(PlayerActivity.backupFirst("live", false, false, "Coupang Play 3", "Sports Pass"));
    }
    @Test public void ordinaryLiveOpensInTheMainEngine() {
        assertFalse(PlayerActivity.backupFirst("live", false, false, "BBC One", "UK | Free to air"));
    }
    @Test public void loopedChannelsStayOnBackupEngine() {
        assertTrue(PlayerActivity.backupFirst("live", false, false, "VIP Cinema 4", "VIP Cinema"));
        assertTrue(PlayerActivity.backupFirst("live", false, false, "24/7 Friends", "24/7 Movies/Series"));
        assertTrue(PlayerActivity.backupFirst("live", false, false, "UK: Box Sets 2", "Box Sets"));
    }
    @Test public void loopedCategoriesStayOnBackupEvenWithoutMarkerInChannelName() {
        // Channels inside the looped categories are often named without VIP/24-7, so the category decides.
        assertTrue(PlayerActivity.backupFirst("live", false, false, "Sky Store Premier 1", "VIP Sky Store Premier"));
        assertTrue(PlayerActivity.backupFirst("live", false, false, "Netflix Movies 2", "VIP Netflix Movies"));
        assertTrue(PlayerActivity.backupFirst("live", false, false, "Amazon Prime Series 3", "VIP Amazon Prime Series"));
        assertTrue(PlayerActivity.backupFirst("live", false, false, "Kids Corner 1", "VIP Kids Corner"));
        assertTrue(PlayerActivity.backupFirst("live", false, false, "Movies 5", "24/7 Movies/Series"));
        assertTrue(PlayerActivity.backupFirst("live", false, false, "Artists 2", "24/7 Artists"));
        assertTrue(PlayerActivity.backupFirst("live", false, false, "Bollywood 4", "24/7 Bollywood"));
    }
    @Test public void coupangCatchUpUnchanged() {
        assertTrue(PlayerActivity.backupFirst("catchup", true, false, "Coupang Play 3", "Sports Pass"));
    }
}
