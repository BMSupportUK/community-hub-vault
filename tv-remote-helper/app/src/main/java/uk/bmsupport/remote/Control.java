package uk.bmsupport.remote;

import android.accessibilityservice.AccessibilityServiceInfo;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageInstaller;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.util.Base64;
import android.view.accessibility.AccessibilityManager;
import dadb.AdbKeyPair;
import dadb.AdbStream;
import dadb.Dadb;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.math.BigInteger;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.NetworkInterface;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.PrivateKey;
import java.security.interfaces.RSAPublicKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONObject;

/** Everything to do with the companion BM Remote Control app (uk.bmsupport.remote.control). */
public final class Control {
    public static final Control INSTANCE = new Control();
    public static final String PKG = "uk.bmsupport.remote.control";
    private static volatile String installMessage;

    private Control() {}

    public static final class FireSetupError extends Exception {
        public FireSetupError(String msg) {
            super(msg);
        }
    }

    public interface Step {
        void call(String progress);
    }

    public String getInstallMessage() {
        return installMessage;
    }

    public void setInstallMessage(String msg) {
        installMessage = msg;
    }

    public boolean isFireTv(Context ctx) {
        return "Amazon".equalsIgnoreCase(Build.MANUFACTURER)
                || ctx.getPackageManager().hasSystemFeature("amazon.hardware.fire_tv");
    }

    public Long installedVersion(Context ctx) {
        try {
            PackageInfo pi = ctx.getPackageManager().getPackageInfo(PKG, 0);
            return Build.VERSION.SDK_INT >= 28 ? pi.getLongVersionCode() : (long) pi.versionCode;
        } catch (Throwable t) {
            return null;
        }
    }

    public boolean needsInstall(Context ctx) {
        Long v = installedVersion(ctx);
        return (v == null ? -1L : v) < BuildConfig.CONTROL_VERSION;
    }

    public boolean listed(Context ctx) {
        String enabled;
        try {
            enabled = Settings.Secure.getString(ctx.getContentResolver(), "enabled_accessibility_services");
        } catch (Throwable t) {
            return false;
        }
        if (enabled == null) return false;
        for (String entry : enabled.split(":")) {
            if (entry.trim().startsWith(PKG + "/")) return true;
        }
        return false;
    }

    public boolean running(Context ctx) {
        try {
            AccessibilityManager am = (AccessibilityManager) ctx.getSystemService(Context.ACCESSIBILITY_SERVICE);
            for (AccessibilityServiceInfo info : am.getEnabledAccessibilityServiceList(-1)) {
                ResolveInfo ri = info.getResolveInfo();
                if (ri != null && ri.serviceInfo != null && PKG.equals(ri.serviceInfo.packageName)) return true;
            }
        } catch (Throwable ignore) {
        }
        return false;
    }

    public boolean enabled(Context ctx) {
        return running(ctx) || listed(ctx);
    }

    private SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences("control", Context.MODE_PRIVATE);
    }

    public String lastError(Context ctx) {
        return prefs(ctx).getString("error", null);
    }

    public void setLastError(Context ctx, String msg) {
        prefs(ctx).edit().putString("error", msg).apply();
    }

    public boolean adbAuthorised(Context ctx) {
        return prefs(ctx).getBoolean("adb_ok", false);
    }

    public boolean adbEnabled(Context ctx) {
        try {
            return Settings.Global.getInt(ctx.getContentResolver(), Settings.Global.ADB_ENABLED, 0) == 1;
        } catch (Throwable t) {
            return false;
        }
    }

    public boolean canInstall(Context ctx) {
        return Build.VERSION.SDK_INT < 26 || ctx.getPackageManager().canRequestPackageInstalls();
    }

    public Intent unknownSourcesIntent(Context ctx) {
        return new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + ctx.getPackageName()));
    }

    public Intent accessibilityIntent() {
        return new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    }

    /** Installs the bundled control app through the package installer (customer presses Install). */
    public void install(Context ctx) throws Exception {
        installMessage = null;
        PackageInstaller installer = ctx.getPackageManager().getPackageInstaller();
        PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
        params.setAppPackageName(PKG);
        int sessionId = installer.createSession(params);
        PackageInstaller.Session session = installer.openSession(sessionId);
        try (InputStream in = ctx.getAssets().open("control.apk");
             OutputStream out = session.openWrite("control", 0, -1)) {
            byte[] buf = new byte[65536];
            int n;
            while ((n = in.read(buf)) != -1) out.write(buf, 0, n);
            session.fsync(out);
        }
        int flags = 134217728 | (Build.VERSION.SDK_INT >= 31 ? 33554432 : 0);
        Intent statusIntent = new Intent(ctx, InstallReceiver.class);
        session.commit(android.app.PendingIntent.getBroadcast(ctx, sessionId, statusIntent, flags).getIntentSender());
        session.close();
    }

    /** Sends a command to the control app: type is key/text/clear/launch, value the detail. */
    public void send(Context ctx, String type, String value) {
        Intent i = new Intent("uk.bmsupport.remote.control.COMMAND")
                .setPackage(PKG)
                .addFlags(0x20) // FLAG_INCLUDE_STOPPED_PACKAGES
                .putExtra("type", type);
        if (value != null) i.putExtra("value", value);
        ctx.sendBroadcast(i);
    }

    /** Launcher-visible apps on the TV (label + package), for the staff app launcher. */
    public JSONArray apps(Context ctx) {
        PackageManager pm = ctx.getPackageManager();
        Map<String, String> found = new LinkedHashMap<>();
        for (String category : new String[]{"android.intent.category.LEANBACK_LAUNCHER", "android.intent.category.LAUNCHER"}) {
            Intent intent = new Intent(Intent.ACTION_MAIN).addCategory(category);
            List<ResolveInfo> list;
            try {
                list = pm.queryIntentActivities(intent, 0);
            } catch (Throwable t) {
                list = Collections.emptyList();
            }
            for (ResolveInfo ri : list) {
                String pkg = ri.activityInfo.packageName;
                if (!found.containsKey(pkg)) found.put(pkg, ri.loadLabel(pm).toString());
            }
        }
        List<Map.Entry<String, String>> entries = new ArrayList<>(found.entrySet());
        entries.sort(Comparator.comparing(e -> e.getValue().toLowerCase(Locale.ROOT)));
        JSONArray out = new JSONArray();
        for (Map.Entry<String, String> e : entries.subList(0, Math.min(80, entries.size()))) {
            out.put(new JSONObject().put("pkg", e.getKey()).put("label", e.getValue()));
        }
        return out;
    }

    /** Control-app state reported to staff over the realtime topic. */
    public JSONObject state(Context ctx, boolean withApps) {
        boolean fire = isFireTv(ctx);
        boolean needsInstall = needsInstall(ctx);
        boolean running = running(ctx);
        boolean listed = listed(ctx);
        boolean on = !needsInstall && (running || listed);
        Long v = installedVersion(ctx);
        JSONObject out = new JSONObject()
                .put("fire", fire)
                .put("installed", !needsInstall)
                .put("enabled", on)
                .put("running", running)
                .put("listed", listed)
                .put("adb", adbEnabled(ctx))
                .put("helper", BuildConfig.VERSION_NAME)
                .put("controlVersion", v == null ? -1L : v)
                .put("error", lastError(ctx) == null ? JSONObject.NULL : lastError(ctx))
                .put("fireSetupNeeded", fire && !on);
        if (on && withApps) out.put("apps", apps(ctx));
        return out;
    }

    /** Copies the bundled control app to the app's external files dir (legacy pull path for phones). */
    public void exportControlApk(Context ctx) {
        try {
            File dir = ctx.getExternalFilesDir(null);
            if (dir == null) return;
            File out = new File(dir, "control.apk");
            try (InputStream in = ctx.getAssets().open("control.apk");
                 FileOutputStream fos = new FileOutputStream(out)) {
                byte[] buf = new byte[65536];
                int n;
                while ((n = in.read(buf)) != -1) fos.write(buf, 0, n);
            }
        } catch (Throwable ignore) {
        }
    }

    public List<String> allIps(Context ctx) {
        LinkedHashSet<String> out = new LinkedHashSet<>();
        try {
            List<NetworkInterface> ifaces = Collections.list(NetworkInterface.getNetworkInterfaces());
            List<NetworkInterface> up = new ArrayList<>();
            for (NetworkInterface ni : ifaces) {
                try {
                    if (ni.isUp() && !ni.isLoopback() && !ni.isVirtual()) up.add(ni);
                } catch (Throwable ignore) {
                }
            }
            up.sort(Comparator.comparingInt(ni -> {
                String name = ni.getName().toLowerCase(Locale.ROOT);
                return name.startsWith("eth") ? 0 : name.startsWith("wlan") ? 1 : 2;
            }));
            for (NetworkInterface ni : up) {
                for (InetAddress addr : Collections.list(ni.getInetAddresses())) {
                    if (addr instanceof Inet4Address && addr.getHostAddress() != null) out.add(addr.getHostAddress());
                }
            }
        } catch (Throwable ignore) {
        }
        return new ArrayList<>(out);
    }

    public String wifiIp(Context ctx) {
        List<String> ips = allIps(ctx);
        return ips.isEmpty() ? null : ips.get(0);
    }

    // ============= Fire TV self-setup over local ADB =============

    /** Enables the control app on a Fire TV by talking to its own ADB daemon. */
    public void enableViaAdb(Context ctx, Step step) throws Exception {
        step.call("Finding this TV on the network…");
        List<String> hosts = adbHosts(ctx);
        if (hosts.isEmpty()) throw new FireSetupError("No network address found - check the TV is online, then press Check again.");
        step.call("Connecting to this TV…");
        Dadb adb = connect(ctx, hosts);
        try {
            step.call("Installing remote control…");
            installViaAdb(ctx, adb);
            step.call("Switching on remote control…");
            sh(adb, "settings put secure enabled_accessibility_services uk.bmsupport.remote.control/uk.bmsupport.remote.control.ControlService");
            sh(adb, "settings put secure accessibility_enabled 1");
            step.call("Finishing up…");
            for (int i = 0; i < 20 && !enabled(ctx); i++) Thread.sleep(500L);
            if (!enabled(ctx)) throw new FireSetupError("Remote control is not on yet. Press Turn on remote control again.");
        } finally {
            try {
                adb.close();
            } catch (Throwable ignore) {
            }
        }
    }

    private List<String> adbHosts(Context ctx) {
        LinkedHashSet<String> all = new LinkedHashSet<>();
        all.add("127.0.0.1");
        all.addAll(allIps(ctx));
        List<String> reachable = new ArrayList<>();
        for (String host : all) {
            try {
                Socket socket = new Socket();
                try {
                    socket.connect(new InetSocketAddress(host, 5555), 3000);
                    reachable.add(host);
                } finally {
                    try {
                        socket.close();
                    } catch (Throwable ignore) {
                    }
                }
            } catch (Throwable ignore) {
            }
        }
        return reachable;
    }

    private Dadb connect(Context ctx, List<String> hosts) throws Exception {
        Exception last = null;
        for (int attempt = 0; attempt < 2; attempt++) {
            AdbKeyPair keys = adbKeys(ctx, attempt > 0);
            for (String host : hosts) {
                Dadb adb = null;
                try {
                    adb = Dadb.Companion.create(host, 5555, keys, 5000, 120000, false);
                    adb.supportsFeature("shell_v2");
                    prefs(ctx).edit().putBoolean("adb_ok", true).apply();
                    return adb;
                } catch (SocketTimeoutException e) {
                    last = e;
                    if (adb != null) try {
                        adb.close();
                    } catch (Throwable ignore) {
                    }
                } catch (Exception e) {
                    last = e;
                    if (adb != null) try {
                        adb.close();
                    } catch (Throwable ignore) {
                    }
                    break; // auth or protocol problem: retry once with fresh keys
                }
            }
        }
        throw new FireSetupError("Could not connect to this TV. If an \"Allow debugging?\" box is showing, press Allow, then press Turn on remote control again."
                + (last == null ? "" : " (" + last.getClass().getSimpleName() + ")"));
    }

    private void installViaAdb(Context ctx, Dadb adb) throws Exception {
        File file = new File(ctx.getCacheDir(), "control.apk");
        try (InputStream in = ctx.getAssets().open("control.apk");
             FileOutputStream fos = new FileOutputStream(file)) {
            byte[] buf = new byte[65536];
            int n;
            while ((n = in.read(buf)) != -1) fos.write(buf, 0, n);
        }
        try {
            adb.push(file, "/data/local/tmp/bm-remote-control.apk", 0, 0L);
            String result = sh(adb, "pm install -r -d /data/local/tmp/bm-remote-control.apk");
            sh(adb, "rm -f /data/local/tmp/bm-remote-control.apk");
            if (result == null || !result.contains("Success")) {
                String detail = result == null ? "no answer" : result.trim();
                throw new FireSetupError("The TV wouldn't install remote control: "
                        + detail.substring(0, Math.min(160, detail.length())));
            }
            for (int i = 0; i < 10 && needsInstall(ctx); i++) Thread.sleep(300L);
        } catch (FireSetupError e) {
            throw e;
        } catch (Exception e) {
            throw new FireSetupError("Couldn't copy remote control to the TV (" + e.getMessage() + "). Press Turn on remote control again.");
        }
    }

    private String sh(Dadb adb, String cmd) {
        try {
            AdbStream stream = adb.open("shell:" + cmd);
            try {
                return stream.getSource().readUtf8();
            } finally {
                stream.close();
            }
        } catch (Throwable t) {
            try {
                AdbStream stream = adb.open("exec:" + cmd);
                try {
                    return stream.getSource().readUtf8();
                } finally {
                    stream.close();
                }
            } catch (Throwable t2) {
                return null;
            }
        }
    }

    private AdbKeyPair adbKeys(Context ctx, boolean fresh) throws Exception {
        File dir = new File(ctx.getFilesDir(), "adb2");
        dir.mkdirs();
        File privFile = new File(dir, "key.pk8");
        File pubFile = new File(dir, "key.pub");
        if (fresh) {
            privFile.delete();
            pubFile.delete();
        }
        if (!privFile.exists() || !pubFile.exists()) {
            KeyPairGenerator gen = KeyPairGenerator.getInstance("RSA");
            gen.initialize(2048);
            KeyPair pair = gen.genKeyPair();
            writeBytes(privFile, pair.getPrivate().getEncoded());
            String pub = Base64.encodeToString(adbPublicKey((RSAPublicKey) pair.getPublic()), Base64.NO_WRAP) + " bm-remote-helper@tv";
            writeBytes(pubFile, pub.getBytes("UTF-8"));
        }
        PrivateKey priv = KeyFactory.getInstance("RSA").generatePrivate(new PKCS8EncodedKeySpec(readBytes(privFile)));
        byte[] pub = readBytes(pubFile);
        return new AdbKeyPair(priv, Arrays.copyOf(pub, pub.length + 1));
    }

    /** ADB's RSA public key wire format: 524-byte little-endian struct. */
    private static byte[] adbPublicKey(RSAPublicKey k) {
        BigInteger r32 = BigInteger.ZERO.setBit(32);
        BigInteger n = k.getModulus();
        BigInteger rr = BigInteger.ZERO.setBit(2048).modPow(BigInteger.valueOf(2L), n);
        BigInteger n0inv = n.remainder(r32).modInverse(r32);
        int[] nWords = new int[64];
        int[] rrWords = new int[64];
        for (int i = 0; i < 64; i++) {
            BigInteger[] dr = rr.divideAndRemainder(r32);
            rrWords[i] = dr[1].intValue();
            rr = dr[0];
            BigInteger[] dn = n.divideAndRemainder(r32);
            nWords[i] = dn[1].intValue();
            n = dn[0];
        }
        ByteBuffer buf = ByteBuffer.allocate(524).order(ByteOrder.LITTLE_ENDIAN);
        buf.putInt(64);
        buf.putInt(n0inv.negate().intValue());
        for (int w : nWords) buf.putInt(w);
        for (int w : rrWords) buf.putInt(w);
        buf.putInt(k.getPublicExponent().intValue());
        return buf.array();
    }

    private static void writeBytes(File f, byte[] data) throws Exception {
        try (FileOutputStream fos = new FileOutputStream(f)) {
            fos.write(data);
        }
    }

    private static byte[] readBytes(File f) throws Exception {
        byte[] data = new byte[(int) f.length()];
        try (java.io.FileInputStream fis = new java.io.FileInputStream(f)) {
            int off = 0;
            while (off < data.length) {
                int n = fis.read(data, off, data.length - off);
                if (n < 0) break;
                off += n;
            }
        }
        return data;
    }
}
