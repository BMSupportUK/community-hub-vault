package uk.bmsupport.player;

import android.app.Activity;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import org.robolectric.util.ReflectionHelpers;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34, application = PlayerApplication.class)
public class CloseAppTest {
    @Test public void exitClosesEveryScreenAndArmsTheStop() {
        try (var first = Robolectric.buildActivity(Activity.class).setup();
             var second = Robolectric.buildActivity(Activity.class).setup()) {
            PlayerApplication app = (PlayerApplication) first.get().getApplication();
            try {
                PlayerApplication.closeApp(second.get());
                assertTrue(ReflectionHelpers.getField(app, "exiting"));
                assertTrue(first.get().isFinishing());
                assertTrue(second.get().isFinishing());
                assertFalse(PlayerApplication.pinPassed);
            } finally {
                ((InactivityWatchdog) ReflectionHelpers.getField(app, "inactivityExit")).cancel();
                ReflectionHelpers.setField(app, "exiting", false);
            }
        }
    }

    @Test public void expiredCountdownClosesEvenWithNoScreenShowing() {
        try (var c = Robolectric.buildActivity(Activity.class).setup()) {
            PlayerApplication app = (PlayerApplication) c.get().getApplication();
            try {
                ReflectionHelpers.setField(app, "foreground", null);
                org.robolectric.shadows.ShadowSystemClock.advanceBy(java.time.Duration.ofMinutes(2));
                ReflectionHelpers.setField(app, "promptedAt", 1L);
                ReflectionHelpers.callInstanceMethod(app, "tick");
                assertTrue(ReflectionHelpers.getField(app, "exiting"));
                assertTrue(c.get().isFinishing());
            } finally {
                ((InactivityWatchdog) ReflectionHelpers.getField(app, "inactivityExit")).cancel();
                ReflectionHelpers.setField(app, "exiting", false);
            }
        }
    }
}
