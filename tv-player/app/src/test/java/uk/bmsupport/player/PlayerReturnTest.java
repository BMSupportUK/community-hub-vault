package uk.bmsupport.player;

import android.app.Activity;
import android.os.Looper;
import android.os.SystemClock;
import java.lang.reflect.Field;
import org.junit.Test;
import org.junit.Before;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;
import static org.robolectric.Shadows.shadowOf;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=34, application=PlayerApplication.class)
public class PlayerReturnTest {
    @Before public void resetActivityCount() throws Exception {
        Field count = PlayerApplication.class.getDeclaredField("startedCount");
        count.setAccessible(true); count.setInt(null, 0);
        PlayerApplication.pinPassed = false;
    }
    @Test public void backgroundReturnSkipsLinkCheck() {
        Activity a = Robolectric.buildActivity(Activity.class).get();
        PlayerApplication app = (PlayerApplication) a.getApplication();
        app.onActivityStarted(a); PlayerApplication.pinPassed = true;
        app.onActivityStopped(a); shadowOf(Looper.getMainLooper()).idle();
        app.onActivityStarted(a);
        // Re-opened from the background without exiting: no linked-device screen again.
        assertTrue(PlayerApplication.pinPassed);
        app.onActivityStopped(a);
    }
    @Test public void internalActivityTransitionKeepsPin() {
        Activity a = Robolectric.buildActivity(Activity.class).get();
        PlayerApplication app = (PlayerApplication) a.getApplication();
        app.onActivityStarted(a); PlayerApplication.pinPassed = true;
        app.onActivityStopped(a); app.onActivityStarted(a);
        shadowOf(Looper.getMainLooper()).idle();
        assertTrue(PlayerApplication.pinPassed);
        app.onActivityStopped(a);
    }
    @Test public void destroyedPromptDoesNotResetDeadline() throws Exception {
        Activity a = Robolectric.buildActivity(Activity.class).get();
        PlayerApplication app = (PlayerApplication) a.getApplication();
        Field deadline = PlayerApplication.class.getDeclaredField("promptedAt");
        deadline.setAccessible(true);
        long start = SystemClock.elapsedRealtime(); deadline.setLong(app, start);
        app.onActivityDestroyed(a);
        assertEquals(start, deadline.getLong(app));
        assertTrue(InactivityPolicy.exit(start, start + 60_000));
        assertEquals(10_800_000L, InactivityPolicy.IDLE_MS);
        assertFalse(InactivityPolicy.exit(start, start + 59_999));
    }
}