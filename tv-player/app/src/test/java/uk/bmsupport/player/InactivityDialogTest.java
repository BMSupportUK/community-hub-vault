package uk.bmsupport.player;

import android.app.Activity;
import android.app.AlertDialog;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import org.robolectric.util.ReflectionHelpers;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34, application = PlayerApplication.class)
public class InactivityDialogTest {
    private static final class DetachedDialog extends AlertDialog {
        DetachedDialog(Activity activity) { super(activity); }
        @Override public void dismiss() {
            throw new IllegalArgumentException("View not attached to window manager");
        }
    }

    @Test public void detachedWarningCannotAbortAppExit() {
        try (var controller = Robolectric.buildActivity(Activity.class).setup()) {
            Activity activity = controller.get();
            PlayerApplication app = (PlayerApplication) activity.getApplication();
            ReflectionHelpers.setField(app, "prompt", new DetachedDialog(activity));
            try {
                ReflectionHelpers.callInstanceMethod(app, "exitToHome");
                assertTrue(ReflectionHelpers.getField(app, "exiting"));
                assertNull(ReflectionHelpers.getField(app, "prompt"));
                assertTrue(activity.isFinishing());
            } finally {
                InactivityWatchdog watchdog = ReflectionHelpers.getField(app, "inactivityExit");
                watchdog.cancel();
            }
        }
    }

    @Test public void destroyedWarningOwnerPreservesTheOriginalDeadline() {
        try (var controller = Robolectric.buildActivity(Activity.class).setup()) {
            Activity activity = controller.get();
            PlayerApplication app = (PlayerApplication) activity.getApplication();
            ReflectionHelpers.setField(app, "prompt", new DetachedDialog(activity));
            ReflectionHelpers.setField(app, "promptedAt", 10_800_000L);
            ReflectionHelpers.setField(app, "promptOwner", activity);
            app.onActivityDestroyed(activity);
            assertNull(ReflectionHelpers.getField(app, "prompt"));
            assertEquals(Long.valueOf(10_800_000L), ReflectionHelpers.getField(app, "promptedAt"));
        }
    }

    @Test public void unansweredCountdownStartsEvenWhenScreensaverPausedTheApp() {
        try (var controller = Robolectric.buildActivity(Activity.class).setup()) {
            Activity activity = controller.get();
            PlayerApplication app = (PlayerApplication) activity.getApplication();
            controller.pause();
            ReflectionHelpers.setField(app, "lastInput", android.os.SystemClock.elapsedRealtime() - InactivityPolicy.IDLE_MS - 1);
            try {
                ReflectionHelpers.callInstanceMethod(app, "tick");
                assertTrue((Long) ReflectionHelpers.getField(app, "promptedAt") >= 0);
            } finally {
                InactivityWatchdog watchdog = ReflectionHelpers.getField(app, "inactivityExit");
                watchdog.cancel();
            }
        }
    }

    @Test public void wakingAfterFourHoursClosesInsteadOfStartingAnotherMinute() {
        try (var controller = Robolectric.buildActivity(Activity.class).setup()) {
            PlayerApplication app = (PlayerApplication) controller.get().getApplication();
            controller.pause();
            ReflectionHelpers.setField(app, "lastInput", android.os.SystemClock.elapsedRealtime() - 14_400_000L);
            try {
                controller.resume();
                assertTrue(ReflectionHelpers.getField(app, "exiting"));
                assertTrue(controller.get().isFinishing());
            } finally {
                ((InactivityWatchdog) ReflectionHelpers.getField(app, "inactivityExit")).cancel();
            }
        }
    }

    @Test public void wakeUpKeyCannotResetAnExpiredViewingSession() {
        try (var controller = Robolectric.buildActivity(Activity.class).setup()) {
            PlayerApplication app = (PlayerApplication) controller.get().getApplication();
            long lastInput = android.os.SystemClock.elapsedRealtime() - 10_860_000L;
            ReflectionHelpers.setField(app, "lastInput", lastInput);
            try {
                PlayerApplication.interaction(controller.get());
                assertTrue(ReflectionHelpers.getField(app, "exiting"));
                assertEquals(Long.valueOf(lastInput), ReflectionHelpers.getField(app, "lastInput"));
            } finally {
                ((InactivityWatchdog) ReflectionHelpers.getField(app, "inactivityExit")).cancel();
            }
        }
    }

    @Test public void standbyWarningKeepsOnlyTheRemainingResponseTime() {
        try (var controller = Robolectric.buildActivity(Activity.class).setup()) {
            PlayerApplication app = (PlayerApplication) controller.get().getApplication();
            controller.pause();
            long lastInput = android.os.SystemClock.elapsedRealtime() - 10_830_000L;
            ReflectionHelpers.setField(app, "lastInput", lastInput);
            try {
                ReflectionHelpers.callInstanceMethod(app, "tick");
                assertEquals(Long.valueOf(lastInput + 10_800_000L), ReflectionHelpers.getField(app, "promptedAt"));
                assertFalse(ReflectionHelpers.getField(app, "exiting"));
            } finally {
                ((InactivityWatchdog) ReflectionHelpers.getField(app, "inactivityExit")).cancel();
            }
        }
    }
}
