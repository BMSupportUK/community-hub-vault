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
