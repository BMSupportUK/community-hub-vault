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

    static void enable(Context ctx, String host, Progress p) throws Exception {
        p.step(0, "Connecting to the TV…");
        p.step(1, "Look at the TV: tick Always allow, then press Allow.");
        KeyPair kp = keys(ctx);
        try (AdbClient adb = AdbClient.connect(host, 5555, kp, keyLine(kp))) {
            String installed = adb.shell("pm path " + CONTROL);
            if (!installed.contains("package:")) {
                p.step(2, "Installing remote control on the TV…");
                String src = "/sdcard/Android/data/" + HELPER + "/files/control.apk";
                String apk = "/data/local/tmp/bm-control.apk";
                adb.shell("cp " + src + " " + apk + " && chmod 644 " + apk);
                String res = adb.shell("pm install -r -d " + apk);
                adb.shell("rm -f " + apk);
                if (!res.contains("Success"))
                    throw new IllegalStateException("The TV couldn't install remote control. Open BM Remote Helper on the TV once, then try again. (" + res.trim() + ")");
            }
            p.step(3, "Switching remote control on…");
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
        }
    }

    static String friendly(Exception e) {
        if (e instanceof java.net.SocketTimeoutException) return "Nobody pressed Allow on the TV in time. Press Try again, then press Allow on the TV.";
        if (e instanceof java.net.ConnectException || e instanceof java.net.NoRouteToHostException)
            return "Couldn't reach the TV. Check the address, that this phone is on the same Wi-Fi as the TV, and that ADB debugging is ON on the TV.";
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
