package uk.bmsupport.app;

import android.app.DownloadManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
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
                "android.resource://" + getPackageName() + "/" + R.raw.ticket_reply_notify
        );
        NotificationChannel channel = new NotificationChannel(
                "bm_support_ticket_replies_v2",
                "Support ticket replies",
                NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("Spoken alert when a customer replies to an assigned ticket");
        channel.enableVibration(true);
        channel.enableLights(true);
        channel.setSound(soundUri, audioAttrs);

        NotificationManager notificationManager = getSystemService(NotificationManager.class);
        if (notificationManager != null) {
            notificationManager.createNotificationChannel(channel);
        }
    }
}
