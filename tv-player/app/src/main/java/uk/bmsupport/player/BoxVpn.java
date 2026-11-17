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

    /** Last website answer, so the home screen knows whether to show the VPN icons. */
    static volatile boolean present, enabled;
    static volatile String server = "";

    private BoxVpn() { }

    /** Home-screen VPN icons: "best" = move to the best server now, "on"/"off" = switch the VPN. */
    static void command(Activity a, String token, String what, Runnable after) {
        new Thread(() -> {
            try {
                JSONObject b = new JSONObject().put("action", "vpn_command").put("device_token", token).put("command", what);
                if ("best".equals(what)) b.put("pings", bestPings(a, token));
                Net.postJson(Net.SITE + "/api/public/player", b.toString());
            } catch (Exception ignored) { }
            sync(a, token);
            if (after != null) a.runOnUiThread(after);
        }).start();
    }

    /** This box's own pings to every server, so "best" means lowest ping near where the box really is. */
    static JSONObject bestPings(Context c, String token) {
        try {
            org.json.JSONArray arr = new JSONObject(Net.postJson(Net.SITE + "/api/public/player", new JSONObject().put("action", "vpn_servers").put("device_token", token).toString())).optJSONArray("servers");
            return VpnPing.measure(c, arr);
        } catch (Exception e) { return new JSONObject(); }
    }

    /** Settings › VPN › Choose a server. */
    static void server(Activity a, String token, int serverId, Runnable after) {
        new Thread(() -> {
            try { Net.postJson(Net.SITE + "/api/public/player", new JSONObject().put("action", "vpn_command").put("device_token", token).put("command", "server").put("server_id", serverId).toString()); } catch (Exception ignored) { }
            sync(a, token);
            if (after != null) a.runOnUiThread(after);
        }).start();
    }

    /** Label for the on/off icon. */
    static String toggleLabel(boolean enabled, boolean running) {
        return enabled ? (running ? "🔒 VPN: On" : "🔒 VPN: Connecting") : "🔓 VPN: Off";
    }

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
            present = v != null; enabled = v != null && v.optBoolean("enabled"); server = v == null ? "" : v.optString("server", "");
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
            // The first request after the tunnel comes up can fail while it settles; keep trying so the website hears "on".
            new Thread(() -> { for (int i = 0; i < 6 && !reportOk(token, "on", server); i++) { try { Thread.sleep(3000); } catch (InterruptedException ignored) { return; } } }, "vpn-on-report").start();
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

    /** Small "● VPN" pill in the bottom-left corner of every BM Player screen: green on, amber connecting, red off. */
    static void badge(Activity a) {
        if (a == null) return;
        a.runOnUiThread(() -> {
            try {
                android.view.ViewGroup decor = (android.view.ViewGroup) a.getWindow().getDecorView();
                android.widget.TextView b = decor.findViewWithTag("bm_vpn_badge");
                // The home screen already shows the VPN light beside the version number at the top.
                boolean home = a instanceof MainActivity && ((MainActivity) a).onHomeScreen();
                if (!present || home) { if (b != null) b.setVisibility(android.view.View.GONE); return; }
                float d = a.getResources().getDisplayMetrics().density;
                if (b == null) {
                    b = new android.widget.TextView(a);
                    b.setTag("bm_vpn_badge");
                    b.setTextSize(12); b.setTextColor(0xFFFFFFFF);
                    b.setPadding((int) (8 * d), (int) (3 * d), (int) (10 * d), (int) (3 * d));
                    android.graphics.drawable.GradientDrawable bg = new android.graphics.drawable.GradientDrawable();
                    bg.setColor(0xB3000000); bg.setCornerRadius(12 * d); b.setBackground(bg);
                    b.setFocusable(false); b.setClickable(false); b.setElevation(20 * d);
                    android.widget.FrameLayout.LayoutParams lp = new android.widget.FrameLayout.LayoutParams(-2, -2, android.view.Gravity.BOTTOM | android.view.Gravity.START);
                    lp.leftMargin = (int) (12 * d); lp.bottomMargin = (int) (40 * d);
                    decor.addView(b, lp);
                }
                int col = !enabled ? 0xFFE53935 : on() ? 0xFF43A047 : 0xFFFFB300;
                android.text.SpannableString t = new android.text.SpannableString("● VPN" + (enabled && on() ? " on" : enabled ? " connecting" : " off"));
                t.setSpan(new android.text.style.ForegroundColorSpan(col), 0, 1, 0);
                b.setText(t);
                b.setContentDescription(t.toString());
                b.setVisibility(android.view.View.VISIBLE);
                b.bringToFront();
            } catch (Exception ignored) { }
        });
    }

    private static void report(String token, String status, String server, String detail, boolean badServer) { reportOk(token, status, server, detail, badServer); }
    private static boolean reportOk(String token, String status, String server) { return reportOk(token, status, server, null, false); }
    private static boolean reportOk(String token, String status, String server, String detail, boolean badServer) {
        try {
            JSONObject b = new JSONObject().put("action", "vpn_status").put("device_token", token).put("status", status);
            if (server != null && !server.isEmpty()) b.put("server", server);
            if (detail != null) b.put("detail", detail);
            if (badServer) b.put("bad_server", true);
            return new JSONObject(Net.postJson(Net.SITE + "/api/public/player", b.toString())).optBoolean("ok");
        } catch (Exception ignored) { return false; }
    }
}
