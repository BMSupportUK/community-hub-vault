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
 * connect to the TV's Wi-Fi debugging, install BM Remote Control from the helper's
 * exported copy, then switch its accessibility service on.
 */
final class Enabler {
    static final String CONTROL = "uk.bmsupport.remote.control";
    static final String HELPER = "uk.bmsupport.remote";

    interface Progress { void step(int index, String text); }

    /** What the TV really has, read over ADB — sent to the website so customers can't just tick steps. */
    static final class Checks { boolean adb, helper, control, accessibility; }

    static Checks enable(Context ctx, String host, Progress p) throws Exception {
        Checks c = new Checks();
        p.step(0, "Connecting to the TV…");
        p.step(1, "Look at the TV: tick Always allow, then press Allow. No box on the TV? Switch debugging off and on again on the TV and keep watching.");
        KeyPair kp = keys(ctx);
        try (AdbClient adb = AdbClient.connect(host, 5555, kp, keyLine(kp))) {
            c.adb = true;
            c.helper = adb.shell("pm path " + HELPER).contains("package:");
            if (!c.helper) {
                p.step(2, "Installing BM Remote Helper on the TV…");
                File apk = downloadHelper(ctx);
                try {
                    adb.push(apk, "/data/local/tmp/bm-helper.apk");
                    String res = adb.shell("pm install -r -d /data/local/tmp/bm-helper.apk");
                    adb.shell("rm -f /data/local/tmp/bm-helper.apk");
                    if (!res.contains("Success"))
                        throw new IllegalStateException("The TV couldn't install BM Remote Helper. (" + res.trim() + ")");
                } finally { apk.delete(); }
                c.helper = adb.shell("pm path " + HELPER).contains("package:");
                if (!c.helper) throw new IllegalStateException("BM Remote Helper didn't install on the TV. Try again.");
            }
            p.step(2, "Opening BM Remote Helper on the TV…");
            adb.shell("monkey -p " + HELPER + " -c android.intent.category.LAUNCHER 1");
            String installed = adb.shell("pm path " + CONTROL);
            if (!installed.contains("package:")) {
                p.step(3, "Installing remote control on the TV…");
                String src = "/sdcard/Android/data/" + HELPER + "/files/control.apk";
                waitForExport(adb, src);
                String apk = "/data/local/tmp/bm-control.apk";
                adb.shell("cp " + src + " " + apk + " && chmod 644 " + apk);
                String res = adb.shell("pm install -r -d " + apk);
                adb.shell("rm -f " + apk);
                if (!res.contains("Success"))
                    throw new IllegalStateException("The TV couldn't install remote control. Open BM Remote Helper on the TV once, then try again. (" + res.trim() + ")");
            }
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
            try { adb.shell("monkey -p " + HELPER + " -c android.intent.category.LAUNCHER 1"); } catch (Exception ignored) { }
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

    /** BM Remote Helper exports control.apk when it first runs; wait for that file to appear. */
    private static void waitForExport(AdbClient adb, String path) throws Exception {
        for (int i = 0; i < 15; i++) {
            if (adb.shell("ls " + path).contains("control.apk")) return;
            Thread.sleep(2000);
        }
        throw new IllegalStateException("BM Remote Helper didn't get ready on the TV. Open it on the TV once, then press Try again.");
    }

    /** Sends the checks to bmsupport.uk against the customer's ticket setup code. Returns an error message or null. */
    static String report(String setupCode, Checks c, String device) {
        try {
            java.net.HttpURLConnection h = (java.net.HttpURLConnection) new java.net.URL("https://bmsupport.uk/api/public/remote-setup").openConnection();
            h.setRequestMethod("POST"); h.setDoOutput(true); h.setConnectTimeout(15000); h.setReadTimeout(15000);
            h.setRequestProperty("Content-Type", "application/json");
            String body = "{\"code\":\"" + setupCode + "\",\"app\":\"tv-enabler-1.6\",\"device\":\"" + device + "\",\"checks\":{\"adb\":" + c.adb + ",\"helper\":" + c.helper
                    + ",\"control\":" + c.control + ",\"accessibility\":" + c.accessibility + "}}";
            try (java.io.OutputStream o = h.getOutputStream()) { o.write(body.getBytes(StandardCharsets.UTF_8)); }
            int code = h.getResponseCode(); h.disconnect();
            if (code == 200) return null;
            if (code == 404) return "That setup code isn't valid. Check the code on your support ticket's Remote setup tab.";
            if (code == 409) return "Your ticket is set up for the other TV type. Press Change device on the ticket's Remote setup tab, or pick the other TV type in this app.";
            if (code == 429) return "Too many tries. Wait 15 minutes.";
            return "Couldn't tell BM Support (error " + code + "). Try again.";
        } catch (Exception e) { return "Couldn't reach BM Support. Check the phone's internet and try again."; }
    }

    static String friendly(Exception e) {
        if (e instanceof AdbClient.NotReachable)
            return "Couldn't find the TV at that address. Check the address matches the TV, that debugging is ON on the TV (ADB debugging on Fire TV, Network debugging on Android / Google TV), and that this phone is on the same Wi-Fi as the TV — not mobile data or a guest network.";
        if (e instanceof AdbClient.NotAuthorized)
            return "The TV never showed its Allow box, or it wasn't pressed. On the TV: switch debugging OFF and back ON, keep the TV awake on its home screen, then press Try again and watch the TV for the Allow box.";
        if (e instanceof java.net.SocketTimeoutException) return "The TV stopped answering. Press Try again, then press Allow on the TV.";
        if (e instanceof java.net.ConnectException || e instanceof java.net.NoRouteToHostException)
            return "Couldn't reach the TV. Check the address, that this phone is on the same Wi-Fi as the TV, and that debugging is ON on the TV (ADB debugging on Fire TV, Network debugging on Android / Google TV).";
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
