package uk.bmsupport.player;

import org.junit.Test;
import static org.junit.Assert.*;

public class LoopedStockPlayerTest {
    @Test public void loopedLiveChannelsGetTheStockMainPlayer() {
        assertTrue(PlayerActivity.stockPlayer("live", false, "Sky Store Premiere | 1 |", "UK I Sky Store Premier"));
        assertTrue(PlayerActivity.stockPlayer("live", false, "Movie Premiere ᴴᴰ", "VIP | Cinema Collection"));
        assertTrue(PlayerActivity.stockPlayer("live", false, "ABC ᴴᴰ", "VIP | Kids Corner"));
    }
    @Test public void ordinaryLiveUhdAndCatchUpKeepTheTunedPlayer() {
        assertFalse(PlayerActivity.stockPlayer("live", false, "BBC One", "UK | Free to air"));
        assertFalse(PlayerActivity.stockPlayer("live", false, "Sky Sports Main Event UHD", "UK | Sports"));
        assertFalse(PlayerActivity.stockPlayer("catchup", true, "Movie Premiere ᴴᴰ", "VIP | Cinema Collection"));
        assertFalse(PlayerActivity.stockPlayer("movie", false, "Some Film", "VIP Cinema"));
    }
}
