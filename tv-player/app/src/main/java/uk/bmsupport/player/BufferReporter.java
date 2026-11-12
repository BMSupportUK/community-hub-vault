package uk.bmsupport.player;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/** Quietly queues buffering stalls and sends them to the website in small batches. */
final class BufferReporter {
    static final int BATCH = 20;
    static final int QUEUE_MAX = 100;
    private static final List<JSONObject> queue = new ArrayList<>();

    private BufferReporter() {}

    static void record(Context c, String kind, String id, String name, long stallMs, boolean reconnected) {
        record(c, kind, id, name, stallMs, reconnected, false);
    }

    static void record(Context c, String kind, String id, String name, long stallMs, boolean reconnected, boolean freeze) {
        record(c, kind, id, name, stallMs, reconnected, freeze, null);
    }

    /** cause: provider_cut, advert_switch or network_drop (null lets the website work it out). */
    static void record(Context c, String kind, String id, String name, long stallMs, boolean reconnected, boolean freeze, String cause) {
        record(c, kind, id, name, stallMs, reconnected, freeze, cause, null, null, null, null);
    }
    static void record(Context c, String kind, String id, String name, long stallMs, boolean reconnected, boolean freeze, String cause, String format, String decoder, String provider, String event) {
        if (stallMs < StreamRecovery.MIN_REPORT_MS && !reconnected) return;
        try {
            JSONObject e = new JSONObject().put("kind", kind == null ? "live" : kind).put("content_id", id == null ? "" : id)
                    .put("name", name == null ? "" : name).put("stall_ms", stallMs).put("reconnected", reconnected).put("freeze", freeze).put("cause", cause == null ? JSONObject.NULL : cause)
                    .put("at", System.currentTimeMillis());
            if (format != null) e.put("stream_format", format);
            if (decoder != null) e.put("decoder", decoder);
            if (provider != null) e.put("recovery_provider", provider);
            if (event != null) e.put("event_name", event.substring(0, Math.min(200, event.length())));
            int size;
            synchronized (queue) { if (queue.size() >= QUEUE_MAX) queue.remove(0); queue.add(e); size = queue.size(); }
            if (size >= 10) flush(c);
        } catch (Exception ignored) {}
    }

    /** A customer swapped away from this channel; counted separately from stalls on the website. */
    static void swap(Context c, String id, String name, String to, String reason, String event) {
        try {
            JSONObject e = new JSONObject().put("kind", "live").put("content_id", id == null ? "" : id).put("name", name == null ? "" : name)
                .put("stall_ms", 0).put("reconnected", false).put("freeze", false).put("swapped_to", to == null ? "" : to.substring(0, Math.min(200, to.length())))
                .put("swap_reason", reason).put("at", System.currentTimeMillis());
            if (event != null) e.put("event_name", event.substring(0, Math.min(200, event.length())));
            synchronized (queue) { if (queue.size() >= QUEUE_MAX) queue.remove(0); queue.add(e); }
            flush(c);
        } catch (Exception ignored) {}
    }

    // ---------- feed switches (picture/sound/timing changes, provider restarts) for the admin report ----------
    static final long SWITCH_DEDUPE_MS = 30_000;
    private static final List<JSONObject> switches = new ArrayList<>();
    private static final java.util.Map<String, Long> switchSeen = new java.util.HashMap<>();
    /** True when this switch is new enough to count (same channel + type once per 30 seconds). */
    static boolean countSwitch(String key, long now) {
        synchronized (switchSeen) {
            Long prev = switchSeen.get(key);
            if (prev != null && now - prev < SWITCH_DEDUPE_MS) return false;
            if (switchSeen.size() > 500) switchSeen.clear();
            switchSeen.put(key, now);
            return true;
        }
    }
    static void feedSwitch(Context c, String id, String name, String category, String type, boolean stalled) {
        long now = System.currentTimeMillis();
        if (!countSwitch(type + "|" + (id == null || id.isEmpty() ? name : id), now)) return;
        try {
            JSONObject e = new JSONObject().put("type", type).put("content_id", id == null ? "" : id).put("name", name == null ? "" : name).put("stalled", stalled).put("at", now);
            if (category != null && !category.isEmpty()) e.put("category", category.substring(0, Math.min(200, category.length())));
            int size;
            synchronized (switches) { if (switches.size() >= 50) switches.remove(0); switches.add(e); size = switches.size(); }
            if (size >= 20) flush(c);
        } catch (Exception ignored) {}
    }

    static int pending() { synchronized (queue) { return queue.size(); } }

    static List<JSONObject> take(int max) {
        synchronized (queue) {
            List<JSONObject> out = new ArrayList<>(queue.subList(0, Math.min(max, queue.size())));
            queue.subList(0, out.size()).clear();
            return out;
        }
    }

    static void flush(Context c) {
        final Context app = c.getApplicationContext();
        final List<JSONObject> batch = take(BATCH);
        final List<JSONObject> sw;
        synchronized (switches) { sw = new ArrayList<>(switches); switches.clear(); }
        if (!sw.isEmpty()) new Thread(() -> {
            try {
                JSONObject body = new JSONObject().put("action", "feed_switches")
                        .put("device_token", PlayerActivity.prefs(app).getString("token", "")).put("switches", new JSONArray(sw));
                Net.postJson(Net.SITE + "/api/public/player", body.toString());
            } catch (Exception ignored) {}
        }).start();
        if (batch.isEmpty()) return;
        new Thread(() -> {
            try {
                JSONObject body = new JSONObject().put("action", "buffering")
                        .put("device_token", PlayerActivity.prefs(app).getString("token", ""))
                        .put("events", new JSONArray(batch));
                Net.postJson(Net.SITE + "/api/public/player", body.toString());
            } catch (Exception ignored) { /* best effort; dropped events are fine */ }
        }).start();
    }
}
