package uk.bmsupport.app.tvremote;

import android.content.Context;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.nio.file.Files;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.X509EncodedKeySpec;
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

    @PluginMethod
    public void enable(PluginCall call) {
        String host = call.getString("host", "").trim();
        if (!host.matches("^\\d{1,3}(\\.\\d{1,3}){3}$")) { call.reject("Enter the TV's address exactly as it shows on the TV, e.g. 192.168.1.23"); return; }
        io.execute(() -> {
            try (AdbClient adb = AdbClient.connect(host, 5555, keys(getContext()), "bm-support-phone")) {
                notifyListeners("progress", new JSObject().put("step", "Connected. Switching remote control on…"));
                String installed = adb.shell("pm path " + CONTROL);
                if (!installed.contains("package:")) {
                    notifyListeners("progress", new JSObject().put("step", "Installing remote control on the TV…"));
                    String apk = "/sdcard/Android/data/" + HELPER + "/files/control.apk";
                    String res = adb.shell("pm install -r -d " + apk);
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
                call.resolve(new JSObject().put("ok", true));
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
            PrivateKey p = kf.generatePrivate(new PKCS8EncodedKeySpec(Files.readAllBytes(priv.toPath())));
            PublicKey q = kf.generatePublic(new X509EncodedKeySpec(Files.readAllBytes(pub.toPath())));
            return new KeyPair(q, p);
        }
        KeyPairGenerator g = KeyPairGenerator.getInstance("RSA"); g.initialize(2048);
        KeyPair kp = g.genKeyPair();
        Files.write(priv.toPath(), kp.getPrivate().getEncoded());
        Files.write(pub.toPath(), kp.getPublic().getEncoded());
        return kp;
    }
}
