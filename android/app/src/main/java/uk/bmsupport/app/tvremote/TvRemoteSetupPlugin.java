package uk.bmsupport.app.tvremote;

import android.content.Context;
import android.net.wifi.WifiManager;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.interfaces.RSAPublicKey;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.X509EncodedKeySpec;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Switches BM Remote Control on for a TV on the same Wi-Fi, from the BM Support phone app.
 * Needed for Fire TV, which no longer lets an app on the TV open the TV's own debugging.
 */
@CapacitorPlugin(name = "TvRemoteSetup")
public class TvRemoteSetupPlugin extends Plugin {
    private static final String CONTROL = "uk.bmsupport.remote.control";
    private static final String HELPER = "uk.bmsupport.remote";
    private final ExecutorService io = Executors.newSingleThreadExecutor();

    /**
     * Find-my-TV scan, moved over from the old standalone BM TV Enabler app:
     * read-only DIAL/UPnP discovery of Fire TVs on the phone's Wi-Fi, never
     * touching ADB or the TV.
     */
    @PluginMethod
    public void discover(PluginCall call) {
        WifiManager wm = (WifiManager) getContext().getApplicationContext().getSystemService(Context.WIFI_SERVICE);
        int ip = wm == null ? 0 : wm.getConnectionInfo().getIpAddress();
        if (ip == 0) { call.reject("Connect this phone to your home Wi-Fi first."); return; }
        String base = (ip & 0xff) + "." + ((ip >> 8) & 0xff) + "." + ((ip >> 16) & 0xff) + ".";
        io.execute(() -> {
            WifiManager.MulticastLock lock = wm.createMulticastLock("bm-fire-tv-discovery");
            lock.setReferenceCounted(false);
            try {
                lock.acquire();
                List<DiscoveredDevice> devices = DeviceDiscovery.scan(base);
                JSArray arr = new JSArray();
                for (DiscoveredDevice d : devices) {
                    JSObject o = new JSObject();
                    o.put("address", d.address);
                    o.put("name", d.name);
                    o.put("debuggingReachable", d.debuggingReachable);
                    arr.put(o);
                }
                call.resolve(new JSObject().put("devices", arr));
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                call.reject("Search stopped. Try again or type the TV address.");
            } catch (Exception e) {
                call.reject("Couldn't search this Wi-Fi. Try again or type the TV address.");
            } finally { if (lock.isHeld()) lock.release(); }
        });
    }

    @PluginMethod
    public void enable(PluginCall call) {
        String host = call.getString("host", "").trim();
        if (!host.matches("^\\d{1,3}(\\.\\d{1,3}){3}$")) { call.reject("Enter the TV's address exactly as it shows on the TV, e.g. 192.168.1.23"); return; }
        io.execute(() -> {
            KeyPair kp;
            try (AdbClient adb = AdbClient.connect(host, 5555, kp = keys(getContext()), keyLine(kp))) {
                notifyListeners("progress", new JSObject().put("step", "Connected. Switching remote control on…"));
                String installed = adb.shell("pm path " + CONTROL);
                if (!installed.contains("package:")) {
                    notifyListeners("progress", new JSObject().put("step", "Installing remote control on the TV…"));
                    String src = "/sdcard/Android/data/" + HELPER + "/files/control.apk";
                    String apk = "/data/local/tmp/bm-control.apk";
                    // Fire OS's installer can't read /sdcard directly; copy to /data/local/tmp first.
                    adb.shell("cp " + src + " " + apk + " && chmod 644 " + apk);
                    String res = adb.shell("pm install -r -d " + apk);
                    adb.shell("rm -f " + apk);
                    if (!res.contains("Success")) {
                        call.reject("The TV couldn't install remote control. Open BM Remote Helper on the TV once, then try again. (" + res.trim() + ")");
                        return;
                    }
                }
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
                String saved = adb.shell("settings get secure enabled_accessibility_services");
                if (!saved.contains(CONTROL + "/")) { call.reject("The TV refused to switch remote control on."); return; }
                // Real TV state, reported to the website so ticket setup steps can't just be ticked.
                JSObject checks = new JSObject();
                checks.put("adb", true);
                checks.put("helper", adb.shell("pm path " + HELPER).contains("package:"));
                checks.put("control", adb.shell("pm path " + CONTROL).contains("package:"));
                checks.put("accessibility", saved.contains(CONTROL + "/") && adb.shell("settings get secure accessibility_enabled").trim().equals("1"));
                call.resolve(new JSObject().put("ok", true).put("checks", checks));
            } catch (java.net.SocketTimeoutException e) {
                call.reject("Nobody pressed Allow on the TV in time. Try again and press Allow on the TV.");
            } catch (java.net.ConnectException | java.net.NoRouteToHostException e) {
                call.reject("Couldn't reach the TV. Check the address, that the phone is on the same Wi-Fi, and ADB debugging is ON on the TV.");
            } catch (Exception e) {
                call.reject("Couldn't switch remote control on: " + e.getMessage());
            }
        });
    }

    private static KeyPair keys(Context ctx) throws Exception {
        File dir = new File(ctx.getFilesDir(), "tvadb"); dir.mkdirs();
        File priv = new File(dir, "key.pk8"), pub = new File(dir, "key.x509");
        KeyFactory kf = KeyFactory.getInstance("RSA");
        if (priv.exists() && pub.exists()) {
            PrivateKey p = kf.generatePrivate(new PKCS8EncodedKeySpec(readAll(priv)));
            PublicKey q = kf.generatePublic(new X509EncodedKeySpec(readAll(pub)));
            return new KeyPair(q, p);
        }
        KeyPairGenerator g = KeyPairGenerator.getInstance("RSA"); g.initialize(2048);
        KeyPair kp = g.genKeyPair();
        writeAll(priv, kp.getPrivate().getEncoded());
        writeAll(pub, kp.getPublic().getEncoded());
        return kp;
    }

    private static byte[] keyLine(KeyPair kp) {
        String b64 = android.util.Base64.encodeToString(AdbClient.publicKey((RSAPublicKey) kp.getPublic()), android.util.Base64.NO_WRAP);
        return (b64 + " bm-support-phone\0").getBytes(StandardCharsets.UTF_8);
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
