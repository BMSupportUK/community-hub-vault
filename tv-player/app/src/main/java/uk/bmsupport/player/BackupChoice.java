package uk.bmsupport.player;

import android.content.SharedPreferences;

import org.json.JSONObject;

/**
 * Remembers channels the main player (Media3) could not keep going, so they open straight in the
 * built-in backup engine next time instead of freezing first. Two different channels from the same
 * category needing backup makes the whole category backup-first (e.g. VIP Cinema Collection).
 * Choices expire so a fixed feed or player gets retried on the main player.
 */
final class BackupChoice {
    static final String KEY = "backup_first";
    static final long KEEP_MS = 14L * 24 * 60 * 60 * 1000;
    static final int CATEGORY_CHANNELS = 2;

    private BackupChoice() {}

    static String norm(String s) {
        return s == null ? "" : s.trim().toLowerCase(java.util.Locale.ROOT).replaceAll("\\s+", " ");
    }

    /** Pure: records that a channel needed the backup engine. */
    static JSONObject remember(JSONObject state, String kind, String id, String category, long now) {
        JSONObject s = prune(state, now);
        if (id == null || id.isEmpty()) return s;
        try {
            JSONObject ch = s.optJSONObject("ch"); if (ch == null) { ch = new JSONObject(); s.put("ch", ch); }
            ch.put(kind + ":" + id, new JSONObject().put("t", now).put("c", "live".equals(kind) ? norm(category) : ""));
            String cat = norm(category);
            if ("live".equals(kind) && !cat.isEmpty()) {
                int n = 0;
                java.util.Iterator<String> k = ch.keys();
                while (k.hasNext()) { JSONObject e = ch.optJSONObject(k.next()); if (e != null && cat.equals(e.optString("c"))) n++; }
                if (n >= CATEGORY_CHANNELS) {
                    JSONObject cats = s.optJSONObject("cat"); if (cats == null) { cats = new JSONObject(); s.put("cat", cats); }
                    cats.put(cat, now);
                }
            }
        } catch (Exception ignored) {}
        return s;
    }

    /** Pure: true when this item should open straight in the backup engine. */
    static boolean prefer(JSONObject state, String kind, String id, String category, long now) {
        JSONObject s = prune(state, now);
        JSONObject ch = s.optJSONObject("ch");
        if (ch != null && id != null && ch.has(kind + ":" + id)) return true;
        JSONObject cats = s.optJSONObject("cat");
        return "live".equals(kind) && cats != null && !norm(category).isEmpty() && cats.has(norm(category));
    }

    static JSONObject prune(JSONObject state, long now) {
        JSONObject out = new JSONObject();
        if (state == null) return out;
        try {
            JSONObject ch = state.optJSONObject("ch"), cats = state.optJSONObject("cat");
            if (ch != null) {
                JSONObject keep = new JSONObject();
                java.util.Iterator<String> k = ch.keys();
                while (k.hasNext()) { String key = k.next(); JSONObject e = ch.optJSONObject(key);
                    if (e != null && now - e.optLong("t") < KEEP_MS) keep.put(key, e); }
                out.put("ch", keep);
            }
            if (cats != null) {
                JSONObject keep = new JSONObject();
                java.util.Iterator<String> k = cats.keys();
                while (k.hasNext()) { String key = k.next(); if (now - cats.optLong(key) < KEEP_MS) keep.put(key, cats.optLong(key)); }
                out.put("cat", keep);
            }
        } catch (Exception ignored) {}
        return out;
    }

    static JSONObject load(SharedPreferences p) {
        try { return new JSONObject(p.getString(KEY, "{}")); } catch (Exception e) { return new JSONObject(); }
    }
    static void remember(SharedPreferences p, String kind, String id, String category) {
        p.edit().putString(KEY, remember(load(p), kind, id, category, System.currentTimeMillis()).toString()).apply();
    }
    static boolean prefer(SharedPreferences p, String kind, String id, String category) {
        return prefer(load(p), kind, id, category, System.currentTimeMillis());
    }
    static void clear(SharedPreferences p) { p.edit().remove(KEY).apply(); }
}
