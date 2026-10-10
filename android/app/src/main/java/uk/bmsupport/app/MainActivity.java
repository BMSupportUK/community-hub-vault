package uk.bmsupport.app;

import android.app.DownloadManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Notification;
import android.content.Intent;
import android.os.PowerManager;
import android.provider.Settings;
import android.content.Context;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.webkit.CookieManager;
import android.webkit.URLUtil;
import android.widget.Toast;
import com.getcapacitor.BridgeActivity;

import uk.bmsupport.app.localsend.LocalSendPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(LocalSendPlugin.class);
        super.onCreate(savedInstanceState);
        createDefaultNotificationChannel();
        createTicketReplyNotificationChannel();
        createDingChannel("bm_support_alerts_v4", "BM Support alerts",
                "Signups, tickets, orders, inbox messages and staff alerts");
        createSpokenChannel("bm_support_tickets_v4", "New support tickets", R.raw.ticket_ding);
        createSpokenChannel("bm_support_shift_start_v5", "Shift starting", R.raw.shift_start_ding);
        createSpokenChannel("bm_support_shift_end_v5", "Shift ending", R.raw.shift_end_ding);
        removeOldChannels("bm_support_shift_start_v1", "bm_support_shift_start_v2", "bm_support_shift_start_v3", "bm_support_shift_start_v4",
                "bm_support_shift_end_v1", "bm_support_shift_end_v2", "bm_support_shift_end_v3", "bm_support_shift_end_v4",
                "bm_support_tickets_v1", "bm_support_tickets_v2", "bm_support_tickets_v3",
                "bm_support_outage_v1", "bm_support_outage_v2", "bm_support_outage_resolved_v1", "bm_support_outage_resolved_v2",
                "bm_support_orders_v1", "bm_support_payments_v1", "bm_support_mentions_v1", "bm_support_ticket_replies_v2");
        createSpokenChannel("bm_support_outage_v3", "Service outage", R.raw.outage_ding);
        createSpokenChannel("bm_support_outage_resolved_v3", "Outage resolved", R.raw.outage_resolved_ding);
        createSpokenChannel("bm_support_orders_v2", "New orders", R.raw.order_ding);
        createSpokenChannel("bm_support_payments_v2", "Payments received", R.raw.payment_ding);
        createSpokenChannel("bm_support_mentions_v2", "Mentions", R.raw.mention_ding);
        requestIgnoreBatteryOptimizations();
        enableWebViewDownloads();
    }

    /**
     * Android WebView does not download files unless the host app handles the
     * request. Hand APK links to Android's Download Manager so downloads from
     * the BM App Store and the avatar-menu QR popup work inside the app.
     */
    private void enableWebViewDownloads() {
        getBridge().getWebView().setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> {
            try {
                String fileName = URLUtil.guessFileName(url, contentDisposition, mimeType);
                String effectiveMime = fileName.toLowerCase().endsWith(".apk")
                        ? "application/vnd.android.package-archive"
                        : mimeType;

                DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
                request.setTitle(fileName);
                request.setDescription("Downloading BM Support app");
                request.setMimeType(effectiveMime);
                request.setNotificationVisibility(
                        DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED
                );
                request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName);

                if (userAgent != null && !userAgent.isEmpty()) {
                    request.addRequestHeader("User-Agent", userAgent);
                }
                String cookies = CookieManager.getInstance().getCookie(url);
                if (cookies != null && !cookies.isEmpty()) {
                    request.addRequestHeader("Cookie", cookies);
                }

                DownloadManager manager = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
                if (manager == null) throw new IllegalStateException("Download service unavailable");
                manager.enqueue(request);
                Toast.makeText(this, "Downloading " + fileName, Toast.LENGTH_LONG).show();
            } catch (Exception error) {
                Toast.makeText(this, "Couldn't start the download", Toast.LENGTH_LONG).show();
            }
        });
    }

    private void createDefaultNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

        String channelId = getString(R.string.default_notification_channel_id);
        String channelName = getString(R.string.default_notification_channel_name);
        String channelDescription = getString(R.string.default_notification_channel_description);

        NotificationChannel channel = new NotificationChannel(
                channelId,
                channelName,
                NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription(channelDescription);
        channel.enableVibration(true);
        channel.enableLights(true);
        channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        channel.setBypassDnd(false);
        // Ensure the OS plays a sound for this channel when the app is in the
        // background or fully closed. Without an explicit sound URI some OEMs
        // mute heads-up notifications even on IMPORTANCE_HIGH.
        AudioAttributes audioAttrs = new AudioAttributes.Builder()
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .build();
        channel.setSound(
                RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
                audioAttrs
        );

        NotificationManager notificationManager = getSystemService(NotificationManager.class);
        if (notificationManager != null) {
            notificationManager.createNotificationChannel(channel);
        }
    }

    private void createTicketReplyNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

        AudioAttributes audioAttrs = new AudioAttributes.Builder()
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .build();
        Uri soundUri = Uri.parse(
                "android.resource://" + getPackageName() + "/" + R.raw.ticket_reply_ding
        );
        NotificationChannel channel = new NotificationChannel(
                "bm_support_ticket_replies_v3",
                "Support ticket replies",
                NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("Ding alert when a customer replies to an assigned ticket");
        channel.enableVibration(true);
        channel.enableLights(true);
        channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        channel.setBypassDnd(false);
        channel.setSound(soundUri, audioAttrs);

        NotificationManager notificationManager = getSystemService(NotificationManager.class);
        if (notificationManager != null) {
            notificationManager.createNotificationChannel(channel);
        }
    }

    /**
     * Ding channels use the phone's standard notification sound. Created
     * natively so a closed-app push finds the channel even before the web
     * layer has run (the JS copy in use-push-register matches these settings).
     */
    private void createDingChannel(String id, String name, String description) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        AudioAttributes audioAttrs = new AudioAttributes.Builder()
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .build();
        NotificationChannel channel = new NotificationChannel(id, name, NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription(description);
        channel.enableVibration(true);
        channel.enableLights(true);
        channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        channel.setBypassDnd(false);
        channel.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION), audioAttrs);
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) nm.createNotificationChannel(channel);
    }

    /** Old shift channels kept a phone-changed sound forever; delete them so only the fresh ones show. */
    private void removeOldChannels(String... ids) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm == null) return;
        for (String id : ids) {
            try { nm.deleteNotificationChannel(id); } catch (Exception ignored) { }
        }
    }

    /** Alert channels are created natively so closed-app pushes always find them with their ding. */
    private void createSpokenChannel(String id, String name, int rawRes) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        AudioAttributes audioAttrs = new AudioAttributes.Builder()
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .build();
        Uri soundUri = Uri.parse("android.resource://" + getPackageName() + "/" + rawRes);
        NotificationChannel channel = new NotificationChannel(id, name, NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("Spoken BM Support alert");
        channel.enableVibration(true);
        channel.enableLights(true);
        channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        channel.setBypassDnd(false);
        channel.setSound(soundUri, audioAttrs);
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) nm.createNotificationChannel(channel);
    }

    /**
     * Doze / OEM battery savers stop the app receiving alerts while the screen
     * is locked. Ask once to exempt BM Support so locked-phone alerts ring.
     */
    private void requestIgnoreBatteryOptimizations() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return;
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm == null || pm.isIgnoringBatteryOptimizations(getPackageName())) return;
            Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
            intent.setData(Uri.parse("package:" + getPackageName()));
            startActivity(intent);
        } catch (Exception ignored) { }
    }
}
