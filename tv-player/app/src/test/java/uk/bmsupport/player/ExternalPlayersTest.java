package uk.bmsupport.player;
import android.content.Intent;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import static org.junit.Assert.*;
@RunWith(RobolectricTestRunner.class)
@org.robolectric.annotation.Config(sdk = 28)
public class ExternalPlayersTest {
    @Test public void noExternalPlayerIsEnabledByDefault() {
        android.content.SharedPreferences prefs = RuntimeEnvironment.getApplication().getSharedPreferences("external-test", 0);
        prefs.edit().clear().commit();
        assertTrue(ExternalPlayers.enabled(RuntimeEnvironment.getApplication(), prefs).isEmpty());
    }
    @Test public void launchTargetsOnlyChosenPlayerAndPreservesResume() {
        Intent i = ExternalPlayers.intent("org.videolan.vlc/.VideoActivity", "https://provider.invalid/live/1.ts", "Channel", 12000);
        assertEquals("org.videolan.vlc", i.getComponent().getPackageName());
        assertEquals("https://provider.invalid/live/1.ts", i.getData().toString());
        assertEquals(12000, i.getLongExtra("position", 0));
        assertFalse(i.getBooleanExtra("from_start", true));
    }
}