package uk.bmsupport.player;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONObject;

import java.util.Iterator;

/** Shares the steadier stream type (ts or m3u8) per live channel with every BM Player through the website. */
final class FormatSync {
    private FormatSync() {}

    /** Pulls the shared list into this device's per-channel preferences. */
    static void pull(Context c) {
        final Context app = c.getApplicationContext();
        new Thread(() -> {
            try {
                SharedPreferences p = PlayerActivity.prefs(app);
                JSONObject body = new JSONObject().put("action", "formats").put("device_token", p.getString("token", ""));
                JSONObject res = new JSONObject(Net.postJson(Net.SITE + "/api/public/player", body.toString()));
                JSONObject map = res.optJSONObject("formats");
                if (map == null) return;
                SharedPreferences.Editor e = p.edit();
                for (Iterator<String> it = map.keys(); it.hasNext(); ) {
                    String id = it.next(), fmt = map.optString(id);
                    if ("ts".equals(fmt) || "m3u8".equals(fmt)) e.putString("fmt_pref:" + id, fmt);
                }
                e.apply();
            } catch (Exception ignored) { /* best effort */ }
        }).start();
    }

    static void push(Context c, String id, String fmt) {
        final Context app = c.getApplicationContext();
        new Thread(() -> {
            try {
                JSONObject body = new JSONObject().put("action", "format_set")
                        .put("device_token", PlayerActivity.prefs(app).getString("token", ""))
                        .put("content_id", id).put("fmt", fmt);
                Net.postJson(Net.SITE + "/api/public/player", body.toString());
            } catch (Exception ignored) {}
        }).start();
    }
}
