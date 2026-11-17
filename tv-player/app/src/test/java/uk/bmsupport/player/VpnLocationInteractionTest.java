package uk.bmsupport.player;

import android.app.Activity;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=34, application=PlayerApplication.class)
public class VpnLocationInteractionTest {
    @Test public void locationControlKeepsBothPlaybackScreensOpen() {
        boolean previous = BoxVpn.present;
        try {
            BoxVpn.present = true;
            for (Activity a : new Activity[]{Robolectric.buildActivity(PlayerActivity.class).get(), Robolectric.buildActivity(BackupPlayerActivity.class).get()}) {
                LinearLayout row = PlayerActionControls.add(a, new FrameLayout(a), () -> {}, () -> {}, () -> {});
                // No saved token: pressing the control must not close or replace playback.
                assertTrue(row.getChildAt(row.getChildCount() - 1).performClick());
                assertFalse(a.isFinishing());
                assertNull(org.robolectric.Shadows.shadowOf(a).getNextStartedActivity());
            }
        } finally { BoxVpn.present = previous; }
    }
}