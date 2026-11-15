package uk.bmsupport.player;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.net.VpnService;
import org.json.JSONObject;

/**
 * "VPN on your box": the website hands over a ready WireGuard setup (closest, least busy server already chosen)
 * and the box switches it on with the built-in WireGuard engine. Android asks once to allow the VPN.
 */
final class BoxVpn {
    static final int VPN_REQUEST = 7311;
    enum Step { NONE, UP, DOWN }

    private static com.wireguard.android.backend.GoBackend backend;
    private static String applied;     // setup currently running
    private static String pending;     // setup waiting for the customer's "allow VPN" answer
    private static String pendingServer;
    private static final com.wireguard.android.backend.Tunnel TUNNEL = new com.wireguard.android.backend.Tunnel() {
        @Override public String getName() { return "bmvpn"; }
        @Override public void onStateChange(State s) { }
    };

    private BoxVpn() { }

    /** What to do with the website's answer: switch on a new setup, switch off, or leave it running. */
    static Step decide(boolean present, boolean enabled, String config, String running) {
        if (!present || !enabled) return running == null ? Step.NONE : Step.DOWN;
        if (config == null || config.isEmpty()) return Step.NONE;
        return config.equals(running) ? Step.NONE : Step.UP;
    }

    /** Called from the background check-in. */
    static void sync(Activity a, String token) {
        try {
            JSONObject r = new JSONObject(Net.postJson(Net.SITE + "/api/public/player", new JSONObject().put("action", "vpn").put("device_token", token).toString()));
            JSONObject v = r.optJSONObject("vpn");
            String config = v == null ? null : v.optString("config", "");
            Step s = decide(v != null, v != null && v.optBoolean("enabled"), config, applied);
            if (s == Step.DOWN) { down(a); report(token, "off", null, "Turned off from the website", false); return; }
            if (s != Step.UP) return;
            String server = v.optString("server");
            Intent ask = VpnService.prepare(a);
            if (ask != null) {
                pending = config; pendingServer = server;
                a.runOnUiThread(() -> { try { a.startActivityForResult(ask, VPN_REQUEST); } catch (Exception ignored) { } });
                return;
            }
            up(a, token, config, server);
        } catch (Exception ignored) { }
    }

    /** The customer answered Android's "allow VPN" question. */
    static void permissionAnswered(Context c, String token, boolean allowed) {
        String cfg = pending, server = pendingServer; pending = null; pendingServer = null;
        if (cfg == null) return;
        new Thread(() -> {
            if (allowed) up(c, token, cfg, server);
            else report(token, "failed", server, "VPN permission was not allowed on the box", false);
        }).start();
    }

    private static synchronized void up(Context c, String token, String config, String server) {
        report(token, "connecting", server, null, false);
        try {
            if (backend == null) backend = new com.wireguard.android.backend.GoBackend(c.getApplicationContext());
            com.wireguard.config.Config cfg = com.wireguard.config.Config.parse(new java.io.ByteArrayInputStream(config.getBytes("UTF-8")));
            backend.setState(TUNNEL, com.wireguard.android.backend.Tunnel.State.UP, cfg);
            applied = config;
            report(token, "on", server, null, false);
        } catch (Exception e) {
            applied = null;
            // A server that won't connect is swapped for the next best one on the following check-in.
            report(token, "failed", server, "Could not connect to " + server, true);
        }
    }

    private static synchronized void down(Context c) {
        try { if (backend != null) backend.setState(TUNNEL, com.wireguard.android.backend.Tunnel.State.DOWN, null); } catch (Exception ignored) { }
        applied = null;
    }

    static boolean on() { return applied != null; }

    private static void report(String token, String status, String server, String detail, boolean badServer) {
        try {
            JSONObject b = new JSONObject().put("action", "vpn_status").put("device_token", token).put("status", status);
            if (server != null && !server.isEmpty()) b.put("server", server);
            if (detail != null) b.put("detail", detail);
            if (badServer) b.put("bad_server", true);
            Net.postJson(Net.SITE + "/api/public/player", b.toString());
        } catch (Exception ignored) { }
    }
}
