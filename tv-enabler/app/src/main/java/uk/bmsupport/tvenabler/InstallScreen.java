package uk.bmsupport.tvenabler;

import java.util.List;

/** Shell commands that drive the BM Install Screen TV app during Install our apps.
 *  Must match windows-tv-enabler/core.cjs installScreenCommand exactly. */
final class InstallScreen {
    static final String PACKAGE = "uk.bmsupport.installscreen";
    static final int MIN_VERSION = 3;
    static final String APK_PATH = "/api/public/install-screen-apk";

    private InstallScreen() {}

    /** Keeps only safe characters so app names can never break out of the shell quotes. */
    static String safe(String s) {
        if (s == null) return "";
        String t = s.replaceAll("[^A-Za-z0-9 .,()&+\\-]", "").trim();
        return t.length() > 80 ? t.substring(0, 80) : t;
    }

    static String command(String state, String app, int index, int total, List<String> apps) {
        String st = ("installing".equals(state) || "skipped".equals(state) || "complete".equals(state)) ? state : "error";
        StringBuilder b = new StringBuilder("am start -n " + PACKAGE + "/.MainActivity -f 0x20000000 --es state " + st);
        if (app != null && !app.isEmpty()) b.append(" --es app '").append(safe(app)).append("'");
        b.append(" --ei index ").append(Math.max(0, index)).append(" --ei total ").append(Math.max(0, total));
        if (apps != null && !apps.isEmpty()) {
            StringBuilder l = new StringBuilder();
            for (String a : apps) { String s = safe(a); if (s.isEmpty()) continue; if (l.length() > 0) l.append('|'); l.append(s); }
            if (l.length() > 0) b.append(" --es apps '").append(l).append("'");
        }
        return b.toString();
    }
}
