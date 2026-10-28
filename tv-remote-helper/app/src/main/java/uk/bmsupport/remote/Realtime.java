package uk.bmsupport.remote;

import android.os.Handler;
import android.os.Looper;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.atomic.AtomicInteger;
import kotlin.Pair;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;
import org.json.JSONObject;

/** Minimal Supabase realtime (Phoenix) websocket: joins one broadcast topic and exchanges events. */
public final class Realtime {
    public interface OnEvent {
        void onEvent(String event, JSONObject payload);
    }

    private final String topic;
    private final String full;
    private final OnEvent onEvent;
    private final AtomicInteger ref = new AtomicInteger(1);
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ConcurrentLinkedQueue<Pair<String, JSONObject>> pending = new ConcurrentLinkedQueue<>();
    private volatile boolean joined;
    private WebSocket ws;

    private final Runnable beat = new Runnable() {
        @Override
        public void run() {
            raw("phoenix", "heartbeat", new JSONObject());
            main.postDelayed(this, 25000L);
        }
    };

    public Realtime(String topic, OnEvent onEvent) {
        this.topic = topic;
        this.full = "realtime:" + topic;
        this.onEvent = onEvent;
    }

    public void connect() {
        String url = BuildConfig.REALTIME_URL + "?apikey=" + BuildConfig.ANON_KEY + "&vsn=1.0.0";
        ws = Api.INSTANCE.http().newWebSocket(new Request.Builder().url(url).build(), new WebSocketListener() {
            @Override
            public void onOpen(WebSocket webSocket, Response response) {
                joined = false;
                JSONObject config = new JSONObject()
                        .put("config", new JSONObject()
                                .put("broadcast", new JSONObject().put("self", false))
                                .put("presence", new JSONObject().put("key", ""))
                                .put("private", false));
                raw(full, "phx_join", config);
                main.postDelayed(beat, 25000L);
            }

            @Override
            public void onMessage(WebSocket webSocket, String text) {
                try {
                    JSONObject msg = new JSONObject(text);
                    if (!full.equals(msg.optString("topic"))) return;
                    String event = msg.optString("event");
                    if ("phx_reply".equals(event)) {
                        if (!joined) {
                            joined = true;
                            Pair<String, JSONObject> p;
                            while ((p = pending.poll()) != null) send(p.getFirst(), p.getSecond());
                        }
                        return;
                    }
                    if (!"broadcast".equals(event)) return;
                    final JSONObject payload = msg.optJSONObject("payload");
                    if (payload == null) return;
                    main.post(() -> {
                        try {
                            onEvent.onEvent(payload.optString("event"), payload.optJSONObject("payload"));
                        } catch (Throwable ignore) {
                        }
                    });
                } catch (Throwable ignore) {
                }
            }
        });
    }

    public void send(String event, JSONObject payload) {
        if (!joined) {
            pending.add(new Pair<>(event, payload));
            return;
        }
        JSONObject body = new JSONObject()
                .put("type", "broadcast")
                .put("event", event)
                .put("payload", payload);
        raw(full, "broadcast", body);
    }

    private void raw(String t, String event, JSONObject payload) {
        WebSocket socket = ws;
        if (socket == null) return;
        try {
            String text = new JSONObject()
                    .put("topic", t)
                    .put("event", event)
                    .put("payload", payload)
                    .put("ref", String.valueOf(ref.getAndIncrement()))
                    .toString();
            socket.send(text);
        } catch (Throwable ignore) {
        }
    }

    public void close() {
        main.removeCallbacks(beat);
        WebSocket socket = ws;
        ws = null;
        if (socket != null) socket.close(1000, "bye");
    }
}
