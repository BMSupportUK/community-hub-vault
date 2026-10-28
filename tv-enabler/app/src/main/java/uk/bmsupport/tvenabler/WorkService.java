package uk.bmsupport.tvenabler;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

/** Keeps BM TV Enabler running while it talks to the TV, so switching apps can't cut the TV off mid-install. */
public final class WorkService extends Service {
    private static final String CHANNEL = "tv_work";
    private PowerManager.WakeLock wake;
    private WifiManager.WifiLock wifi;

    static void start(Context c) {
        try {
            Intent i = new Intent(c, WorkService.class);
            if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i); else c.startService(i);
        } catch (Exception ignored) { /* Work still runs while the app stays open. */ }
    }
    static void stop(Context c) { try { c.stopService(new Intent(c, WorkService.class)); } catch (Exception ignored) {} }

    @Override public int onStartCommand(Intent intent, int flags, int id) {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= 26) {
            nm.createNotificationChannel(new NotificationChannel(CHANNEL, "TV setup", NotificationManager.IMPORTANCE_LOW));
            b = new Notification.Builder(this, CHANNEL);
        } else b = new Notification.Builder(this);
        Notification n = b.setSmallIcon(android.R.drawable.stat_sys_download).setContentTitle("BM TV Enabler")
                .setContentText("Working with your TV… you can switch apps.").setOngoing(true).build();
        try {
            if (Build.VERSION.SDK_INT >= 29) startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
            else startForeground(1, n);
        } catch (Exception e) { stopSelf(); return START_NOT_STICKY; }
        try {
            if (wake == null) { wake = ((PowerManager) getSystemService(POWER_SERVICE)).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "bmtv:work"); wake.acquire(30 * 60_000L); }
            if (wifi == null) { wifi = ((WifiManager) getApplicationContext().getSystemService(WIFI_SERVICE)).createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "bmtv:work"); wifi.acquire(); }
        } catch (Exception ignored) {}
        return START_NOT_STICKY;
    }

    @Override public void onDestroy() {
        try { if (wake != null && wake.isHeld()) wake.release(); } catch (Exception ignored) {}
        try { if (wifi != null && wifi.isHeld()) wifi.release(); } catch (Exception ignored) {}
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent i) { return null; }
}
