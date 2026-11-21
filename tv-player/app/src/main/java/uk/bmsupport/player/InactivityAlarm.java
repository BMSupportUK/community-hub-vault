package uk.bmsupport.player;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.SystemClock;

/** OS-owned elapsed-time deadline: Java timers alone stop running in device standby. */
public final class InactivityAlarm extends BroadcastReceiver {
    private static final String DEADLINE = "inactivity_close_at";

    private static PendingIntent pending(Context context, long deadline) {
        return PendingIntent.getBroadcast(context, 3101,
                new Intent(context, InactivityAlarm.class).putExtra(DEADLINE, deadline),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static void arm(Context context, long deadline) {
        context.getSharedPreferences("bmplayer", Context.MODE_PRIVATE).edit()
                .putLong(DEADLINE, deadline).apply();
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms == null) return;
        PendingIntent operation = pending(context, deadline);
        try {
            if (Build.VERSION.SDK_INT < 31 || alarms.canScheduleExactAlarms()) {
                alarms.setExactAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, deadline, operation);
                return;
            }
        } catch (SecurityException ignored) { /* Some boxes deny exact alarms despite reporting support. */ }
        alarms.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, deadline, operation);
    }

    static void cancel(Context context) {
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms != null) alarms.cancel(pending(context, 0));
        context.getSharedPreferences("bmplayer", Context.MODE_PRIVATE).edit().remove(DEADLINE).apply();
    }

    @Override public void onReceive(Context context, Intent intent) {
        long deadline = intent.getLongExtra(DEADLINE, -1);
        long current = context.getSharedPreferences("bmplayer", Context.MODE_PRIVATE).getLong(DEADLINE, -1);
        // A late delivery from before Continue viewing must never close the new viewing session.
        if (deadline < 0 || deadline != current || SystemClock.elapsedRealtime() < deadline) return;
        ((PlayerApplication) context.getApplicationContext()).exitToHome();
    }
}