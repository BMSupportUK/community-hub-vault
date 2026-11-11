package uk.bmsupport.player;

import android.app.Activity;
import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import org.json.JSONArray;
import org.json.JSONObject;

/** One login, limited connections: asks the website before streaming and stops here when another device takes over. */
final class StreamClaim {
    interface Result { void done(boolean busy, String who); }
    private static final java.util.concurrent.ExecutorService IO = java.util.concurrent.Executors.newSingleThreadExecutor();
    private static final Handler UI = new Handler(Looper.getMainLooper());
    private static final java.util.Set<Activity> PLAYERS = java.util.Collections.newSetFromMap(new java.util.WeakHashMap<>());
    static Runnable onMainTaken;

    private StreamClaim() {}

    /** Fails open: if the website can't be reached, playback carries on as before. */
    static void check(Context c, String kind, String title, boolean takeover, Result r) {
        android.content.SharedPreferences p = c.getSharedPreferences("bmplayer", Context.MODE_PRIVATE);
        String token = p.getString("token", ""), user = p.getString("user", "");
        int max = Math.max(1, p.getInt("max_cons", 1));
        if (token.isEmpty() || user.isEmpty()) { r.done(false, ""); return; }
        IO.execute(() -> {
            boolean busy = false; String who = ""; boolean refused = false; String msg = "";
            try {
                JSONObject res = new JSONObject(Net.postJson(Net.SITE + "/api/public/player", new JSONObject()
                        .put("action", "stream_claim").put("device_token", token).put("login", user).put("max", max)
                        .put("takeover", takeover).put("kind", apiKind(kind)).put("title", title == null || title.isEmpty() ? "Channel" : title.length() > 200 ? title.substring(0, 200) : title).toString()));
                busy = res.optBoolean("busy", false);
                final String warn = res.isNull("warning") ? "" : res.optString("warning", "");
                if (!warn.isEmpty()) UI.post(() -> warnHousehold(warn));
                who = describe(res.optJSONArray("devices"));
                refused = res.optBoolean("refused", false);
                msg = res.isNull("message") ? "" : res.optString("message", "");
                if (busy && !msg.isEmpty()) who = msg;
            } catch (Throwable ignored) {}
            final boolean b = busy; final String w = who;
            // Not allowed at all (second phone, home-only block): explain and never start playback.
            if (busy && refused) { final String m = msg.isEmpty() ? "This device can't watch on this login right now." : msg; UI.post(() -> refuse(m)); return; }
            UI.post(() -> r.done(b, w));
        });
    }

    static String apiKind(String kind) { return "episode".equals(kind) ? "series" : "film".equals(kind) || "series".equals(kind) || "catchup".equals(kind) ? kind : "live"; }

    /** "BM Player Windows is watching BBC Two | FHD." */
    static String describe(JSONArray devices) {
        if (devices == null || devices.length() == 0) return "Another device is watching on this login.";
        StringBuilder s = new StringBuilder();
        for (int i = 0; i < devices.length(); i++) {
            JSONObject d = devices.optJSONObject(i); if (d == null) continue;
            String name = d.optString("name", ""), title = d.isNull("title") ? "" : d.optString("title", "");
            if (s.length() > 0) s.append(' ');
            s.append(name.isEmpty() ? "Another device" : name).append(title.isEmpty() ? " is watching" : " is watching " + title).append('.');
        }
        return s.length() == 0 ? "Another device is watching on this login." : s.toString();
    }

    static Activity host;
    /** Multi Room rule: shown over whatever screen is open; playback carries on. */
    static void warnHousehold(String message) {
        Activity a = null;
        for (Activity p : PLAYERS) if (p != null && !p.isFinishing()) a = p;
        if (a == null) a = host;
        if (a == null || a.isFinishing()) return;
        try { new android.app.AlertDialog.Builder(a).setTitle("Multi Room rule").setMessage(message).setPositiveButton("OK", null).show(); }
        catch (Throwable ignored) { android.widget.Toast.makeText(a, message, android.widget.Toast.LENGTH_LONG).show(); }
    }

    static void refuse(String message) {
        Activity a = host;
        if (a == null || a.isFinishing()) return;
        try { new android.app.AlertDialog.Builder(a).setTitle("Can't play here").setMessage(message).setPositiveButton("OK", null).show(); }
        catch (Throwable ignored) { android.widget.Toast.makeText(a, message, android.widget.Toast.LENGTH_LONG).show(); }
    }

    static void attach(Activity a) { PLAYERS.add(a); }
    static void detach(Activity a) { PLAYERS.remove(a); }

    /** Another device on this login chose "Watch here instead". */
    static void taken() {
        for (Activity a : new java.util.ArrayList<>(PLAYERS)) if (a != null && !a.isFinishing()) a.finish();
        PLAYERS.clear();
        if (onMainTaken != null) onMainTaken.run();
    }
}
