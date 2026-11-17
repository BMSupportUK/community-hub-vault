package uk.bmsupport.player;

import android.app.Activity;
import android.app.AlertDialog;
import android.widget.Toast;
import org.json.JSONArray;
import org.json.JSONObject;

/** Changes only the tunnel location; the active playback screen stays mounted. */
final class VpnLocationDialog {
    private VpnLocationDialog() {}

    static void show(Activity a) {
        String token = PlayerActivity.prefs(a).getString("token", "");
        if (token == null || token.isEmpty() || !BoxVpn.present) return;
        if (!BoxVpn.on()) {
            Toast.makeText(a, "Switch VPN on in Settings first", Toast.LENGTH_SHORT).show();
            return;
        }
        AlertDialog dialog = new AlertDialog.Builder(a)
                .setTitle("VPN location" + (BoxVpn.server.isEmpty() ? "" : " · " + BoxVpn.server))
                .setMessage("Loading VPN locations…")
                .setNegativeButton("Keep watching", null).create();
        dialog.show();
        new Thread(() -> {
            try {
                JSONArray servers = new JSONObject(Net.postJson(Net.SITE + "/api/public/player",
                        new JSONObject().put("action", "vpn_servers").put("device_token", token).toString())).optJSONArray("servers");
                if (servers == null || servers.length() == 0) throw new IllegalStateException("No servers");
                a.runOnUiThread(() -> {
                    if (a.isFinishing() || a.isDestroyed() || !dialog.isShowing()) return;
                    dialog.dismiss();
                    VpnServerList.show(a, servers, id -> change(a, token, id), "Keep watching");
                });
            } catch (Exception e) {
                a.runOnUiThread(() -> {
                    if (a.isFinishing() || a.isDestroyed() || !dialog.isShowing()) return;
                    dialog.setMessage("Couldn't load VPN locations. Close this and try again.");
                });
            }
        }, "vpn-locations").start();
    }

    private static void change(Activity a, String token, Integer serverId) {
        Toast.makeText(a, "Changing VPN location…", Toast.LENGTH_SHORT).show();
        new Thread(() -> {
            try {
                JSONObject request = new JSONObject().put("action", "vpn_command").put("device_token", token)
                        .put("command", serverId == null ? "best" : "server");
                if (serverId != null) request.put("server_id", serverId);
                Net.postJson(Net.SITE + "/api/public/player", request.toString());
                BoxVpn.sync(a, token);
                a.runOnUiThread(() -> {
                    if (a.isFinishing() || a.isDestroyed()) return;
                    BoxVpn.badge(a);
                    Toast.makeText(a, BoxVpn.on() ? "VPN · " + BoxVpn.server : "VPN couldn't reconnect. Try another location.", Toast.LENGTH_SHORT).show();
                });
            } catch (Exception e) {
                a.runOnUiThread(() -> {
                    if (!a.isFinishing() && !a.isDestroyed()) Toast.makeText(a, "Couldn't change VPN location. Try again.", Toast.LENGTH_LONG).show();
                });
            }
        }, "vpn-location-change").start();
    }
}