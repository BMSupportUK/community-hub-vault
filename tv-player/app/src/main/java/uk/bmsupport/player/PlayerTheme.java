package uk.bmsupport.player;

import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Home-screen themes chosen in Settings. The website sends the owner's switched-on list
 * (device-token `themes`); the chosen picture is saved on the box so the home screen never waits
 * for it. A theme the owner switches off or deletes is dropped on the next check, back to standard.
 */
final class PlayerTheme {
    static final String PREF = "theme_id";
    private PlayerTheme() {}

    static File file(Context c) { return new File(c.getFilesDir(), "theme.jpg"); }

    /** The saved picture for the chosen theme, or null for the standard look. */
    static Bitmap picture(Context c, SharedPreferences prefs) {
        if (prefs.getString(PREF, "").isEmpty()) return null;
        File f = file(c);
        if (!f.exists()) return null;
        try { return BitmapFactory.decodeFile(f.getAbsolutePath()); } catch (Throwable e) { return null; }
    }

    /** Owner's switched-on themes, or null when the website can't be reached. Runs off the main thread. */
    static JSONArray list(SharedPreferences prefs) {
        String token = prefs.getString("token", "");
        if (token.isEmpty()) return null;
        try {
            JSONObject r = new JSONObject(Net.postJson(Net.SITE + "/api/public/player",
                    new JSONObject().put("action", "themes").put("device_token", token).toString()));
            return r.optJSONArray("items");
        } catch (Throwable e) { return null; }
    }

    /** True when the saved choice is no longer offered (switched off / deleted) and was cleared. */
    static boolean dropIfRetired(Context c, SharedPreferences prefs, JSONArray items) {
        String id = prefs.getString(PREF, "");
        if (id.isEmpty() || items == null) return false;
        for (int i = 0; i < items.length(); i++) if (id.equals(items.optJSONObject(i).optString("id"))) return false;
        clear(c, prefs);
        return true;
    }

    static void clear(Context c, SharedPreferences prefs) {
        prefs.edit().remove(PREF).apply();
        //noinspection ResultOfMethodCallIgnored
        file(c).delete();
    }

    /** Downloads the theme picture then saves the choice. Runs off the main thread. */
    static boolean choose(Context c, SharedPreferences prefs, String id, String image) {
        if (!image.startsWith(Net.SITE + "/")) return false; // only pictures from our own website
        File tmp = new File(c.getFilesDir(), "theme.part");
        try {
            HttpURLConnection h = (HttpURLConnection) new URL(image).openConnection();
            h.setConnectTimeout(10000); h.setReadTimeout(20000);
            if (h.getResponseCode() != 200) return false;
            try (InputStream in = h.getInputStream(); FileOutputStream out = new FileOutputStream(tmp)) {
                byte[] b = new byte[16384]; int n; long total = 0;
                while ((n = in.read(b)) > 0) { total += n; if (total > 4_000_000) return false; out.write(b, 0, n); }
            }
            if (BitmapFactory.decodeFile(tmp.getAbsolutePath()) == null) return false;
            if (!tmp.renameTo(file(c))) return false;
            prefs.edit().putString(PREF, id).apply();
            return true;
        } catch (Throwable e) { return false; }
        finally { //noinspection ResultOfMethodCallIgnored
            tmp.delete(); }
    }
}
