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
    static final class Checks { boolean adb, helper, control, accessibility; /** "amazon" or "android", read from the TV itself. */ String type; }

    static Checks enable(Context ctx, String host, Progress p) throws Exception {
        return enableUntil(ctx, host, 4, p);
    }

    /** Read-only readiness check — never opens apps; the wizard opens the code app once itself. */
    static Checks checkExisting(Context ctx, String host, Progress p) throws Exception {
        p.step(0, "Checking this TV's installed apps and remote-control permissions…");
        p.step(1, "If the TV asks, tick Always allow and press Allow. Keep this phone app open.");
        KeyPair kp = keys(ctx);
        try (AdbClient adb = AdbClient.connect(host, 5555, kp, keyLine(kp))) {
            return readChecks(adb);
        }
    }

    private static Checks readChecks(AdbClient adb) throws Exception {
        Checks c = new Checks(); c.adb = true;
        c.type = adb.shell("getprop ro.product.manufacturer").trim().equalsIgnoreCase("Amazon") ? "amazon" : "android";
        c.helper = adb.shell("pm path " + HELPER).contains("package:");
        c.control = adb.shell("pm path " + CONTROL).contains("package:");
        c.accessibility = adb.shell("settings get secure enabled_accessibility_services").contains(CONTROL + "/")
                && adb.shell("settings get secure accessibility_enabled").trim().equals("1");
        return c;
    }

    /** Connects (Allow box on first use) and puts the 4-digit check code on the TV screen. */
    static final String SHOW_CODE = "if [ \"$(getprop ro.product.manufacturer)\" != Amazon ]; then [ -f /data/local/tmp/bm-name ] || settings get global device_name > /data/local/tmp/bm-name; settings put global device_name 'BM TV Enabler code CODE'; am start -a android.settings.DEVICE_INFO_SETTINGS >/dev/null 2>&1; fi";
    /** Puts the TV's own name back after the code check. */
    static final String RESTORE_NAME = "if [ -f /data/local/tmp/bm-name ]; then n=$(cat /data/local/tmp/bm-name); if [ -z \"$n\" ] || [ \"$n\" = null ]; then settings delete global device_name; else settings put global device_name \"$n\"; fi; rm -f /data/local/tmp/bm-name; fi";

    static void showTvCode(Context ctx, String host, String code, Progress p) throws Exception {
        if (!code.matches("\\d{4}")) throw new IllegalArgumentException("bad code");
        p.step(1, "Connecting… If the TV asks, tick Always allow and press Allow.");
        KeyPair kp = keys(ctx);
        try (AdbClient adb = AdbClient.connect(host, 5555, kp, keyLine(kp))) {
            // Pressing Allow on the chosen TV confirms it; just put back any name an older version changed.
            adb.shell(RESTORE_NAME);
        }
    }

    /** Reads the six-digit code BM Remote Helper shows on the TV screen; null when it can't be read. */
    static String readHelperCode(Context ctx, String host) {
        try {
            KeyPair kp = keys(ctx);
            try (AdbClient adb = AdbClient.connect(host, 5555, kp, keyLine(kp))) {
                // Helper must stay on screen: Android only shows its screen-share Allow box while it is in front.
                adb.shell("monkey -p " + HELPER + " -c android.intent.category.LAUNCHER 1");
                Thread.sleep(2500);
                for (int i = 0; i < 6; i++) {
                    String xml = adb.shell("uiautomator dump /data/local/tmp/bm-ui.xml >/dev/null 2>&1; cat /data/local/tmp/bm-ui.xml; rm -f /data/local/tmp/bm-ui.xml");
                    String c = helperCodeFrom(xml);
                    if (c != null) return c;
                    Thread.sleep(1500);
                }
            }
        } catch (Exception ignored) { }
        return null;
    }

    /** Finds a six-digit number in a BM Remote Helper node of a uiautomator dump. */
    static String helperCodeFrom(String xml) {
        if (xml == null) return null;
        java.util.regex.Matcher node = java.util.regex.Pattern.compile("<node [^>]*>").matcher(xml);
        while (node.find()) {
            String n = node.group();
            if (!n.contains("package=\"" + HELPER + "\"")) continue;
            java.util.regex.Matcher t = java.util.regex.Pattern.compile("text=\"([0-9 \\-]{6,11})\"").matcher(n);
            if (!t.find()) continue;
            String digits = t.group(1).replaceAll("[^0-9]", "");
            if (digits.length() == 6) return digits;
        }
        return null;
    }

    /** Opens BM Remote Helper on the TV so it shows a fresh six-digit screen-share code. */
    static void openCodeApp(Context ctx, String host) throws Exception {
        KeyPair kp = keys(ctx);
        try (AdbClient adb = AdbClient.connect(host, 5555, kp, keyLine(kp))) { openHelper(adb); }
    }

    /** Installed versionCode of a package on the TV; 0 when not installed or unreadable. */
    private static int pkgVersion(AdbClient adb, String pkg) {
        try {
            String out = adb.shell("dumpsys package " + pkg + " | grep versionCode");
            for (String part : out.split("\\s+")) {
                if (part.startsWith("versionCode=")) return Integer.parseInt(part.substring(12).trim());
            }
        } catch (Exception ignore) {
        }
        return 0;
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
            adb.shell(RESTORE_NAME);
            c.helper = adb.shell("pm path " + HELPER).contains("package:");
            boolean needControl = !adb.shell("pm path " + CONTROL).contains("package:");
            // Builds before Helper 2.4 (versionCode 15) / Control 1.1 (versionCode 3) were signed
            // with a retired key. They can't be updated in place and can't share the signature
            // permission remote control needs, so replace them.
            if (c.helper && pkgVersion(adb, HELPER) < 15) {
                p.step(2, "Replacing an older BM Remote Helper on the TV…");
                adb.shell("pm uninstall " + HELPER);
                c.helper = adb.shell("pm path " + HELPER).contains("package:");
            }
            if (!needControl && pkgVersion(adb, CONTROL) < 3) {
                p.step(3, "Replacing an older remote control on the TV…");
                adb.shell("pm uninstall " + CONTROL);
                needControl = !adb.shell("pm path " + CONTROL).contains("package:");
            }
            if (!c.helper || (needControl && stopAfter >= 3)) p.step(stopAfter >= 3 && c.helper ? 3 : 2, "Downloading BM Remote Helper and its bundled remote control to this phone…");
            File apk = (!c.helper || (needControl && stopAfter >= 3)) ? downloadHelper(ctx) : null;
            try {
                if (!c.helper) {
                    p.step(2, "Installing BM Remote Helper on the TV…");
                    adb.push(apk, "/data/local/tmp/bm-helper.apk");
                    String res = adb.shell("pm install -r -d /data/local/tmp/bm-helper.apk");
                    if (res.contains("UPDATE_INCOMPATIBLE") || res.contains("signatures do not match")) {
                        p.step(2, "Replacing an older BM Remote Helper on the TV…");
                        adb.shell("pm uninstall " + HELPER);
                        res = adb.shell("pm install -r -d /data/local/tmp/bm-helper.apk");
                    }
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
                        if (res.contains("UPDATE_INCOMPATIBLE") || res.contains("signatures do not match")) {
                            p.step(3, "Replacing an older remote control on the TV…");
                            adb.shell("pm uninstall " + CONTROL);
                            res = adb.shell("pm install -r -d " + dest);
                        }
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

    /** One app's outcome during Install our apps: INSTALLED, ALREADY (already on the TV) or FAILED. */
    static final class AppResult {
        static final int INSTALLED = 0, ALREADY = 1, FAILED = 2;
        final String name; final int status;
        AppResult(String name, int status) { this.name = name; this.status = status; }
    }

    /** New-customer setups: installs every app an admin ticked "Install on TV during setup".
     * Existing packages bypass downloads and installation. Never fatal; returns one AppResult per app. */
    /** One app in the customer's tick list. */
    static final class PickItem {
        final String name, path; final boolean installed;
        PickItem(String name, String path, boolean installed) { this.name = name; this.path = path; this.installed = installed; }
    }

    private static org.json.JSONArray fetchInstallList() {
        org.json.JSONArray apps;
        try {
            java.net.HttpURLConnection h = (java.net.HttpURLConnection) new java.net.URL("https://bmsupport.uk/api/public/tv-install-list").openConnection();
            h.setConnectTimeout(15000); h.setReadTimeout(30000);
            try (java.io.InputStream in = h.getInputStream()) { apps = new org.json.JSONObject(new String(readAll(in), java.nio.charset.StandardCharsets.UTF_8)).optJSONArray("apps"); }
            finally { h.disconnect(); }
        } catch (Exception e) { throw new IllegalStateException("Couldn't get the app list. Check the phone's internet and try again."); }
        if (apps == null || apps.length() == 0) throw new IllegalStateException("No apps are set up to install yet. Please contact BM Support.");
        return apps;
    }

    /** Only apps installed and enabled for the TV's current profile count as "already there". */
    private static java.util.Set<String> tvPackages(AdbClient adb) throws Exception {
        String listed = adb.shell("pm list packages --user current");
        if (listed == null || !listed.contains("package:")) listed = adb.shell("pm list packages");
        java.util.Set<String> installed = InstalledApps.from(listed);
        try { installed.removeAll(InstalledApps.from(adb.shell("pm list packages -d --user current"))); } catch (Exception ignored) {}
        return installed;
    }

    /** Customer's pick: ticked apps plus apps already on the TV (reported as skipped). only null = all. Matches Windows pickApps. */
    static boolean picked(String path, String packageName, java.util.Set<String> only, java.util.Set<String> installed) {
        return only == null || only.contains(path) || InstalledApps.contains(installed, packageName);
    }

    /** Install list for the tick list, each marked with whether it's already on the TV. */
    static java.util.List<PickItem> listOurApps(Context ctx, String host, Progress p) throws Exception {
        org.json.JSONArray apps = fetchInstallList();
        java.util.List<PickItem> out = new java.util.ArrayList<>();
        KeyPair kp = keys(ctx);
        try (AdbClient adb = AdbClient.connect(host, 5555, kp, keyLine(kp))) {
            p.step(0, "Checking which apps are already on your TV…");
            java.util.Set<String> installed = tvPackages(adb);
            for (int i = 0; i < apps.length(); i++) {
                org.json.JSONObject a = apps.optJSONObject(i);
                if (a == null) continue;
                String path = a.optString("path", "");
                if (!path.startsWith("/api/public/tv-install-apk/")) continue;
                String name = a.optString("name", "app");
                if (name.length() > 80) name = name.substring(0, 80);
                out.add(new PickItem(name, path, InstalledApps.contains(installed, a.optString("packageName", ""))));
            }
        }
        return out;
    }

    static java.util.List<AppResult> installOurApps(Context ctx, String host, Progress p) throws Exception { return installOurApps(ctx, host, p, null); }

    static java.util.List<AppResult> installOurApps(Context ctx, String host, Progress p, java.util.Set<String> only) throws Exception {
        java.util.List<AppResult> results = new java.util.ArrayList<>();
        org.json.JSONArray all = fetchInstallList();
        KeyPair kp = keys(ctx);
        try (AdbClient adb = AdbClient.connect(host, 5555, kp, keyLine(kp))) {
            p.step(0, "Checking which apps are already on your TV…");
            java.util.Set<String> installed = tvPackages(adb);
            org.json.JSONArray apps = new org.json.JSONArray();
            for (int i = 0; i < all.length(); i++) {
                org.json.JSONObject a = all.optJSONObject(i);
                if (a != null && picked(a.optString("path", ""), a.optString("packageName", ""), only, installed)) apps.put(a);
            }
            if (apps.length() == 0) throw new IllegalStateException("Tick at least one app to install.");
            boolean screen = ensureInstallScreen(ctx, adb, installed);
            int total = apps.length();
            java.util.List<String> done = new java.util.ArrayList<>();
            try {
            for (int i = 0; i < apps.length(); i++) {
                org.json.JSONObject a = apps.optJSONObject(i);
                if (a == null) continue;
                String path = a.optString("path", "");
                String name = a.optString("name", "app");
                if (name.length() > 80) name = name.substring(0, 80);
                if (!path.startsWith("/api/public/tv-install-apk/")) continue;
                String packageName = a.optString("packageName", "");
                if (InstalledApps.contains(installed, packageName)) {
                    p.step(0, name + " — already on your TV, skipping (" + (i + 1) + " of " + apps.length() + ")");
                    results.add(new AppResult(name, AppResult.ALREADY));
                    done.add(name);
                    if (screen) showScreen(adb, InstallScreen.command("skipped", name, i + 1, total, null));
                    continue;
                }
                p.step(0, "Installing " + name + " (" + (i + 1) + " of " + apps.length() + ")…");
                if (screen) showScreen(adb, InstallScreen.command("installing", name, i + 1, total, null));
                File out = new File(ctx.getCacheDir(), "bm-app.apk");
                try {
                    java.net.HttpURLConnection h = (java.net.HttpURLConnection) new java.net.URL("https://bmsupport.uk" + path).openConnection();
                    tagDownload(ctx, h);
                    h.setConnectTimeout(15000); h.setReadTimeout(120000);
                    try (java.io.InputStream in = h.getInputStream(); FileOutputStream o = new FileOutputStream(out)) {
                        byte[] buf = new byte[65536]; int r;
                        while ((r = in.read(buf)) > 0) o.write(buf, 0, r);
                    } finally { h.disconnect(); }
                    // Older website versions do not send packageName; still avoid the TV transfer/install.
                    android.content.pm.PackageInfo info = ctx.getPackageManager().getPackageArchiveInfo(out.getAbsolutePath(), 0);
                    if (info != null && InstalledApps.contains(installed, info.packageName)) {
                        results.add(new AppResult(name, AppResult.ALREADY));
                        done.add(name);
                        if (screen) showScreen(adb, InstallScreen.command("skipped", name, i + 1, total, null));
                        continue;
                    }
                    adb.push(out, "/data/local/tmp/bm-app.apk");
                    String res = adb.shell("pm install -r /data/local/tmp/bm-app.apk");
                    if (res.contains("Success")) {
                        results.add(new AppResult(name, AppResult.INSTALLED));
                        if (info != null && InstalledApps.validPackage(info.packageName)) installed.add(info.packageName);
                    }
                    else if (res.contains("VERSION_DOWNGRADE")) results.add(new AppResult(name, AppResult.ALREADY));
                    else results.add(new AppResult(name, AppResult.FAILED));
                } catch (Exception e) { results.add(new AppResult(name, AppResult.FAILED)); }
                finally { out.delete(); try { adb.shell("rm -f /data/local/tmp/bm-app.apk"); } catch (Exception ignored) {} }
                AppResult last = results.isEmpty() ? null : results.get(results.size() - 1);
                if (last != null && last.status != AppResult.FAILED && !done.contains(name)) done.add(name);
            }
            } catch (Exception e) {
                if (screen) showScreen(adb, InstallScreen.command("error", null, 0, total, null));
                throw e;
            }
            if (screen) {
                boolean failed = false;
                for (AppResult r : results) if (r.status == AppResult.FAILED) failed = true;
                showScreen(adb, failed ? InstallScreen.command("error", null, 0, total, null) : InstallScreen.command("complete", null, total, total, done));
            }
        }
        return results;
    }

    /** Installs the BM Install Screen TV app if missing. Never fatal: returns false when the screen can't be shown. */
    private static boolean ensureInstallScreen(Context ctx, AdbClient adb, java.util.Set<String> installed) {
        if (InstalledApps.contains(installed, InstallScreen.PACKAGE)) return true;
        File out = new File(ctx.getCacheDir(), "bm-install-screen.apk");
        try {
            java.net.HttpURLConnection h = (java.net.HttpURLConnection) new java.net.URL("https://bmsupport.uk" + InstallScreen.APK_PATH).openConnection();
            tagDownload(ctx, h);
            h.setConnectTimeout(15000); h.setReadTimeout(60000);
            if (h.getResponseCode() != 200) { h.disconnect(); return false; }
            try (java.io.InputStream in = h.getInputStream(); FileOutputStream o = new FileOutputStream(out)) {
                byte[] buf = new byte[65536]; int r;
                while ((r = in.read(buf)) > 0) o.write(buf, 0, r);
            } finally { h.disconnect(); }
            if (out.length() < 5000) return false;
            adb.push(out, "/data/local/tmp/bm-install-screen.apk");
            String res = adb.shell("pm install -r /data/local/tmp/bm-install-screen.apk");
            return res != null && res.contains("Success");
        } catch (Exception e) { return false; }
        finally { out.delete(); try { adb.shell("rm -f /data/local/tmp/bm-install-screen.apk"); } catch (Exception ignored) {} }
    }

    /** Updates the TV install screen; a TV that refuses to show it never stops the installs. */
    private static void showScreen(AdbClient adb, String cmd) { try { adb.shell(cmd); } catch (Exception ignored) {} }

    /** Login token from this run's PIN sign-in; sent with confirmations so the website knows which customer's app checked the TV. */
    static volatile String loginToken = "";

    /** Sends the Enabler login token with app downloads so the website's download log knows the customer. */
    private static void tagDownload(Context ctx, java.net.HttpURLConnection h) {
        String t = ctx.getSharedPreferences("tv", Context.MODE_PRIVATE).getString("pinToken", "");
        if (t != null && t.matches("[0-9a-fA-F]{20,200}")) h.setRequestProperty("x-enabler-token", t);
    }

    /** Downloads the latest BM Remote Helper APK from bmsupport.uk so the customer never installs it by hand. */
    private static File downloadHelper(Context ctx) throws java.io.IOException {
        File out = new File(ctx.getCacheDir(), "bm-helper.apk");
        java.net.HttpURLConnection h = (java.net.HttpURLConnection) new java.net.URL("https://bmsupport.uk/api/public/remote-helper-apk").openConnection();
        tagDownload(ctx, h);
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

    /** Asks bmsupport.uk for a short single-use code carrying the confirmed TV checks. Throws IllegalStateException with a friendly message. */
    /** Sends the TV checks (and Helper code) straight to the linked ticket/order. */
    static void reportLinked(String linkCode, Checks c, String device, String helperCode) {
        int code;
        try {
            java.net.HttpURLConnection h = (java.net.HttpURLConnection) new java.net.URL("https://bmsupport.uk/api/public/remote-setup").openConnection();
            h.setRequestMethod("POST"); h.setDoOutput(true); h.setConnectTimeout(15000); h.setReadTimeout(15000);
            h.setRequestProperty("Content-Type", "application/json");
            String body = "{\"code\":\"" + linkCode + "\",\"app\":\"tv-enabler-1.18\"," + (helperCode != null && helperCode.matches("\\d{6}") ? "\"helperCode\":\"" + helperCode + "\"," : "")
                    + "\"device\":\"" + device + "\",\"checks\":{\"adb\":" + c.adb + ",\"helper\":" + c.helper + ",\"control\":" + c.control + ",\"accessibility\":" + c.accessibility + "}}";
            try (java.io.OutputStream o = h.getOutputStream()) { o.write(body.getBytes(StandardCharsets.UTF_8)); }
            code = h.getResponseCode();
            h.disconnect();
        } catch (Exception e) { throw new IllegalStateException("Couldn't reach BM Support. Check the phone's internet and try again."); }
        if (code == 404) throw new LinkExpired();
        if (code == 409) throw new IllegalStateException("Your ticket or order is set up for the other TV type. Press Change device on its Remote setup tab, or pick the other TV type here.");
        if (code == 429) throw new IllegalStateException("Too many tries. Wait 15 minutes.");
        if (code == 426) throw new IllegalStateException("Please update BM TV Enabler from bmsupport.uk to get a new code.");
        if (code >= 400) throw new IllegalStateException("BM Support couldn't be told (error " + code + "). Try again.");
    }
    static final class LinkExpired extends IllegalStateException { LinkExpired() { super("The website link has expired. Press New link code on your Remote setup tab and scan it again."); } }

    static final class Confirmation {
        final String code; final long expiresAt; final String refreshToken;
        Confirmation(String code, long expiresAt, String token) { this.code = code; this.expiresAt = expiresAt; this.refreshToken = token; }
    }
    static Confirmation requestConfirmCode(Checks c, String device) { return requestConfirmCode(c, device, null); }
    static Confirmation requestConfirmCode(Checks c, String device, String helperCode) { return requestConfirmCode(c, device, helperCode, "share"); }
    /** kind "share" confirms the TV for screen sharing; "install" only confirms the apps are on the TV. */
    static Confirmation requestConfirmCode(Checks c, String device, String helperCode, String kind) {
        int code;
        String resp;
        try {
            java.net.HttpURLConnection h = (java.net.HttpURLConnection) new java.net.URL("https://bmsupport.uk/api/public/enabler-confirm").openConnection();
            h.setRequestMethod("POST"); h.setDoOutput(true); h.setConnectTimeout(15000); h.setReadTimeout(15000);
            h.setRequestProperty("Content-Type", "application/json");
            if (loginToken != null && loginToken.matches("[0-9a-fA-F]{20,200}")) h.setRequestProperty("x-enabler-token", loginToken);
            String body = "{\"app\":\"tv-enabler-1.17\",\"protocol\":3,\"kind\":\"" + kind + "\"," + (helperCode != null && helperCode.matches("\\d{6}") ? "\"helperCode\":\"" + helperCode + "\"," : "") + "\"device\":\"" + device + "\",\"checks\":{\"adb\":" + c.adb + ",\"helper\":" + c.helper
                    + ",\"control\":" + c.control + ",\"accessibility\":" + c.accessibility + "}}";
            try (java.io.OutputStream o = h.getOutputStream()) { o.write(body.getBytes(StandardCharsets.UTF_8)); }
            code = h.getResponseCode();
            java.io.InputStream in = code < 400 ? h.getInputStream() : h.getErrorStream();
            resp = in == null ? "" : new String(readAll(in), StandardCharsets.UTF_8);
            h.disconnect();
        } catch (Exception e) { throw new IllegalStateException("Couldn't reach BM Support. Check the phone's internet and try again."); }
        if (code == 429) throw new IllegalStateException("Too many tries. Wait 15 minutes.");
        if (code == 426) throw new IllegalStateException("Please update BM TV Enabler from bmsupport.uk to get a new code.");
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("\"code\"\\s*:\\s*\"([A-Z0-9]{6})\"").matcher(resp);
        if (code != 200 || !m.find()) throw new IllegalStateException("Couldn't get a code from BM Support (error " + code + "). Try again.");
        java.util.regex.Matcher expiry = java.util.regex.Pattern.compile("\"expiresAtMs\"\\s*:\\s*(\\d+)").matcher(resp);
        if (!expiry.find()) throw new IllegalStateException("BM Support needs updating before a new confirmation code can be issued.");
        return new Confirmation(m.group(1), Long.parseLong(expiry.group(1)), refreshTokenFrom(resp));
    }

    /** Customer needs no staff help: log the install code, installed apps and TV address, marking the code used. */
    static void logSelfInstall(String token, java.util.List<String> apps, String tvAddress) {
        int code;
        try {
            org.json.JSONObject body = new org.json.JSONObject().put("token", token).put("tvAddress", tvAddress)
                    .put("apps", new org.json.JSONArray(apps));
            java.net.HttpURLConnection h = (java.net.HttpURLConnection) new java.net.URL("https://bmsupport.uk/api/public/enabler-self-install").openConnection();
            h.setRequestMethod("POST"); h.setDoOutput(true); h.setConnectTimeout(15000); h.setReadTimeout(15000);
            h.setRequestProperty("Content-Type", "application/json");
            if (loginToken != null && loginToken.matches("[0-9a-fA-F]{20,200}")) h.setRequestProperty("x-enabler-token", loginToken);
            try (java.io.OutputStream o = h.getOutputStream()) { o.write(body.toString().getBytes(StandardCharsets.UTF_8)); }
            code = h.getResponseCode();
            h.disconnect();
        } catch (Exception e) { throw new IllegalStateException("Couldn't reach BM Support. Check the phone's internet and try again."); }
        if (code != 200) throw new IllegalStateException("Couldn't record your install (error " + code + "). Try again.");
    }

    private static org.json.JSONObject staffHelpPost(org.json.JSONObject body) { return sitePost("enabler-staff-help", body); }
    private static org.json.JSONObject sitePost(String route, org.json.JSONObject body) {
        int code; String resp;
        try {
            java.net.HttpURLConnection h = (java.net.HttpURLConnection) new java.net.URL("https://bmsupport.uk/api/public/" + route).openConnection();
            h.setRequestMethod("POST"); h.setDoOutput(true); h.setConnectTimeout(15000); h.setReadTimeout(20000);
            h.setRequestProperty("Content-Type", "application/json");
            if (loginToken != null && loginToken.matches("[0-9a-fA-F]{20,200}")) h.setRequestProperty("x-enabler-token", loginToken);
            try (java.io.OutputStream o = h.getOutputStream()) { o.write(body.toString().getBytes(StandardCharsets.UTF_8)); }
            code = h.getResponseCode();
            java.io.InputStream in = code < 400 ? h.getInputStream() : h.getErrorStream();
            resp = in == null ? "" : new String(readAll(in), StandardCharsets.UTF_8);
            h.disconnect();
        } catch (Exception e) { throw new IllegalStateException("Couldn't reach BM Support. Check the phone's internet and try again."); }
        org.json.JSONObject j;
        try { j = new org.json.JSONObject(resp); } catch (Exception e) { j = new org.json.JSONObject(); }
        if (code != 200) throw new IllegalStateException(j.optString("error", "BM Support couldn't answer (error " + code + "). Try again."));
        return j;
    }
    /** Staff help is only offered while the office is open. */
    static boolean officeOpen() {
        try { return staffHelpPost(new org.json.JSONObject().put("mode", "check")).optBoolean("open", false); }
        catch (org.json.JSONException e) { return false; }
    }
    /** Opens a ticket for staff with the fresh sharing reference attached; true when the screen-share request reached staff. */
    static final class Handoff { int helpPlan; String device; String ticketId; java.util.Set<String> apps = new java.util.HashSet<>(); }
    /** Answers the customer gave on bmsupport.uk, unlocked by a one-time 6-digit code and this app's PIN login. */
    static Handoff redeemHandoff(String code) {
        try {
            org.json.JSONObject r = sitePost("enabler-handoff", new org.json.JSONObject().put("code", code));
            Handoff h = new Handoff();
            h.helpPlan = r.optInt("helpPlan", 2); h.device = "amazon".equals(r.optString("device")) ? "amazon" : "android";
            h.ticketId = r.isNull("ticketId") ? null : r.optString("ticketId", null);
            org.json.JSONArray a = r.optJSONArray("apps");
            if (a != null) for (int i = 0; i < a.length(); i++) h.apps.add(a.optString(i));
            return h;
        } catch (org.json.JSONException e) { throw new IllegalStateException("Couldn't read your code. Try again."); }
    }
    static boolean openStaffTicket(String shareToken, String device, java.util.List<String> apps) { return openStaffTicket(shareToken, device, apps, null); }
    static boolean openStaffTicket(String shareToken, String device, java.util.List<String> apps, String ticketId) {
        try {
            org.json.JSONObject body = new org.json.JSONObject().put("mode", "create").put("shareToken", shareToken)
                    .put("device", device).put("apps", new org.json.JSONArray(apps));
            if (ticketId != null && !ticketId.isEmpty()) body.put("ticketId", ticketId);
            org.json.JSONObject r = staffHelpPost(body);
            return r.optBoolean("connected", false);
        } catch (org.json.JSONException e) { throw new IllegalStateException("Couldn't open a ticket for staff help. Try again."); }
    }


    private static String refreshTokenFrom(String response) {
        try { return new org.json.JSONObject(response).optString("refreshToken", ""); } catch (Exception e) { return ""; }
    }
    private static org.json.JSONObject refreshPost(org.json.JSONObject body) throws Exception {
        java.net.HttpURLConnection h = (java.net.HttpURLConnection) new java.net.URL("https://bmsupport.uk/api/public/enabler-refresh").openConnection();
        h.setRequestMethod("POST"); h.setDoOutput(true); h.setConnectTimeout(10000); h.setReadTimeout(15000);
        h.setRequestProperty("Content-Type", "application/json");
        try {
            try (java.io.OutputStream out = h.getOutputStream()) { out.write(body.toString().getBytes(StandardCharsets.UTF_8)); }
            int status = h.getResponseCode();
            java.io.InputStream stream = status < 400 ? h.getInputStream() : h.getErrorStream();
            org.json.JSONObject response;
            try (java.io.InputStream in = stream) { response = new org.json.JSONObject(in == null ? "{}" : new String(readAll(in), StandardCharsets.UTF_8)); }
            if (SetupWizard.referenceExpired(status, response.optString("state"))) throw new ReferenceExpired();
            if (status != 200) throw new IllegalStateException("Could not check your Enabler reference. Check your internet and try again.");
            return response;
        } finally { h.disconnect(); }
    }
    static final class ReferenceExpired extends IllegalStateException {
        ReferenceExpired() { super("Sharing reference expired. Press New code before sharing again."); }
    }
    static boolean refreshConnection(Context ctx, String host, String token, java.util.function.Consumer<Boolean> onUsage) throws Exception {
        org.json.JSONObject task = refreshPost(new org.json.JSONObject().put("token", token));
        onUsage.accept(task.optBoolean("referenceUsed", false));
        if (!"refresh".equals(task.optString("state"))) return false;
        String request = task.getString("requestId");
        try {
            Checks checks = checkExisting(ctx, host, (i, text) -> {});
            if (!SetupWizard.ready(checks.adb, checks.helper, checks.control, checks.accessibility)) throw new IllegalStateException("Check TV setup again.");
            KeyPair kp = keys(ctx);
            try (AdbClient adb = AdbClient.connect(host, 5555, kp, keyLine(kp))) { adb.shell("am force-stop " + HELPER); }
            String code = readHelperCode(ctx, host);
            if (code == null) throw new IllegalStateException("Couldn't read the fresh TV connection.");
            org.json.JSONObject result = new org.json.JSONObject().put("token", token).put("requestId", request).put("helperCode", code)
                .put("checks", new org.json.JSONObject().put("adb", checks.adb).put("helper", checks.helper).put("control", checks.control).put("accessibility", checks.accessibility));
            if (!"done".equals(refreshPost(result).optString("state"))) throw new IllegalStateException("Couldn't send the new connection. Press Get new connection again.");
            return true;
        } catch (Exception error) {
            try { refreshPost(new org.json.JSONObject().put("token", token).put("requestId", request)); } catch (Exception ignored) {}
            throw error;
        }
    }

    private static byte[] readAll(java.io.InputStream in) throws java.io.IOException {
        java.io.ByteArrayOutputStream b = new java.io.ByteArrayOutputStream(); byte[] buf = new byte[4096]; int r;
        while ((r = in.read(buf)) > 0) b.write(buf, 0, r); return b.toByteArray();
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
