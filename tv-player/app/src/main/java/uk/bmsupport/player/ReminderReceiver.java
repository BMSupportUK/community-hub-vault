package uk.bmsupport.player;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

/** Fires 5 minutes before a programme and shows a notification that jumps to its channel. */
public class ReminderReceiver extends BroadcastReceiver {
    static final String CHANNEL = "programme_reminders_v1";

    private static int code(String id, long st) { return (id + ":" + st).hashCode(); }

    static void schedule(Context c, String id, String name, String title, long startSec) {
        Intent i = new Intent(c, ReminderReceiver.class).putExtra("id", id).putExtra("name", name).putExtra("title", title).putExtra("start", startSec);
        PendingIntent pi = PendingIntent.getBroadcast(c, code(id, startSec), i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        long at = Math.max(System.currentTimeMillis() + 1000, startSec * 1000 - 5 * 60_000L);
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am != null) am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
    }

    static void cancel(Context c, String id, long startSec) {
        PendingIntent pi = PendingIntent.getBroadcast(c, code(id, startSec), new Intent(c, ReminderReceiver.class), PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE);
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (pi != null && am != null) am.cancel(pi);
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(code(id, startSec));
    }

    @Override public void onReceive(Context c, Intent in) {
        String id = in.getStringExtra("id"), name = in.getStringExtra("name"), title = in.getStringExtra("title");
        long st = in.getLongExtra("start", 0);
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null || id == null) return;
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL) == null)
            nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Programme reminders", NotificationManager.IMPORTANCE_HIGH));
        Intent open = new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP)
                .putExtra("reminder_id", id).putExtra("reminder_name", name).putExtra("reminder_start", st);
        PendingIntent pi = PendingIntent.getActivity(c, code(id, st), open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, CHANNEL) : new Notification.Builder(c);
        b.setSmallIcon(R.mipmap.ic_launcher).setContentTitle("⏰ " + title + " starts in 5 minutes")
                .setContentText("On " + name + " – press to watch").setContentIntent(pi).setAutoCancel(true)
                .addAction(new Notification.Action.Builder(null, "▶ Watch now", pi).build());
        try { nm.notify(code(id, st), b.build()); } catch (SecurityException ignored) {}
    }
}
