package uk.bmsupport.tvenabler;

import android.content.Context;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.interfaces.RSAPublicKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.X509EncodedKeySpec;

/**
 * Same steps as the BM Support app's Settings › TV remote (TvRemoteSetupPlugin):
 * connect to the TV's Wi-Fi debugging, push the helper's bundled control APK from
 * the phone, then switch its accessibility service on.
 */
final class Enabler {
    static final String CONTROL = "uk.bmsupport.remote.control";
    static final String HELPER = "uk.bmsupport.remote";

    interface Progress { void step(int index, String text); }

    /** What the TV really has, read over ADB — sent to the website so customers can't just tick steps. */
    static final class Checks { boolean adb, helper, control, accessibility; }

    static Checks enable(Context ctx, String host, Progress p) throws Exception {
        return enableUntil(ctx, host, 4, p);
    }

    /** Read-only readiness check; only launch the code app when every check passes. */
    static Checks checkExisting(Context ctx, String host, Progress p) throws Exception {
        p.step(0, "Checking this TV's installed apps and remote-control permissions…");
        p.step(1, "If the TV asks, tick Always allow and press Allow. Keep this phone app open.");
        KeyPair kp = keys(ctx);
        try (AdbClient adb = AdbClient.connect(host, 5555, kp, keyLine(kp))) {
            Checks c = readChecks(adb);
            if (SetupWizard.ready(c.adb, c.helper, c.control, c.accessibility)) {
                p.step(5, "This TV is already set up. Opening BM Remote Helper to show your code…");
                openHelper(adb);
            }
            return c;
        }
    }

    private static Checks readChecks(AdbClient adb) throws Exception {
        Checks c = new Checks(); c.adb = true;
        c.helper = adb.shell("pm path " + HELPER).contains("package:");
        c.control = adb.shell("pm path " + CONTROL).contains("package:");
        c.accessibility = adb.shell("settings get secure enabled_accessibility_services").contains(CONTROL + "/")
                && adb.shell("settings get secure accessibility_enabled").trim().equals("1");
        return c;
    }

    /** Opens BM Remote Helper on the TV so it shows a fresh six-digit screen-share code. */
    static void openCodeApp(Context ctx, String host) throws Exception {
        KeyPair kp = keys(ctx);
        try (AdbClient adb = AdbClient.connect(host, 5555, kp, keyLine(kp))) { openHelper(adb); }
    }

    private static void openHelper(AdbClient adb) throws Exception {
        String result = adb.shell("monkey -p " + HELPER + " -c android.intent.category.LAUNCHER 1");
        if (!result.contains("Events injected: 1"))
            throw new IllegalStateException("Couldn't open BM Remote Helper. Open it on the TV to see your code, then try again.");
    }

    /** Staged wizard uses the proven install path, stopping before the next customer confirmation. */
    static Checks enableUntil(Context ctx, String host, int stopAfter, Progress p) throws Exception {
        Checks c = new Checks();
        p.step(0, "Connecting to the TV…");
        p.step(1, "Look at the TV: tick Always allow, then press Allow. No box on the TV? Switch debugging off and on again on the TV and keep watching.");
        KeyPair kp = keys(ctx);
        try (AdbClient adb = AdbClient.connect(host, 5555, kp, keyLine(kp))) {
            c.adb = true;
            c.helper = adb.shell("pm path " + HELPER).contains("package:");
            boolean needControl = !adb.shell("pm path " + CONTROL).contains("package:");
            if (!c.helper || (needControl && stopAfter >= 3)) p.step(stopAfter >= 3 && c.helper ? 3 : 2, "Downloading BM Remote Helper and its bundled remote control to this phone…");
            File apk = (!c.helper || (needControl && stopAfter >= 3)) ? downloadHelper(ctx) : null;
            try {
                if (!c.helper) {
                    p.step(2, "Installing BM Remote Helper on the TV…");
                    adb.push(apk, "/data/local/tmp/bm-helper.apk");
                    String res = adb.shell("pm install -r -d /data/local/tmp/bm-helper.apk");
                    adb.shell("rm -f /data/local/tmp/bm-helper.apk");
                    if (!res.contains("Success"))
                        throw new IllegalStateException("The TV couldn't install BM Remote Helper. (" + res.trim() + ")");
                    c.helper = adb.shell("pm path " + HELPER).contains("package:");
                    if (!c.helper) throw new IllegalStateException("BM Remote Helper didn't install on the TV. Try again.");
                }
                p.step(2, "Opening BM Remote Helper on the TV…");
                openHelper(adb);
                if (stopAfter == 2) return readChecks(adb);
                if (needControl) {
                    p.step(3, "Installing remote control on the TV…");
                    // The remote-control app ships inside the helper download (assets/control.apk).
                    // Push it straight from the phone — the TV's shell can't reliably read the
                    // helper's /sdcard/Android/data copy on newer Fire OS ("Unable to open file").
                    File control = extractControl(ctx, apk);
                    try {
                        String dest = "/data/local/tmp/bm-control.apk";
                        adb.push(control, dest);
                        String res = adb.shell("pm install -r -d " + dest);
                        adb.shell("rm -f " + dest);
                        if (!res.contains("Success"))
                            throw new IllegalStateException("The TV couldn't install remote control. Press Try again. (" + res.trim() + ")");
                    } finally { control.delete(); }
                    if (!adb.shell("pm path " + CONTROL).contains("package:"))
                        throw new IllegalStateException("Remote control didn't install on the TV. Press Try again.");
                }
            } finally { if (apk != null) apk.delete(); }
            if (stopAfter == 3) return readChecks(adb);
            p.step(4, "Switching remote control on…");
            String service = CONTROL + "/" + CONTROL + ".ControlService";
            String current = adb.shell("settings get secure enabled_accessibility_services").trim();
            StringBuilder list = new StringBuilder();
            for (String s : current.split(":")) {
                s = s.trim();
                if (s.isEmpty() || s.equals("null") || s.startsWith(CONTROL + "/")) continue;
                if (list.length() > 0) list.append(':');
                list.append(s);
            }
            if (list.length() > 0) list.append(':');
            list.append(service);
            adb.shell("settings put secure enabled_accessibility_services " + list);
            adb.shell("settings put secure accessibility_enabled 0");
            Thread.sleep(300);
            adb.shell("settings put secure accessibility_enabled 1");
            if (!adb.shell("settings get secure enabled_accessibility_services").contains(CONTROL + "/"))
                throw new IllegalStateException("The TV refused to switch remote control on.");
            c.control = adb.shell("pm path " + CONTROL).contains("package:");
            c.accessibility = adb.shell("settings get secure enabled_accessibility_services").contains(CONTROL + "/")
                    && adb.shell("settings get secure accessibility_enabled").trim().equals("1");
            // Leave BM Remote Helper open on the TV so its six-digit code is on screen.
            openHelper(adb);
            if (!SetupWizard.ready(c.adb, c.helper, c.control, c.accessibility))
                throw new IllegalStateException("Remote control isn't fully enabled yet. Press Try again.");
        }
        return c;
    }

    /** Downloads the latest BM Remote Helper APK from bmsupport.uk so the customer never installs it by hand. */
    private static File downloadHelper(Context ctx) throws java.io.IOException {
        File out = new File(ctx.getCacheDir(), "bm-helper.apk");
        java.net.HttpURLConnection h = (java.net.HttpURLConnection) new java.net.URL("https://bmsupport.uk/api/public/remote-helper-apk").openConnection();
        h.setConnectTimeout(15000); h.setReadTimeout(60000); h.setInstanceFollowRedirects(true);
        try (java.io.InputStream in = h.getInputStream(); FileOutputStream o = new FileOutputStream(out)) {
            byte[] buf = new byte[65536]; int r;
            while ((r = in.read(buf)) > 0) o.write(buf, 0, r);
        } finally { h.disconnect(); }
        if (out.length() < 100_000) { out.delete(); throw new java.io.IOException("Couldn't download BM Remote Helper. Check the phone's internet and try again."); }
        return out;
    }

    /** Pulls assets/control.apk out of the downloaded BM Remote Helper APK. */
    private static File extractControl(Context ctx, File helperApk) throws java.io.IOException {
        File out = new File(ctx.getCacheDir(), "bm-control.apk");
        try (java.util.zip.ZipFile z = new java.util.zip.ZipFile(helperApk)) {
            java.util.zip.ZipEntry e = z.getEntry("assets/control.apk");
            if (e == null) throw new IllegalStateException("The BM Remote Helper download is missing remote control. Tell BM Support.");
            try (java.io.InputStream in = z.getInputStream(e); FileOutputStream o = new FileOutputStream(out)) {
                byte[] buf = new byte[65536]; int r;
                while ((r = in.read(buf)) > 0) o.write(buf, 0, r);
            }
        }
        if (out.length() < 10_000) { out.delete(); throw new java.io.IOException("Couldn't unpack remote control. Press Try again."); }
        return out;
    }

    /** Sends the checks to bmsupport.uk against the customer's ticket setup code. Returns an error message or null. */
    static String report(String setupCode, Checks c, String device) {
        try {
            java.net.HttpURLConnection h = (java.net.HttpURLConnection) new java.net.URL("https://bmsupport.uk/api/public/remote-setup").openConnection();
            h.setRequestMethod("POST"); h.setDoOutput(true); h.setConnectTimeout(15000); h.setReadTimeout(15000);
            h.setRequestProperty("Content-Type", "application/json");
            String body = "{\"code\":\"" + setupCode + "\",\"app\":\"tv-enabler-1.12\"," + (device == null ? "" : "\"device\":\"" + device + "\",") + "\"checks\":{\"adb\":" + c.adb + ",\"helper\":" + c.helper
                    + ",\"control\":" + c.control + ",\"accessibility\":" + c.accessibility + "}}";
            try (java.io.OutputStream o = h.getOutputStream()) { o.write(body.getBytes(StandardCharsets.UTF_8)); }
            int code = h.getResponseCode(); h.disconnect();
            if (code == 200) return null;
            if (code == 404) return "That setup code isn't valid. Check the code on your ticket or order's Remote setup tab.";
            if (code == 409) return "Your ticket or order is set up for the other TV type. Press Change device on its Remote setup tab, or pick the other TV type in this app.";
            if (code == 429) return "Too many tries. Wait 15 minutes.";
            return "Couldn't tell BM Support (error " + code + "). Try again.";
        } catch (Exception e) { return "Couldn't reach BM Support. Check the phone's internet and try again."; }
    }

    static String friendly(Exception e) {
        if (e instanceof AdbClient.NotReachable)
            return "Couldn't find the TV at that address. Check the address matches the TV, that debugging is ON on the TV (ADB debugging on Fire TV, Network or Wireless debugging on Android / Google TV), and that this phone is on the same Wi-Fi as the TV — not mobile data or a guest network.";
        if (e instanceof AdbClient.NotAuthorized) {
            if (((AdbClient.NotAuthorized) e).keySent)
                return "The TV was asked to show its Allow box but Allow wasn't pressed. Keep the TV awake on its home screen (not a screensaver or app), press Try again, then tick Always allow and press Allow on the TV. (Detail: " + e.getMessage() + ")";
            return "The TV answered but never asked to let this phone in, so no Allow box could appear. On the TV switch debugging OFF and back ON (or restart the TV), check it's the right TV address, then press Try again. (Detail: " + e.getMessage() + ")";
        }
        if (e instanceof java.net.SocketTimeoutException) return "The TV stopped answering. Press Try again, then press Allow on the TV.";
        if (e instanceof java.net.ConnectException || e instanceof java.net.NoRouteToHostException)
            return "Couldn't reach the TV. Check the address, that this phone is on the same Wi-Fi as the TV, and that debugging is ON on the TV (ADB debugging on Fire TV, Network or Wireless debugging on Android / Google TV).";
        if (e instanceof IllegalStateException) return e.getMessage();
        return "Couldn't switch remote control on: " + e.getMessage();
    }

    private static KeyPair keys(Context ctx) throws Exception {
        File dir = new File(ctx.getFilesDir(), "tvadb"); dir.mkdirs();
        File priv = new File(dir, "key.pk8"), pub = new File(dir, "key.x509");
        KeyFactory kf = KeyFactory.getInstance("RSA");
        if (priv.exists() && pub.exists()) {
            PrivateKey a = kf.generatePrivate(new PKCS8EncodedKeySpec(readAll(priv)));
            PublicKey b = kf.generatePublic(new X509EncodedKeySpec(readAll(pub)));
            return new KeyPair(b, a);
        }
        KeyPairGenerator g = KeyPairGenerator.getInstance("RSA"); g.initialize(2048);
        KeyPair kp = g.genKeyPair();
        writeAll(priv, kp.getPrivate().getEncoded());
        writeAll(pub, kp.getPublic().getEncoded());
        return kp;
    }

    private static byte[] keyLine(KeyPair kp) {
        String b64 = android.util.Base64.encodeToString(AdbClient.publicKey((RSAPublicKey) kp.getPublic()), android.util.Base64.NO_WRAP);
        return (b64 + " bm-tv-enabler\0").getBytes(StandardCharsets.UTF_8);
    }

    private static byte[] readAll(File f) throws Exception {
        try (FileInputStream in = new FileInputStream(f)) {
            byte[] b = new byte[(int) f.length()]; int o = 0, r;
            while (o < b.length && (r = in.read(b, o, b.length - o)) > 0) o += r;
            return b;
        }
    }

    private static void writeAll(File f, byte[] b) throws Exception {
        try (FileOutputStream out = new FileOutputStream(f)) { out.write(b); }
    }
}
