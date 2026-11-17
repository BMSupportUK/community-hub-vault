package uk.bmsupport.player;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

/** Times a quick connection from this box to each VPN server (outside the tunnel when Android allows) and writes "ping" into each row. */
final class VpnPing {
    private VpnPing() { }

    /** Returns id → ms for servers that answered; refused connections still count, they prove the round trip. */
    static JSONObject measure(Context c, JSONArray servers) {
        ConcurrentHashMap<Integer, Integer> out = new ConcurrentHashMap<>();
        if (servers == null) return new JSONObject();
        Network direct = directNetwork(c);
        ExecutorService pool = Executors.newFixedThreadPool(16);
        for (int i = 0; i < servers.length(); i++) {
            JSONObject row = servers.optJSONObject(i);
            if (row == null) continue;
            String ip = row.optString("ip", "");
            int id = row.optInt("id", -1);
            if (ip.isEmpty() || "null".equals(ip) || id <= 0) continue;
            pool.execute(() -> { int ms = time(direct, ip); if (ms > 0) out.put(id, ms); });
        }
        pool.shutdown();
        try { pool.awaitTermination(4, TimeUnit.SECONDS); } catch (InterruptedException ignored) { }
        pool.shutdownNow();
        JSONObject pings = new JSONObject();
        for (int i = 0; i < servers.length(); i++) {
            JSONObject row = servers.optJSONObject(i);
            if (row == null) continue;
            Integer ms = out.get(row.optInt("id", -1));
            try { if (ms != null) { row.put("ping", ms); pings.put(String.valueOf(row.optInt("id")), ms); } } catch (Exception ignored) { }
        }
        return pings;
    }

    private static int time(Network direct, String ip) {
        int best = -1;
        for (int t = 0; t < 2; t++) {
            long t0 = android.os.SystemClock.elapsedRealtime();
            try (java.net.Socket s = new java.net.Socket()) {
                if (direct != null) try { direct.bindSocket(s); } catch (Exception ignored) { }
                s.connect(new java.net.InetSocketAddress(ip, 443), 1500);
            } catch (java.net.ConnectException refused) {
                // A refusal is still an answer from the server.
            } catch (Exception e) { continue; }
            int ms = (int) Math.max(1, android.os.SystemClock.elapsedRealtime() - t0);
            best = best < 0 ? ms : Math.min(best, ms);
        }
        return best;
    }

    /** The box's own internet connection, not the VPN, so readings are from the box's location. */
    private static Network directNetwork(Context c) {
        try {
            ConnectivityManager cm = (ConnectivityManager) c.getSystemService(Context.CONNECTIVITY_SERVICE);
            for (Network n : cm.getAllNetworks()) {
                NetworkCapabilities nc = cm.getNetworkCapabilities(n);
                if (nc != null && nc.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) && nc.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_VPN)) return n;
            }
        } catch (Exception ignored) { }
        return null;
    }
}
