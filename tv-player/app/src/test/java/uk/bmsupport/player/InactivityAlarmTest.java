package uk.bmsupport.player;

import android.app.Activity;
import android.app.AlarmManager;
import android.content.Context;
import android.content.Intent;
import android.os.SystemClock;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.Shadows;
import org.robolectric.annotation.Config;
import org.robolectric.util.ReflectionHelpers;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 28, application = PlayerApplication.class)
public class InactivityAlarmTest {
    @Test public void closeAlarmWakesStandbyAtThreeHoursAndOneMinute() {
        try (var controller = Robolectric.buildActivity(Activity.class).setup()) {
            PlayerApplication app = (PlayerApplication) controller.get().getApplication();
            long lastInput = SystemClock.elapsedRealtime();
            InactivityAlarm.arm(app, InactivityPolicy.closeAt(lastInput));
            AlarmManager alarms = (AlarmManager) app.getSystemService(Context.ALARM_SERVICE);
            var alarm = Shadows.shadowOf(alarms).getNextScheduledAlarm();
            assertNotNull(alarm);
            assertEquals(AlarmManager.ELAPSED_REALTIME_WAKEUP, alarm.type);
            assertEquals(lastInput + 10_860_000L, alarm.triggerAtTime);
            assertTrue(alarm.allowWhileIdle);
            InactivityAlarm.cancel(app);
        }
    }

    @Test public void expiredAlarmClosesPausedActivities() {
        try (var controller = Robolectric.buildActivity(Activity.class).setup()) {
            PlayerApplication app = (PlayerApplication) controller.get().getApplication();
            controller.pause();
            long deadline = SystemClock.elapsedRealtime();
            InactivityAlarm.arm(app, deadline);
            try {
                new InactivityAlarm().onReceive(app,
                        new Intent(app, InactivityAlarm.class).putExtra("inactivity_close_at", deadline));
                assertTrue(ReflectionHelpers.getField(app, "exiting"));
                assertTrue(controller.get().isFinishing());
            } finally {
                ((InactivityWatchdog) ReflectionHelpers.getField(app, "inactivityExit")).cancel();
            }
        }
    }

    @Test public void oldAlarmCannotCloseAContinuedSession() {
        try (var controller = Robolectric.buildActivity(Activity.class).setup()) {
            PlayerApplication app = (PlayerApplication) controller.get().getApplication();
            long oldDeadline = SystemClock.elapsedRealtime();
            InactivityAlarm.arm(app, InactivityPolicy.closeAt(oldDeadline));
            new InactivityAlarm().onReceive(app,
                    new Intent(app, InactivityAlarm.class).putExtra("inactivity_close_at", oldDeadline));
            assertFalse(ReflectionHelpers.getField(app, "exiting"));
            assertFalse(controller.get().isFinishing());
            InactivityAlarm.cancel(app);
        }
    }

    @Test @Config(sdk = 34)
    public void modernBoxesWithoutExactAlarmPermissionStillScheduleAWakeUp() {
        try (var controller = Robolectric.buildActivity(Activity.class).setup()) {
            PlayerApplication app = (PlayerApplication) controller.get().getApplication();
            AlarmManager alarms = (AlarmManager) app.getSystemService(Context.ALARM_SERVICE);
            Shadows.shadowOf(alarms).setCanScheduleExactAlarms(false);
            long lastInput = SystemClock.elapsedRealtime();
            InactivityAlarm.arm(app, InactivityPolicy.closeAt(lastInput));
            var alarm = Shadows.shadowOf(alarms).getNextScheduledAlarm();
            assertNotNull(alarm);
            assertEquals(AlarmManager.ELAPSED_REALTIME_WAKEUP, alarm.type);
            assertEquals(lastInput + 10_860_000L, alarm.triggerAtTime);
            assertTrue(alarm.allowWhileIdle);
            InactivityAlarm.cancel(app);
        }
    }
}