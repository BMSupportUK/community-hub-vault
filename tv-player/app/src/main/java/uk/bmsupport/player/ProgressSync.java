package uk.bmsupport.player;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Base64;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Films/episodes/series positions follow the account across devices (device-token `progress` /
 * `progress_set`). Local keys stay "watch:<login hash>:<kind>:<id>"; each write also stamps ":at"
 * and joins a dirty set that is pushed in the background. Pulled rows win only when newer.
 */
final class ProgressSync {
    private ProgressSync() {}
    private static final String API = "https://bmsupport.uk/api/public/player";
    private static final ExecutorService IO = Executors.newSingleThreadExecutor();
    private static long lastPush, lastPull;

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences("bmplayer", Context.MODE_PRIVATE); }

    /** "watch:<hash>:" for the current login, matching MainActivity.watchKey. */
    static String prefix(SharedPreferences p) {
        try {
            String scope = SecureLogin.field(p, "dns").replaceAll("/+$", "") + "\n" + SecureLogin.field(p, "user");
            byte[] hash = java.security.MessageDigest.getInstance("SHA-256").digest(scope.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            return "watch:" + Base64.encodeToString(hash, Base64.NO_WRAP) + ":";
        } catch (java.security.NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }

    /** "film:123" from "watch:<hash>:film:123", or null for anything that isn't synced. */
    static String portable(String key) {
        if (key == null || !key.startsWith("watch:")) return null;
        String[] parts = key.split(":", 3);
        if (parts.length < 3) return null;
        String rest = parts[2];
        return rest.matches("(film|episode|series):[A-Za-z0-9._-]{1,80}") ? rest : null;
    }

    /** A pulled position replaces the device's own only when it is newer. */
    static boolean remoteWins(long localAt, long remoteAt) { return remoteAt > localAt; }

    /** Call alongside every progress write (same editor). */
    static void touch(SharedPreferences p, SharedPreferences.Editor ed, String... keys) {
        Set<String> dirty = new HashSet<>(p.getStringSet("psync_dirty", new HashSet<>()));
        long now = System.currentTimeMillis();
        for (String k : keys) if (k != null && portable(k) != null) { ed.putLong(k + ":at", now); dirty.add(k); }
        ed.putStringSet("psync_dirty", dirty);
    }

    /** Send changed positions; throttled to every 30s unless forced (player closing). */
    static void push(Context ctx, boolean force) {
        final Context c = ctx.getApplicationContext();
        long now = System.currentTimeMillis();
        if (!force && now - lastPush < 30000) return;
        lastPush = now;
        IO.execute(() -> {
            SharedPreferences p = prefs(c);
            String token = p.getString("token", ""), login = SecureLogin.field(p, "user");
            Set<String> dirty = new HashSet<>(p.getStringSet("psync_dirty", new HashSet<>()));
            if (token.isEmpty() || login.isEmpty() || dirty.isEmpty()) return;
            String pre = prefix(p);
            JSONArray items = new JSONArray(); java.util.Map<String, Long> sent = new java.util.HashMap<>();
            try {
                for (String k : dirty) {
                    String pk = portable(k);
                    if (pk == null || !k.startsWith(pre)) continue;
                    if (items.length() >= 50) break;
                    long at = p.getLong(k + ":at", 1), duration = Math.max(0, p.getLong(k + ":duration", 0));
                    // The existing wire format carries completion as full progress, while local replay
                    // keeps its independent resume position. Never send a rewatch as unwatched.
                    long position = !pk.startsWith("series:") && WatchProgress.remembered(p, k)
                            ? duration : Math.max(0, p.getLong(k + ":position", 0));
                    items.put(new JSONObject().put("key", pk).put("position_ms", position)
                            .put("duration_ms", duration).put("updated_at", at)
                            .put("age_ms", Math.max(0, System.currentTimeMillis() - at)));
                    sent.put(k, at);
                }
                if (items.length() > 0) {
                    JSONObject r = new JSONObject(Net.postJson(API, new JSONObject().put("action", "progress_set").put("device_token", token).put("login", login).put("items", items).toString()));
                    if (!r.optBoolean("ok")) return;
                }
                Set<String> left = new HashSet<>(p.getStringSet("psync_dirty", new HashSet<>()));
                for (java.util.Map.Entry<String, Long> entry : sent.entrySet())
                    if (p.getLong(entry.getKey() + ":at", 0) == entry.getValue()) left.remove(entry.getKey());
                p.edit().putStringSet("psync_dirty", left).apply();
            } catch (Exception ignored) {}
        });
    }

    /** Fetch the account's positions and keep the newer of each; first sync uploads this device's own. */
    static void pull(Context ctx, boolean force, Runnable changed) {
        pull(ctx, force, changed, null);
    }

    /** Explicit opening waits for the newest position; offline keeps the local resume. */
    static void beforeOpen(Context ctx, Runnable ready) {
        pull(ctx, true, null, ready);
    }

    private static void pull(Context ctx, boolean force, Runnable changed, Runnable ready) {
        final Context c = ctx.getApplicationContext();
        long now = System.currentTimeMillis();
        if (!force && now - lastPull < 30000) return;
        lastPull = now;
        IO.execute(() -> {
            SharedPreferences p = prefs(c);
            String token = p.getString("token", ""), login = SecureLogin.field(p, "user");
            String pre = prefix(p);
            try {
                if (token.isEmpty() || login.isEmpty()) return;
                if (!p.getBoolean("psync_seeded:" + pre, false)) {
                    // First sync on this device: queue everything it has already watched.
                    Set<String> dirty = new HashSet<>(p.getStringSet("psync_dirty", new HashSet<>()));
                    SharedPreferences.Editor ed = p.edit();
                    for (String k : p.getAll().keySet()) {
                        if (!k.endsWith(":position")) continue;
                        String base = k.substring(0, k.length() - 9);
                        if (base.startsWith(pre) && portable(base) != null) { dirty.add(base); if (!p.contains(base + ":at")) ed.putLong(base + ":at", 1); }
                    }
                    ed.putStringSet("psync_dirty", dirty).putBoolean("psync_seeded:" + pre, true).apply();
                }
                JSONObject r = new JSONObject(Net.postJson(API, new JSONObject().put("action", "progress").put("device_token", token).put("login", login).toString()));
                JSONArray items = r.optJSONArray("items");
                boolean any = false;
                // Translate server times onto this device's clock so the most recently watched device always wins.
                long skew = r.has("now") ? System.currentTimeMillis() - r.optLong("now") : 0;
                if (items != null) {
                    SharedPreferences.Editor ed = p.edit();
                    for (int i = 0; i < items.length(); i++) {
                        JSONObject o = items.optJSONObject(i); if (o == null) continue;
                        String k = pre + o.optString("key");
                        if (portable(k) == null) continue;
                        long at = o.optLong("updated_at") + skew;
                        if (!remoteWins(p.getLong(k + ":at", 0), at)) continue;
                        if (o.optString("key").startsWith("series:"))
                            ed.putLong(k + ":position", o.optLong("position_ms")).putLong(k + ":duration", o.optLong("duration_ms"));
                        else WatchProgress.store(p, ed, k, o.optLong("position_ms"), o.optLong("duration_ms"));
                        ed.putLong(k + ":at", at);
                        any = true;
                    }
                    if (any) ed.apply();
                }
                push(c, true);
                if (any && changed != null) new android.os.Handler(android.os.Looper.getMainLooper()).post(changed);
            } catch (Exception ignored) {
            } finally {
                if (ready != null) new android.os.Handler(android.os.Looper.getMainLooper()).post(ready);
            }
        });
    }
}
