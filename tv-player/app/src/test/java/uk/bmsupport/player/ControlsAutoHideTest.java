package uk.bmsupport.player;

import android.os.SystemClock;
import android.view.View;
import android.widget.LinearLayout;
import androidx.media3.ui.PlayerView;
import java.lang.reflect.Field;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34, application = PlayerApplication.class)
public class ControlsAutoHideTest {
    private void set(PlayerActivity a, String name, Object value) throws Exception {
        Field f = PlayerActivity.class.getDeclaredField(name); f.setAccessible(true); f.set(a, value);
    }
    @Test public void orphanControlsHideEvenWhenMediaControllerAlreadyHidden() throws Exception {
        PlayerActivity a = Robolectric.buildActivity(PlayerActivity.class).get();
        PlayerView view = new PlayerView(a); view.hideController();
        LinearLayout row = new LinearLayout(a); row.setVisibility(View.VISIBLE);
        set(a, "view", view); set(a, "controlsRow", row);
        set(a, "lastPressAt", SystemClock.elapsedRealtime() - 4500);
        Field f = PlayerActivity.class.getDeclaredField("hideControls"); f.setAccessible(true);
        ((Runnable) f.get(a)).run();
        assertEquals(View.GONE, row.getVisibility());
    }
    @Test public void recentRemoteInputKeepsControlsAvailable() throws Exception {
        PlayerActivity a = Robolectric.buildActivity(PlayerActivity.class).get();
        LinearLayout row = new LinearLayout(a);
        set(a, "view", new PlayerView(a)); set(a, "controlsRow", row);
        set(a, "lastPressAt", SystemClock.elapsedRealtime());
        Field f = PlayerActivity.class.getDeclaredField("hideControls"); f.setAccessible(true);
        ((Runnable) f.get(a)).run();
        assertEquals(View.VISIBLE, row.getVisibility());
    }
}