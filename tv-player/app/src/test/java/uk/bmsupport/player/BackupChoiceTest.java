package uk.bmsupport.player;

import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34, application = PlayerApplication.class)
public class BackupChoiceTest {
    @Test public void channelThatNeededBackupOpensInBackupNextTime() {
        JSONObject s = BackupChoice.remember(new JSONObject(), "live", "101", "VIP Cinema Collection", 1000);
        assertTrue(BackupChoice.prefer(s, "live", "101", "VIP Cinema Collection", 2000));
        assertFalse(BackupChoice.prefer(s, "live", "102", "VIP Cinema Collection", 2000));
        assertFalse(BackupChoice.prefer(s, "live", "200", "Free to Air", 2000));
    }
    @Test public void twoChannelsInOneCategoryMakeTheWholeCategoryBackupFirst() {
        JSONObject s = BackupChoice.remember(new JSONObject(), "live", "101", "VIP Cinema Collection", 1000);
        s = BackupChoice.remember(s, "live", "102", "vip cinema collection ", 1500);
        assertTrue(BackupChoice.prefer(s, "live", "999", "VIP Cinema Collection", 2000));
        assertFalse(BackupChoice.prefer(s, "live", "200", "Free to Air", 2000));
    }
    @Test public void choicesExpireAfterFourteenDays() {
        JSONObject s = BackupChoice.remember(new JSONObject(), "live", "101", "VIP", 0);
        s = BackupChoice.remember(s, "live", "102", "VIP", 0);
        long later = BackupChoice.KEEP_MS + 1;
        assertFalse(BackupChoice.prefer(s, "live", "101", "VIP", later));
        assertFalse(BackupChoice.prefer(s, "live", "999", "VIP", later));
    }
    @Test public void filmsAreRememberedOneByOneNeverByCategory() {
        JSONObject s = BackupChoice.remember(new JSONObject(), "film", "5", "Action", 0);
        s = BackupChoice.remember(s, "film", "6", "Action", 0);
        assertTrue(BackupChoice.prefer(s, "film", "5", "Action", 1));
        assertFalse(BackupChoice.prefer(s, "film", "7", "Action", 1));
    }
}
