package uk.bmsupport.player;

import static org.junit.Assert.assertEquals;
import org.junit.Test;

public final class BackupBufferPolicyTest {
    @Test public void coupangInheritsFortySecondMinimum() {
        assertEquals(40000, BackupBufferPolicy.networkCacheMs(true, "small", "Coupang | Event 12"));
    }
    @Test public void daznInheritsFortySecondMinimum() {
        assertEquals(40000, BackupBufferPolicy.networkCacheMs(true, "normal", "DAZN CA 18"));
    }
    @Test public void heavyFeedInheritsFortySecondMinimum() {
        assertEquals(40000, BackupBufferPolicy.networkCacheMs(true, "small", "USA Network | FHD |"));
    }
    @Test public void normalChannelUsesChosenProfile() {
        assertEquals(15000, BackupBufferPolicy.networkCacheMs(true, "normal", "BBC One"));
    }
    @Test public void filmsAndCatchupKeepExistingCache() {
        assertEquals(3000, BackupBufferPolicy.networkCacheMs(false, "large", "Film UHD"));
    }
}