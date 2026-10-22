package uk.bmsupport.app.remotehelper;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageInstaller;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Installs BM Remote Helper through Android's session installer.
 *
 * Newer Android / Google TV (13+) block the Accessibility switch for apps that
 * were installed from a downloaded file (e.g. via Downloader). Apps installed
 * through a PackageInstaller session marked as a store install are trusted, so
 * the switch stays on.
 */
@CapacitorPlugin(name = "RemoteHelper")
public class RemoteHelperPlugin extends Plugin {
    public static final String HELPER_PACKAGE = "uk.bmsupport.remote";
    private static final String HELPER_SERVICE = HELPER_PACKAGE + "/" + HELPER_PACKAGE + ".RemoteAccessibilityService";
    private static final String DOWNLOAD_URL = "https://bmsupport.uk/api/public/remote-helper-apk";
    private final ExecutorService io = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void status(PluginCall call) {
        Context ctx = getContext();
        JSObject res = new JSObject();
        String version = null;
        try {
            PackageInfo info = ctx.getPackageManager().getPackageInfo(HELPER_PACKAGE, 0);
            version = info.versionName;
        } catch (PackageManager.NameNotFoundException ignored) { }
        res.put("installed", version != null);
        res.put("version", version);
        res.put("canInstall", Build.VERSION.SDK_INT < 26 || ctx.getPackageManager().canRequestPackageInstalls());
        String enabled = Settings.Secure.getString(ctx.getContentResolver(), Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
        res.put("accessibilityOn", enabled != null && enabled.contains(HELPER_PACKAGE));
        res.put("sdk", Build.VERSION.SDK_INT);
        call.resolve(res);
    }

    @PluginMethod
    public void allowInstalls(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 26) {
            Intent i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            try { getContext().startActivity(i); } catch (Exception e) {
                openSecuritySettings();
            }
        }
        call.resolve();
    }

    @PluginMethod
    public void install(PluginCall call) {
        Context ctx = getContext();
        if (Build.VERSION.SDK_INT >= 26 && !ctx.getPackageManager().canRequestPackageInstalls()) {
            call.reject("NEEDS_PERMISSION");
            return;
        }
        io.execute(() -> {
            HttpURLConnection conn = null;
            PackageInstaller.Session session = null;
            try {
                conn = (HttpURLConnection) new URL(DOWNLOAD_URL).openConnection();
                conn.setConnectTimeout(20000);
                conn.setReadTimeout(60000);
                conn.setInstanceFollowRedirects(true);
                int code = conn.getResponseCode();
                if (code != 200) throw new IllegalStateException("Download failed (" + code + ")");
                long length = conn.getContentLengthLong();

                PackageInstaller installer = ctx.getPackageManager().getPackageInstaller();
                PackageInstaller.SessionParams params =
                        new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
                params.setAppPackageName(HELPER_PACKAGE);
                if (Build.VERSION.SDK_INT >= 33) {
                    params.setPackageSource(PackageInstaller.PACKAGE_SOURCE_STORE);
                }
                if (Build.VERSION.SDK_INT >= 31) {
                    params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED);
                }
                int sessionId = installer.createSession(params);
                session = installer.openSession(sessionId);

                try (InputStream in = conn.getInputStream();
                     OutputStream out = session.openWrite("remote-helper.apk", 0, length > 0 ? length : -1)) {
                    byte[] buf = new byte[64 * 1024];
                    int n;
                    while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                    session.fsync(out);
                }

                Intent statusIntent = new Intent(ctx, RemoteHelperInstallReceiver.class);
                int flags = PendingIntent.FLAG_UPDATE_CURRENT;
                if (Build.VERSION.SDK_INT >= 31) flags |= PendingIntent.FLAG_MUTABLE;
                PendingIntent pi = PendingIntent.getBroadcast(ctx, sessionId, statusIntent, flags);
                session.commit(pi.getIntentSender());
                session.close();
                session = null;
                call.resolve();
            } catch (Exception e) {
                if (session != null) session.abandon();
                call.reject(e.getMessage() != null ? e.getMessage() : "Install failed");
            } finally {
                if (conn != null) conn.disconnect();
            }
        });
    }

    @PluginMethod
    public void openAccessibility(PluginCall call) {
        Intent i = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try { getContext().startActivity(i); } catch (Exception e) { openSecuritySettings(); }
        call.resolve();
    }

    @PluginMethod
    public void openHelper(PluginCall call) {
        Intent i = getContext().getPackageManager().getLeanbackLaunchIntentForPackage(HELPER_PACKAGE);
        if (i == null) i = getContext().getPackageManager().getLaunchIntentForPackage(HELPER_PACKAGE);
        if (i == null) { call.reject("NOT_INSTALLED"); return; }
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
        call.resolve();
    }

    private void openSecuritySettings() {
        Intent i = new Intent(Settings.ACTION_SETTINGS);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try { getContext().startActivity(i); } catch (Exception ignored) { }
    }
}
