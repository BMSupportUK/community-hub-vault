package uk.bmsupport.player;

import android.content.Context;

import org.json.JSONObject;

/**
 * Tells the website a live channel failed, showed no picture, or played cleanly, so the
 * Sports Guide can cross out channels that aren't working (device-token `channel_health`).
 */
final class ChannelHealth {
    /** No video frame this long after the stream opened counts as a black screen. */
    static final long BLACK_MS = 10_000;
    /** Clean playback this long (no stalls) clears a cross. */
    static final long CLEAN_MS = 120_000;
    /** Leaving a live channel that never played after this long counts as it not working. */
    static final long GIVE_UP_MS = 6_000;

    private ChannelHealth() {}

    static void report(Context c, String name, String status) {
        if (name == null || name.trim().isEmpty()) return;
        final Context app = c.getApplicationContext();
        new Thread(() -> {
            try {
                String token = PlayerActivity.prefs(app).getString("token", "");
                if (token.isEmpty()) return;
                Net.postJson(Net.SITE + "/api/public/player", new JSONObject().put("action", "channel_health")
                        .put("device_token", token).put("name", name.trim()).put("status", status).toString());
            } catch (Exception ignored) { /* best effort */ }
        }).start();
    }

    /** True when a channel listed in the sports event's `unavailable` array. */
    static boolean crossed(org.json.JSONObject event, String channel) {
        org.json.JSONArray a = event == null ? null : event.optJSONArray("unavailable");
        if (a == null || channel == null) return false;
        for (int i = 0; i < a.length(); i++) if (channel.equalsIgnoreCase(a.optString(i))) return true;
        return false;
    }

    /** A crossed channel before its event starts is usually just not live yet. */
    static boolean beforeStart(org.json.JSONObject e, long nowMs) {
        return beforeStart(e == null ? 0 : e.optLong("start"), nowMs);
    }
    static boolean beforeStart(long startMs, long nowMs) { return startMs > 0 && nowMs < startMs; }
}
