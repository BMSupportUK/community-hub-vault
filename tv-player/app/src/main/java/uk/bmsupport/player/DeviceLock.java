package uk.bmsupport.player;

import android.content.Context;
import java.io.File;

/** Kept separately from account preferences so wiping them cannot register a revoked device again. */
final class DeviceLock {
    private static Context app;
    static void init(Context context) { app = context.getApplicationContext(); }
    static boolean locked() { return app != null && app.getSharedPreferences("bm_device_lock", Context.MODE_PRIVATE).getBoolean("unlinked", false); }
    static void revoke() {
        if (app == null) return;
        app.getSharedPreferences("bm_device_lock", Context.MODE_PRIVATE).edit().putBoolean("unlinked", true).commit();
        wipe();
    }
    /** The user's own "Link this device again": data is already wiped, so clearing the marker starts a brand-new registration and code. */
    static void relink() {
        if (app == null) return;
        wipe();
        app.getSharedPreferences("bm_device_lock", Context.MODE_PRIVATE).edit().remove("unlinked").commit();
    }
    static void wipe() {
        if (app == null || !locked()) return;
        app.getSharedPreferences("bmplayer", Context.MODE_PRIVATE).edit().clear().commit();
        removeChildren(app.getFilesDir()); removeChildren(app.getCacheDir());
    }
    private static void removeChildren(File dir) {
        File[] files = dir.listFiles();
        if (files == null) return;
        for (File file : files) { if (file.isDirectory()) removeChildren(file); file.delete(); }
    }
}