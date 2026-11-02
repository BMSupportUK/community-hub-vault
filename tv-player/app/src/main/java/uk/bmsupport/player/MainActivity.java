package uk.bmsupport.player;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.StateListDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ListView;
import android.widget.TextView;
import android.widget.Toast;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;

import org.json.JSONArray;
import org.json.JSONObject;

import java.net.URLEncoder;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * BM Player main screen. Same front screen on every device: three big tiles
 * (Live TV, Films, Series) and a row of smaller buttons.
 */
public class MainActivity extends Activity {
    private static final int BG = 0xFF0B1220, CARD = 0xFF16213A, ACCENT = 0xFFE11D48, TEXT = 0xFFF1F5F9, MUTED = 0xFF94A3B8;

    private final Handler ui = new Handler(Looper.getMainLooper());
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private SharedPreferences prefs;
    private Runnable pollTask;
    private String screen = "";
    private Runnable back;

    /** A playable or browsable entry. */
    static final class Item {
        String kind, id, name, ext, category;
        Item(String kind, String id, String name, String ext, String category) {
            this.kind = kind; this.id = id; this.name = name; this.ext = ext; this.category = category;
        }
        @Override public String toString() { return name; }
        JSONObject toJson() {
            JSONObject o = new JSONObject();
            try { o.put("kind", kind).put("id", id).put("name", name).put("ext", ext).put("category", category); } catch (Exception ignored) {}
            return o;
        }
        static Item fromJson(JSONObject o) {
            return new Item(o.optString("kind"), o.optString("id"), o.optString("name"), o.optString("ext"), o.optString("category"));
        }
    }

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        prefs = getSharedPreferences("bmplayer", MODE_PRIVATE);
        start();
        checkForUpdate(false);
    }

    @Override protected void onDestroy() { super.onDestroy(); stopPolling(); io.shutdownNow(); }

    @Override public boolean onKeyDown(int keyCode, KeyEvent e) {
        if (keyCode == KeyEvent.KEYCODE_BACK && back != null) { Runnable r = back; r.run(); return true; }
        return super.onKeyDown(keyCode, e);
    }

    // ---------- device + linking ----------

    private String platform() {
        if ("Amazon".equalsIgnoreCase(Build.MANUFACTURER)) return "firetv";
        if (getPackageManager().hasSystemFeature(PackageManager.FEATURE_LEANBACK)) return "android";
        return "phone";
    }

    private String deviceLabel() {
        switch (platform()) { case "firetv": return "Fire TV"; case "android": return "Android TV"; default: return "Android phone"; }
    }

    private void start() {
        if (prefs.getString("token", "").isEmpty()) {
            showMessage("Getting ready…", null);
            io.execute(() -> {
                try {
                    JSONObject r = new JSONObject(Net.postJson(Net.SITE + "/api/public/player",
                            new JSONObject().put("action", "register").put("platform", platform()).put("name", "BM Player – " + deviceLabel()).toString()));
                    prefs.edit().putString("token", r.getString("device_token")).apply();
                    ui.post(this::start);
                } catch (Exception ex) {
                    ui.post(() -> showMessage("Can't reach BM Support. Check the internet and try again.", this::start));
                }
            });
            return;
        }
        startPolling();
        if (hasLogin()) showHome(); else showLink();
    }

    private boolean hasLogin() {
        return !prefs.getString("user", "").isEmpty() && !prefs.getString("dns", "").isEmpty();
    }

    private void startPolling() {
        stopPolling();
        pollTask = new Runnable() {
            @Override public void run() {
                io.execute(MainActivity.this::pollOnce);
                ui.postDelayed(this, hasLogin() ? 60000 : 5000);
            }
        };
        ui.post(pollTask);
    }

    private void stopPolling() { if (pollTask != null) ui.removeCallbacks(pollTask); pollTask = null; }

    private void pollOnce() {
        try {
            JSONObject r = new JSONObject(Net.postJson(Net.SITE + "/api/public/player",
                    new JSONObject().put("action", "poll").put("device_token", prefs.getString("token", "")).toString()));
            boolean had = hasLogin();
            SharedPreferences.Editor ed = prefs.edit().putString("dns", r.optString("dns", ""));
            JSONObject c = r.optJSONObject("credentials");
            if (c != null) ed.putString("user", c.optString("username")).putString("pass", c.optString("password"));
            ed.apply();
            boolean now = hasLogin();
            if (c != null || had != now) ui.post(() -> {
                if (c != null) Toast.makeText(this, "Login received from BM Support", Toast.LENGTH_LONG).show();
                if (now) showHome(); else showLink();
            });
        } catch (Exception ex) {
            if (String.valueOf(ex.getMessage()).contains("401")) {
                prefs.edit().remove("token").apply();
                ui.post(this::start);
            }
        }
    }

    private void showLink() {
        screen = "link"; back = null;
        LinearLayout root = column();
        root.setGravity(Gravity.CENTER);
        root.addView(logo());
        root.addView(text("Link this " + deviceLabel(), 30, TEXT, true));
        TextView code = text("······", 64, ACCENT, true);
        code.setLetterSpacing(0.2f);
        root.addView(code);
        root.addView(text("On your phone or computer go to bmsupport.uk/send-to-app,\nsign in and enter this code. Your login will appear here automatically.", 18, MUTED, false));
        TextView status = text("", 16, MUTED, false);
        root.addView(status);
        Button again = button("New code", v -> showLink());
        root.addView(again);
        setContentView(root);
        io.execute(() -> {
            try {
                JSONObject r = new JSONObject(Net.postJson(Net.SITE + "/api/public/player",
                        new JSONObject().put("action", "code").put("device_token", prefs.getString("token", "")).toString()));
                String c = r.getString("code");
                ui.post(() -> { code.setText(c.substring(0, 3) + " " + c.substring(3)); status.setText("Code lasts 10 minutes"); });
            } catch (Exception ex) {
                ui.post(() -> status.setText("Couldn't get a code. Press New code to try again."));
            }
        });
        if (prefs.getString("dns", "").isEmpty() && !prefs.getString("user", "").isEmpty())
            status.setText("Login received — waiting for the server address from BM Support.");
    }

    // ---------- home ----------

    private void showHome() {
        screen = "home"; back = null;
        LinearLayout root = column();
        LinearLayout top = row();
        top.setGravity(Gravity.CENTER_VERTICAL);
        top.addView(logo());
        top.addView(text("  BM Player", 28, TEXT, true));
        root.addView(top);
        TextView account = text("Signed in as " + prefs.getString("user", ""), 15, MUTED, false);
        root.addView(account);

        LinearLayout tiles = row();
        tiles.setPadding(0, dp(20), 0, dp(12));
        tiles.addView(tile("Live TV", "📺", v -> browse("live")), weight(1, dp(170)));
        tiles.addView(tile("Films", "🎬", v -> browse("film")), weight(1, dp(170)));
        tiles.addView(tile("Series", "🎞", v -> browse("series")), weight(1, dp(170)));
        root.addView(tiles);

        LinearLayout small = row();
        small.addView(button("★ Favourites", v -> showSaved("fav", "Favourites")), weight(1, ViewGroup.LayoutParams.WRAP_CONTENT));
        small.addView(button("⟲ Recently watched", v -> showSaved("recent", "Recently watched")), weight(1, ViewGroup.LayoutParams.WRAP_CONTENT));
        small.addView(button("⚠ Report a problem", v -> showReport(null)), weight(1, ViewGroup.LayoutParams.WRAP_CONTENT));
        small.addView(button("⚙ Settings", v -> showSettings()), weight(1, ViewGroup.LayoutParams.WRAP_CONTENT));
        root.addView(small);
        setContentView(root);
        tiles.getChildAt(0).requestFocus();

        io.execute(() -> {
            try {
                JSONObject info = new JSONObject(Net.get(api(""))).optJSONObject("user_info");
                if (info == null) return;
                String exp = info.optString("exp_date", "");
                String status = info.optString("status", "");
                String line = "Signed in as " + prefs.getString("user", "") + (status.isEmpty() ? "" : " · " + status);
                if (!exp.isEmpty() && !"null".equals(exp)) {
                    java.text.SimpleDateFormat f = new java.text.SimpleDateFormat("d MMM yyyy", java.util.Locale.UK);
                    line += " · ends " + f.format(new java.util.Date(Long.parseLong(exp) * 1000));
                }
                String l = line;
                ui.post(() -> account.setText(l));
            } catch (Exception ignored) {}
        });
    }

    // ---------- browse ----------

    private String api(String action) throws Exception {
        String u = URLEncoder.encode(prefs.getString("user", ""), "UTF-8");
        String p = URLEncoder.encode(prefs.getString("pass", ""), "UTF-8");
        return prefs.getString("dns", "") + "/player_api.php?username=" + u + "&password=" + p + (action.isEmpty() ? "" : "&action=" + action);
    }

    private String streamUrl(Item it) { return streamUrls(it)[0]; }

    /** Addresses to try in order. Live tries MPEG-TS first (what most panels serve), then HLS. */
    private String[] streamUrls(Item it) {
        String d = prefs.getString("dns", "").replaceAll("/+$", ""), u = prefs.getString("user", ""), p = prefs.getString("pass", "");
        switch (it.kind) {
            case "live": {
                String base = d + "/live/" + u + "/" + p + "/" + it.id;
                String f = prefs.getString("format", "auto");
                if (f.equals("ts")) return new String[]{base + ".ts"};
                if (f.equals("hls")) return new String[]{base + ".m3u8"};
                return new String[]{base + ".ts", base + ".m3u8", d + "/" + u + "/" + p + "/" + it.id};
            }
            case "film": return new String[]{d + "/movie/" + u + "/" + p + "/" + it.id + "." + (it.ext.isEmpty() ? "mp4" : it.ext)};
            default: return new String[]{d + "/series/" + u + "/" + p + "/" + it.id + "." + (it.ext.isEmpty() ? "mp4" : it.ext)};
        }
    }

    // ---------- live channel preview ----------

    private androidx.media3.exoplayer.ExoPlayer preview;
    private Runnable previewTask;

    private void stopPreview() {
        if (previewTask != null) ui.removeCallbacks(previewTask);
        previewTask = null;
        if (preview != null) { preview.release(); preview = null; }
    }

    /** Starts the small preview a moment after the highlight settles, so scrolling stays smooth. */
    private void schedulePreview(Item it, androidx.media3.ui.PlayerView view, TextView status) {
        stopPreview();
        status.setText("Loading preview…");
        previewTask = () -> {
            preview = PlayerActivity.build(this);
            view.setPlayer(preview);
            preview.addListener(new androidx.media3.common.Player.Listener() {
                @Override public void onPlaybackStateChanged(int s) {
                    if (s == androidx.media3.common.Player.STATE_READY) status.setText("Press OK for full screen");
                }
            });
            PlayerActivity.playWithFallback(preview, streamUrls(it),
                    () -> status.setText("Preview unavailable – try Play with VLC"));
        };
        ui.postDelayed(previewTask, 700);
    }

    @Override protected void onPause() { super.onPause(); stopPreview(); }

    private void browse(String kind) {
        screen = "browse"; back = this::showHome;
        String title = kind.equals("live") ? "Live TV" : kind.equals("film") ? "Films" : "Series";
        String catAction = kind.equals("live") ? "get_live_categories" : kind.equals("film") ? "get_vod_categories" : "get_series_categories";
        String listAction = kind.equals("live") ? "get_live_streams" : kind.equals("film") ? "get_vod_streams" : "get_series";

        LinearLayout root = column();
        root.addView(text(title, 26, TEXT, true));
        TextView epg = text(kind.equals("live") ? "Pick a category" : "", 15, MUTED, false);
        root.addView(epg);
        stopPreview();
        LinearLayout panes = row();
        ListView cats = list(), items = list();
        panes.addView(cats, weight(1, ViewGroup.LayoutParams.MATCH_PARENT));
        panes.addView(items, weight(kind.equals("live") ? 1.3f : 2, ViewGroup.LayoutParams.MATCH_PARENT));
        androidx.media3.ui.PlayerView pv = null;
        TextView pvStatus = null;
        if (kind.equals("live")) {
            LinearLayout side = column();
            side.setPadding(16, 0, 0, 0);
            side.addView(text("Preview", 18, TEXT, true));
            pv = new androidx.media3.ui.PlayerView(this);
            pv.setUseController(false);
            pv.setBackgroundColor(Color.BLACK);
            pv.setFocusable(false);
            side.addView(pv, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
            pvStatus = text("Highlight a channel to preview it", 14, MUTED, false);
            side.addView(pvStatus);
            panes.addView(side, weight(1.7f, ViewGroup.LayoutParams.MATCH_PARENT));
        }
        final androidx.media3.ui.PlayerView previewView = pv;
        final TextView previewStatus = pvStatus;
        root.addView(panes, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        setContentView(root);

        List<String[]> catRows = new ArrayList<>();
        io.execute(() -> {
            try {
                JSONArray a = new JSONArray(Net.get(api(catAction)));
                List<String> names = new ArrayList<>();
                for (int i = 0; i < a.length(); i++) {
                    JSONObject o = a.getJSONObject(i);
                    catRows.add(new String[]{o.optString("category_id"), o.optString("category_name")});
                    names.add(o.optString("category_name"));
                }
                ui.post(() -> { cats.setAdapter(adapter(names)); cats.requestFocus(); });
            } catch (Exception ex) { ui.post(() -> epg.setText("Couldn't load categories. Check your login in Settings.")); }
        });

        cats.setOnItemClickListener((p, v, pos, id) -> {
            String[] c = catRows.get(pos);
            epg.setText("Loading " + c[1] + "…");
            io.execute(() -> {
                try {
                    JSONArray a = new JSONArray(Net.get(api(listAction) + "&category_id=" + URLEncoder.encode(c[0], "UTF-8")));
                    List<Item> list = new ArrayList<>();
                    for (int i = 0; i < a.length(); i++) {
                        JSONObject o = a.getJSONObject(i);
                        String sid = kind.equals("series") ? o.optString("series_id") : o.optString("stream_id");
                        list.add(new Item(kind, sid, o.optString("name"), o.optString("container_extension"), c[1]));
                    }
                    ui.post(() -> {
                        items.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_list_item_1, list) {
                            @Override public View getView(int i, View cv, ViewGroup parent) { return styleRow(super.getView(i, cv, parent)); }
                        });
                        epg.setText(c[1] + " · " + list.size() + (kind.equals("live") ? " channels" : " titles"));
                        items.requestFocus();
                    });
                } catch (Exception ex) { ui.post(() -> epg.setText("Couldn't load this category.")); }
            });
        });

        items.setOnItemClickListener((p, v, pos, id) -> {
            Item it = (Item) items.getItemAtPosition(pos);
            if (previewView != null && platform().equals("phone")) { loadEpg(it, epg); schedulePreview(it, previewView, previewStatus); }
            open(it);
        });
        if (kind.equals("live")) items.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            @Override public void onItemSelected(AdapterView<?> p, View v, int pos, long id) {
                Item it = (Item) items.getItemAtPosition(pos);
                loadEpg(it, epg);
                schedulePreview(it, previewView, previewStatus);
            }
            @Override public void onNothingSelected(AdapterView<?> p) {}
        });
    }

    private void loadEpg(Item it, TextView out) {
        io.execute(() -> {
            try {
                JSONArray l = new JSONObject(Net.get(api("get_short_epg") + "&stream_id=" + it.id + "&limit=2")).optJSONArray("epg_listings");
                StringBuilder sb = new StringBuilder(it.name);
                if (l != null) for (int i = 0; i < l.length(); i++) {
                    JSONObject e = l.getJSONObject(i);
                    String t = new String(Base64.decode(e.optString("title"), Base64.DEFAULT), "UTF-8");
                    String s = e.optString("start", "");
                    sb.append(i == 0 ? "  ·  Now: " : "  ·  Next: ").append(s.length() >= 16 ? s.substring(11, 16) + " " : "").append(t);
                }
                ui.post(() -> out.setText(sb.toString()));
            } catch (Exception ignored) { ui.post(() -> out.setText(it.name)); }
        });
    }

    private void open(Item it) {
        if (it.kind.equals("series")) { showSeries(it); return; }
        String fav = isSaved("fav", it) ? "Remove from favourites" : "Add to favourites";
        String[] opts = {"Play", "Play with VLC", fav, "Report a problem"};
        new AlertDialog.Builder(this).setTitle(it.name).setItems(opts, (d, w) -> {
            if (w == 0) play(it, defaultVlc());
            else if (w == 1) play(it, true);
            else if (w == 2) toggleSaved("fav", it);
            else showReport(it);
        }).show();
    }

    private void showSeries(Item show) {
        Runnable prev = back;
        back = () -> browse("series");
        LinearLayout root = column();
        root.addView(text(show.name, 26, TEXT, true));
        TextView info = text("Loading episodes…", 15, MUTED, false);
        root.addView(info);
        LinearLayout btns = row();
        btns.addView(button(isSaved("fav", show) ? "★ Remove favourite" : "☆ Add favourite", v -> toggleSaved("fav", show)));
        btns.addView(button("⚠ Report a problem", v -> showReport(show)));
        root.addView(btns);
        ListView eps = list();
        root.addView(eps, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        setContentView(root);
        io.execute(() -> {
            try {
                JSONObject all = new JSONObject(Net.get(api("get_series_info") + "&series_id=" + show.id)).optJSONObject("episodes");
                List<Item> list = new ArrayList<>();
                if (all != null) {
                    java.util.Iterator<String> seasons = all.keys();
                    while (seasons.hasNext()) {
                        String s = seasons.next();
                        JSONArray a = all.getJSONArray(s);
                        for (int i = 0; i < a.length(); i++) {
                            JSONObject e = a.getJSONObject(i);
                            String name = show.name + " – S" + s + " E" + e.optString("episode_num") + "  " + e.optString("title");
                            list.add(new Item("episode", e.optString("id"), name, e.optString("container_extension"), show.category));
                        }
                    }
                }
                ui.post(() -> {
                    eps.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_list_item_1, list) {
                        @Override public View getView(int i, View cv, ViewGroup parent) { return styleRow(super.getView(i, cv, parent)); }
                    });
                    info.setText(list.size() + " episodes");
                    eps.requestFocus();
                });
            } catch (Exception ex) { ui.post(() -> info.setText("Couldn't load episodes.")); }
        });
        eps.setOnItemClickListener((p, v, pos, id) -> {
            Item ep = (Item) eps.getItemAtPosition(pos);
            new AlertDialog.Builder(this).setTitle(ep.name).setItems(new String[]{"Play", "Play with VLC"},
                    (d, w) -> play(ep, w == 1 || (w == 0 && defaultVlc()))).show();
        });
    }

    private void play(Item it, boolean vlc) {
        remember("recent", it);
        String url = streamUrl(it);
        if (vlc) {
            Intent i = new Intent(Intent.ACTION_VIEW).setPackage("org.videolan.vlc").setDataAndTypeAndNormalize(Uri.parse(url), "video/*");
            i.putExtra("title", it.name);
            try { startActivity(i); }
            catch (Exception e) {
                new AlertDialog.Builder(this).setTitle("VLC isn't installed")
                        .setMessage("Install VLC from your app store (or Downloader) to use it as the player. Playing in BM Player instead.")
                        .setPositiveButton("OK", (d, w) -> play(it, false)).show();
            }
            return;
        }
        startActivity(new Intent(this, PlayerActivity.class).putExtra("url", url));
    }

    // ---------- favourites / recent ----------

    private JSONArray saved(String key) {
        try { return new JSONArray(prefs.getString(key, "[]")); } catch (Exception e) { return new JSONArray(); }
    }

    private boolean isSaved(String key, Item it) {
        JSONArray a = saved(key);
        for (int i = 0; i < a.length(); i++) {
            JSONObject o = a.optJSONObject(i);
            if (o != null && it.kind.equals(o.optString("kind")) && it.id.equals(o.optString("id"))) return true;
        }
        return false;
    }

    private void remember(String key, Item it) {
        JSONArray a = saved(key), out = new JSONArray();
        out.put(it.toJson());
        for (int i = 0; i < a.length() && out.length() < 30; i++) {
            JSONObject o = a.optJSONObject(i);
            if (o != null && !(it.kind.equals(o.optString("kind")) && it.id.equals(o.optString("id")))) out.put(o);
        }
        prefs.edit().putString(key, out.toString()).apply();
    }

    private void toggleSaved(String key, Item it) {
        if (isSaved(key, it)) {
            JSONArray a = saved(key), out = new JSONArray();
            for (int i = 0; i < a.length(); i++) {
                JSONObject o = a.optJSONObject(i);
                if (o != null && !(it.kind.equals(o.optString("kind")) && it.id.equals(o.optString("id")))) out.put(o);
            }
            prefs.edit().putString(key, out.toString()).apply();
            Toast.makeText(this, "Removed from favourites", Toast.LENGTH_SHORT).show();
        } else {
            remember(key, it);
            Toast.makeText(this, "Added to favourites", Toast.LENGTH_SHORT).show();
        }
    }

    private void showSaved(String key, String title) {
        screen = key; back = this::showHome;
        LinearLayout root = column();
        root.addView(text(title, 26, TEXT, true));
        JSONArray a = saved(key);
        List<Item> list = new ArrayList<>();
        for (int i = 0; i < a.length(); i++) { JSONObject o = a.optJSONObject(i); if (o != null) list.add(Item.fromJson(o)); }
        if (list.isEmpty()) root.addView(text("Nothing here yet.", 18, MUTED, false));
        ListView lv = list();
        lv.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_list_item_1, list) {
            @Override public View getView(int i, View cv, ViewGroup parent) { return styleRow(super.getView(i, cv, parent)); }
        });
        lv.setOnItemClickListener((p, v, pos, id) -> {
            Item it = list.get(pos);
            if (it.kind.equals("episode")) play(it, defaultVlc()); else open(it);
        });
        root.addView(lv, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        setContentView(root);
        lv.requestFocus();
    }

    // ---------- report a problem ----------

    private void showReport(Item it) {
        String kind = it == null ? "live" : it.kind.equals("live") ? "live" : it.kind.equals("film") ? "film" : "series";
        StringBuilder q = new StringBuilder(Net.SITE + "/tickets?report=" + kind);
        try {
            if (it != null) q.append("&title=").append(URLEncoder.encode(it.name, "UTF-8"));
            if (it != null && it.category != null && !it.category.isEmpty()) q.append("&cat=").append(URLEncoder.encode(it.category, "UTF-8"));
            q.append("&device=").append(URLEncoder.encode(deviceLabel(), "UTF-8"));
        } catch (Exception ignored) {}
        String url = q.toString();
        LinearLayout box = column();
        box.setGravity(Gravity.CENTER_HORIZONTAL);
        ImageView qr = new ImageView(this);
        qr.setImageBitmap(qr(url, dp(260)));
        box.addView(qr);
        box.addView(text("Scan with your phone to open a support ticket" + (it == null ? "" : " about " + it.name) + ".\nOr go to bmsupport.uk/tickets", 16, TEXT, false));
        AlertDialog.Builder d = new AlertDialog.Builder(this).setTitle("Report a problem").setView(box).setNegativeButton("Close", null);
        if (platform().equals("phone")) d.setPositiveButton("Open on this phone", (x, w) -> startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))));
        d.show();
    }

    private Bitmap qr(String text, int size) {
        try {
            BitMatrix m = new QRCodeWriter().encode(text, BarcodeFormat.QR_CODE, size, size);
            Bitmap b = Bitmap.createBitmap(size, size, Bitmap.Config.RGB_565);
            for (int x = 0; x < size; x++) for (int y = 0; y < size; y++) b.setPixel(x, y, m.get(x, y) ? Color.BLACK : Color.WHITE);
            return b;
        } catch (Exception e) { return Bitmap.createBitmap(1, 1, Bitmap.Config.RGB_565); }
    }

    // ---------- settings ----------

    private boolean defaultVlc() { return "vlc".equals(prefs.getString("player", "internal")); }

    private String appVersion() {
        try { return getPackageManager().getPackageInfo(getPackageName(), 0).versionName; } catch (Exception e) { return "?"; }
    }

    /** One choice setting: shows the options and saves the picked value. */
    private void choose(String title, String key, String def, String[] labels, String[] values) {
        String cur = prefs.getString(key, def);
        int sel = 0;
        for (int i = 0; i < values.length; i++) if (values[i].equals(cur)) sel = i;
        new AlertDialog.Builder(this).setTitle(title).setSingleChoiceItems(labels, sel, (d, w) -> {
            prefs.edit().putString(key, values[w]).apply();
            d.dismiss();
            showSettings();
        }).setNegativeButton("Cancel", null).show();
    }

    private String label(String key, String def, String[] labels, String[] values) {
        String cur = prefs.getString(key, def);
        for (int i = 0; i < values.length; i++) if (values[i].equals(cur)) return labels[i];
        return labels[0];
    }

    private View settingBox(String icon, String title, String value, View.OnClickListener l) {
        LinearLayout t = column();
        t.setGravity(Gravity.CENTER);
        t.setPadding(dp(10), dp(14), dp(10), dp(14));
        t.setBackground(focusBg(16));
        t.setFocusable(true); t.setClickable(true);
        t.setOnClickListener(l);
        TextView ic = text(icon, 30, TEXT, false); ic.setGravity(Gravity.CENTER);
        TextView lb = text(title, 17, TEXT, true); lb.setGravity(Gravity.CENTER);
        TextView vl = text(value, 13, MUTED, false); vl.setGravity(Gravity.CENTER);
        t.addView(ic); t.addView(lb); t.addView(vl);
        return t;
    }

    private void showSettings() {
        screen = "settings"; back = this::showHome;
        LinearLayout root = column();
        root.addView(text("Settings", 26, TEXT, true));
        root.addView(text("Account: " + prefs.getString("user", "") + "  ·  " + deviceLabel() + "  ·  Version " + appVersion(), 15, MUTED, false));

        String[] playerL = {"BM Player (built-in)", "VLC"}, playerV = {"internal", "vlc"};
        String[] fmtL = {"Auto", "MPEG-TS (.ts)", "HLS (.m3u8)"}, fmtV = {"auto", "ts", "hls"};
        String[] bufL = {"Small", "Normal", "Large"}, bufV = {"small", "normal", "large"};
        String[] decL = {"Hardware", "Software"}, decV = {"hardware", "software"};
        String[] uaL = {"VLC", "BM Player", "IPTV Smarters"}, uaV = {PlayerActivity.UA, "BMPlayer/" + appVersion(), "IPTVSmartersPlayer"};

        List<View> boxes = new ArrayList<>();
        boxes.add(settingBox("▶", "Player", label("player", "internal", playerL, playerV),
                v -> choose("Default player", "player", "internal", playerL, playerV)));
        boxes.add(settingBox("📡", "Stream format", label("format", "auto", fmtL, fmtV),
                v -> choose("Live stream format", "format", "auto", fmtL, fmtV)));
        boxes.add(settingBox("⏳", "Buffer size", label("buffer", "normal", bufL, bufV),
                v -> choose("Buffer size", "buffer", "normal", bufL, bufV)));
        boxes.add(settingBox("🎞", "Decoder", label("decoder", "hardware", decL, decV),
                v -> choose("Video decoder", "decoder", "hardware", decL, decV)));
        boxes.add(settingBox("🌐", "User agent", label("ua", PlayerActivity.UA, uaL, uaV),
                v -> choose("User agent", "ua", PlayerActivity.UA, uaL, uaV)));
        boxes.add(settingBox("📺", "4K check", PlayerActivity.device4k(this) ? "4K device" : "Non 4K Device", v ->
                new AlertDialog.Builder(this).setTitle("4K check")
                        .setMessage(PlayerActivity.device4k(this)
                                ? "This TV and streaming device can play 4K."
                                : "Non 4K Device\n\nThis TV or streaming device can't show 4K. 4K channels and films may not play smoothly.")
                        .setPositiveButton("OK", null).show()));
        boxes.add(settingBox("⬆", "Update app", "Version " + appVersion(), v -> checkForUpdate(true)));
        boxes.add(settingBox("👤", "Change login", prefs.getString("user", ""), v -> {
            prefs.edit().remove("user").remove("pass").apply();
            showLink();
        }));
        boxes.add(settingBox("🕘", "Clear history", "Recently watched", v -> {
            prefs.edit().remove("recent").apply();
            Toast.makeText(this, "Recently watched cleared", Toast.LENGTH_SHORT).show();
        }));
        boxes.add(settingBox("★", "Clear favourites", "All favourites", v -> new AlertDialog.Builder(this)
                .setMessage("Remove all favourites from this device?")
                .setPositiveButton("Clear", (d, w) -> { prefs.edit().remove("fav").apply(); Toast.makeText(this, "Favourites cleared", Toast.LENGTH_SHORT).show(); })
                .setNegativeButton("Cancel", null).show()));
        boxes.add(settingBox("⚠", "Report a problem", "Opens a ticket", v -> showReport(null)));
        boxes.add(settingBox("🔗", "Unlink device", "Remove login", v -> new AlertDialog.Builder(this)
                .setMessage("This removes the login from this device. You'll need a new code to link it again.")
                .setPositiveButton("Unlink", (d, w) -> io.execute(() -> {
                    try { Net.postJson(Net.SITE + "/api/public/player",
                            new JSONObject().put("action", "unlink").put("device_token", prefs.getString("token", "")).toString()); } catch (Exception ignored) {}
                    prefs.edit().clear().apply();
                    ui.post(this::start);
                })).setNegativeButton("Cancel", null).show()));

        int cols = platform().equals("phone") ? 2 : 4;
        LinearLayout grid = new LinearLayout(this);
        grid.setOrientation(LinearLayout.VERTICAL);
        for (int i = 0; i < boxes.size(); i += cols) {
            LinearLayout r = row();
            for (int j = i; j < i + cols; j++) {
                View box = j < boxes.size() ? boxes.get(j) : new View(this);
                r.addView(box, weight(1, ViewGroup.LayoutParams.WRAP_CONTENT));
            }
            grid.addView(r);
        }
        android.widget.ScrollView sc = new android.widget.ScrollView(this);
        sc.addView(grid);
        root.addView(sc, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        setContentView(root);
        boxes.get(0).requestFocus();
    }

    // ---------- self update ----------

    private static int[] parts(String v) {
        String[] s = v.replaceAll("[^0-9.]", "").split("\\.");
        int[] o = new int[4];
        for (int i = 0; i < Math.min(4, s.length); i++) try { o[i] = Integer.parseInt(s[i]); } catch (Exception ignored) {}
        return o;
    }

    static boolean newer(String latest, String current) {
        int[] a = parts(latest), b = parts(current);
        for (int i = 0; i < 4; i++) if (a[i] != b[i]) return a[i] > b[i];
        return false;
    }

    /** Checks the website for a newer BM Player; `manual` also reports "up to date". */
    private void checkForUpdate(boolean manual) {
        if (manual) Toast.makeText(this, "Checking for updates…", Toast.LENGTH_SHORT).show();
        io.execute(() -> {
            try {
                JSONObject o = new JSONObject(Net.get(Net.SITE + "/api/public/player-apk?info=1"));
                String latest = o.optString("version");
                ui.post(() -> {
                    if (newer(latest, appVersion())) {
                        new AlertDialog.Builder(this).setTitle("Update available – version " + latest)
                                .setMessage((o.optString("notes").isEmpty() ? "" : o.optString("notes") + "\n\n") + "You have version " + appVersion() + ".")
                                .setPositiveButton("Update now", (d, w) -> downloadUpdate())
                                .setNegativeButton("Later", null).show();
                    } else if (manual) {
                        Toast.makeText(this, "You have the latest version (" + appVersion() + ")", Toast.LENGTH_LONG).show();
                    }
                });
            } catch (Exception e) {
                if (manual) ui.post(() -> Toast.makeText(this, "Couldn't check for updates. Try again later.", Toast.LENGTH_LONG).show());
            }
        });
    }

    private void downloadUpdate() {
        if (Build.VERSION.SDK_INT >= 26 && !getPackageManager().canRequestPackageInstalls()) {
            new AlertDialog.Builder(this).setTitle("Allow BM Player to update")
                    .setMessage("Turn on \"Allow from this source\" for BM Player, then press Back and choose Update now again.")
                    .setPositiveButton("Open settings", (d, w) -> {
                        try { startActivity(new Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getPackageName()))); }
                        catch (Exception e) { startActivity(new Intent(android.provider.Settings.ACTION_SECURITY_SETTINGS)); }
                    }).setNegativeButton("Cancel", null).show();
            return;
        }
        AlertDialog progress = new AlertDialog.Builder(this).setTitle("Downloading update…").setMessage("0%").setCancelable(false).show();
        io.execute(() -> {
            try {
                java.io.File dir = new java.io.File(getCacheDir(), "updates");
                dir.mkdirs();
                java.io.File apk = new java.io.File(dir, "BM-Player.apk");
                java.net.HttpURLConnection c = (java.net.HttpURLConnection) new java.net.URL(Net.SITE + "/api/public/player-apk").openConnection();
                c.setConnectTimeout(15000); c.setReadTimeout(60000);
                if (c.getResponseCode() != 200) throw new Exception("HTTP " + c.getResponseCode());
                long total = c.getContentLengthLong(), done = 0;
                try (java.io.InputStream in = c.getInputStream(); java.io.FileOutputStream out = new java.io.FileOutputStream(apk)) {
                    byte[] buf = new byte[65536]; int n; int last = -1;
                    while ((n = in.read(buf)) > 0) {
                        out.write(buf, 0, n); done += n;
                        int pct = total > 0 ? (int) (done * 100 / total) : 0;
                        if (pct != last) { last = pct; int p = pct; ui.post(() -> progress.setMessage(p + "%")); }
                    }
                }
                ui.post(() -> {
                    progress.dismiss();
                    Uri uri = androidx.core.content.FileProvider.getUriForFile(this, "uk.bmsupport.player.files", apk);
                    Intent i = new Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
                            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(i);
                });
            } catch (Exception e) {
                ui.post(() -> { progress.dismiss(); Toast.makeText(this, "Update download failed. Try again later.", Toast.LENGTH_LONG).show(); });
            }
        });
    }

    private void showMessage(String msg, Runnable retry) {
        LinearLayout root = column();
        root.setGravity(Gravity.CENTER);
        root.addView(logo());
        root.addView(text(msg, 20, TEXT, false));
        if (retry != null) root.addView(button("Try again", v -> retry.run()));
        setContentView(root);
    }

    // ---------- tiny UI kit ----------

    private int dp(int v) { return Math.round(v * getResources().getDisplayMetrics().density); }

    private LinearLayout column() {
        LinearLayout l = new LinearLayout(this);
        l.setOrientation(LinearLayout.VERTICAL);
        l.setBackgroundColor(BG);
        l.setPadding(dp(32), dp(24), dp(32), dp(24));
        return l;
    }

    private LinearLayout row() { LinearLayout l = new LinearLayout(this); l.setOrientation(LinearLayout.HORIZONTAL); return l; }

    private LinearLayout.LayoutParams weight(float w, int h) {
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(0, h, w);
        p.setMargins(dp(6), dp(6), dp(6), dp(6));
        return p;
    }

    private TextView text(String s, int sp, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setText(s); t.setTextSize(sp); t.setTextColor(color);
        t.setPadding(0, dp(6), 0, dp(6));
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        return t;
    }

    private ImageView logo() {
        ImageView i = new ImageView(this);
        i.setImageResource(R.drawable.bm_logo);
        i.setAdjustViewBounds(true);
        i.setLayoutParams(new LinearLayout.LayoutParams(dp(72), dp(72)));
        return i;
    }

    private StateListDrawable focusBg(int radius) {
        GradientDrawable on = new GradientDrawable(); on.setColor(CARD); on.setCornerRadius(dp(radius)); on.setStroke(dp(3), ACCENT);
        GradientDrawable off = new GradientDrawable(); off.setColor(CARD); off.setCornerRadius(dp(radius));
        StateListDrawable s = new StateListDrawable();
        s.addState(new int[]{android.R.attr.state_focused}, on);
        s.addState(new int[]{android.R.attr.state_pressed}, on);
        s.addState(new int[]{}, off);
        return s;
    }

    private Button button(String label, View.OnClickListener l) {
        Button b = new Button(this);
        b.setText(label); b.setAllCaps(false); b.setTextColor(TEXT); b.setTextSize(16);
        b.setBackground(focusBg(12));
        b.setPadding(dp(16), dp(12), dp(16), dp(12));
        b.setFocusable(true);
        b.setOnClickListener(l);
        return b;
    }

    private View tile(String label, String icon, View.OnClickListener l) {
        LinearLayout t = column();
        t.setGravity(Gravity.CENTER);
        t.setBackground(focusBg(20));
        t.setFocusable(true); t.setClickable(true);
        t.setOnClickListener(l);
        TextView ic = text(icon, 48, TEXT, false); ic.setGravity(Gravity.CENTER);
        TextView lb = text(label, 24, TEXT, true); lb.setGravity(Gravity.CENTER);
        t.addView(ic); t.addView(lb);
        return t;
    }

    private ListView list() {
        ListView l = new ListView(this);
        l.setBackgroundColor(CARD);
        l.setSelector(focusBg(8));
        l.setDivider(null);
        l.setPadding(dp(6), dp(6), dp(6), dp(6));
        return l;
    }

    private View styleRow(View v) {
        if (v instanceof TextView) { ((TextView) v).setTextColor(TEXT); ((TextView) v).setTextSize(17); }
        return v;
    }

    private ArrayAdapter<String> adapter(List<String> names) {
        return new ArrayAdapter<>(this, android.R.layout.simple_list_item_1, names) {
            @Override public View getView(int i, View cv, ViewGroup parent) { return styleRow(super.getView(i, cv, parent)); }
        };
    }
}
