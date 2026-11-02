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
    private volatile boolean maintenance;
    private boolean adultUnlocked;
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
        if (Build.VERSION.SDK_INT >= 33) getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::goBack);
        start();
        checkForUpdate(false);
    }

    @Override protected void onDestroy() { super.onDestroy(); stopPolling(); io.shutdownNow(); }

    @Override public boolean onKeyDown(int keyCode, KeyEvent e) {
        if (keyCode == KeyEvent.KEYCODE_BACK) { goBack(); return true; }
        return super.onKeyDown(keyCode, e);
    }
    @SuppressWarnings("deprecation")
    @Override public void onBackPressed() { goBack(); }

    /** Back steps up one screen; only the front screen asks before closing the app. */
    private void goBack() {
        if (back != null) { Runnable r = back; r.run(); return; }
        if ("home".equals(screen)) {
            new AlertDialog.Builder(this).setTitle("Exit BM Player?")
                    .setPositiveButton("Exit", (d, w) -> finish())
                    .setNegativeButton("Stay", null).show();
            return;
        }
        finish();
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
                ui.postDelayed(this, maintenance ? 15000 : hasLogin() ? 60000 : 5000);
            }
        };
        ui.post(pollTask);
    }

    private void stopPolling() { if (pollTask != null) ui.removeCallbacks(pollTask); pollTask = null; }

    private void pollOnce() {
        try {
            JSONObject r = new JSONObject(Net.postJson(Net.SITE + "/api/public/player",
                    new JSONObject().put("action", "poll").put("device_token", prefs.getString("token", "")).toString()));
            JSONObject mt = r.optJSONObject("maintenance");
            boolean down = mt != null && mt.optBoolean("enabled");
            boolean wasDown = maintenance;
            maintenance = down;
            if (down) { String msg = mt.optString("message"); ui.post(() -> showMaintenance(msg)); return; }
            if (wasDown) ui.post(() -> { screen = ""; if (hasLogin()) showHome(); else showLink(); });
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
        tiles.addView(tileWithRefresh("Live TV", "📺", "live"), weight(1, ViewGroup.LayoutParams.WRAP_CONTENT));
        tiles.addView(tileWithRefresh("Films", "🎬", "film"), weight(1, ViewGroup.LayoutParams.WRAP_CONTENT));
        tiles.addView(tileWithRefresh("Series", "🎞", "series"), weight(1, ViewGroup.LayoutParams.WRAP_CONTENT));
        root.addView(tiles);
        autoDone = true;

        LinearLayout small = row();
        small.addView(button("🏆 Sports guide", v -> showSports()), weight(1, ViewGroup.LayoutParams.WRAP_CONTENT));
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
        TextView pvStatus = null, pvEpg = null;
        if (kind.equals("live")) {
            LinearLayout side = column();
            side.setPadding(16, 0, 0, 0);
            side.addView(text("Preview", 18, TEXT, true));
            pv = new androidx.media3.ui.PlayerView(this);
            pv.setUseController(false);
            pv.setBackgroundColor(Color.BLACK);
            pv.setFocusable(false);
            pv.setResizeMode(androidx.media3.ui.AspectRatioFrameLayout.RESIZE_MODE_FILL);
            pv.setShutterBackgroundColor(Color.BLACK);
            final androidx.media3.ui.PlayerView box = pv;
            side.addView(pv, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(200)));
            pv.addOnLayoutChangeListener((v, l, t, r, b2, ol, ot, or, ob) -> {
                int h = (r - l) * 9 / 16;
                if (h > 0 && Math.abs(v.getHeight() - h) > 2) { ViewGroup.LayoutParams lp = v.getLayoutParams(); lp.height = h; v.post(() -> v.setLayoutParams(lp)); }
            });
            pvStatus = text("Highlight a channel to preview it", 14, MUTED, false);
            side.addView(pvStatus);
            pvEpg = text("", 14, TEXT, false);
            pvEpg.setBackground(focusBg(10));
            pvEpg.setPadding(dp(12), dp(10), dp(12), dp(10));
            pvEpg.setMinLines(5);
            side.addView(pvEpg, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
            panes.addView(side, weight(1.7f, ViewGroup.LayoutParams.MATCH_PARENT));
        }
        final androidx.media3.ui.PlayerView previewView = pv;
        final TextView previewStatus = pvStatus, previewEpg = pvEpg;
        root.addView(panes, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        setContentView(root);

        List<String[]> catRows = new ArrayList<>();
        io.execute(() -> {
            try {
                JSONArray a = new JSONArray(cachedGet(kind, catAction, ""));
                List<String> names = new ArrayList<>();
                for (int i = 0; i < a.length(); i++) {
                    JSONObject o = a.getJSONObject(i);
                    if (hideAdult(o.optString("category_name"))) continue;
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
                    JSONArray a = new JSONArray(cachedGet(kind, listAction, "&category_id=" + URLEncoder.encode(c[0], "UTF-8")));
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
            if (previewView != null && platform().equals("phone")) { loadEpg(it, epg, previewEpg); schedulePreview(it, previewView, previewStatus); }
            open(it);
        });
        if (kind.equals("live")) items.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            @Override public void onItemSelected(AdapterView<?> p, View v, int pos, long id) {
                Item it = (Item) items.getItemAtPosition(pos);
                loadEpg(it, epg, previewEpg);
                schedulePreview(it, previewView, previewStatus);
            }
            @Override public void onNothingSelected(AdapterView<?> p) {}
        });
    }

    private String clock(long epochSec) {
        long shifted = (epochSec + prefs.getInt("epg_shift", 0) * 3600L) * 1000L;
        String f = "12".equals(prefs.getString("time_format", "24")) ? "h:mm a" : "HH:mm";
        return new java.text.SimpleDateFormat(f, java.util.Locale.UK).format(new java.util.Date(shifted));
    }

    /** Header line gets "Now", the mini guide box gets now (with progress) plus the next programmes. */
    private void loadEpg(Item it, TextView out, TextView box) {
        if (box != null) box.setText("TV guide for " + it.name + "…");
        io.execute(() -> {
            try {
                JSONArray l = new JSONObject(Net.get(api("get_short_epg") + "&stream_id=" + it.id + "&limit=6")).optJSONArray("epg_listings");
                StringBuilder head = new StringBuilder(it.name), guide = new StringBuilder();
                long nowSec = System.currentTimeMillis() / 1000;
                if (l != null) for (int i = 0; i < l.length(); i++) {
                    JSONObject e = l.getJSONObject(i);
                    String t = new String(Base64.decode(e.optString("title"), Base64.DEFAULT), "UTF-8");
                    long st = e.optLong("start_timestamp", 0), en = e.optLong("stop_timestamp", 0);
                    String times = st > 0 ? clock(st) + (en > 0 ? " – " + clock(en) : "") : e.optString("start", "");
                    if (i == 0) {
                        head.append("  ·  Now: ").append(t);
                        int pct = st > 0 && en > st ? (int) Math.max(0, Math.min(100, (nowSec - st) * 100 / (en - st))) : -1;
                        guide.append("NOW  ").append(times).append("\n").append(t);
                        if (pct >= 0) {
                            int bars = pct / 10;
                            StringBuilder bar = new StringBuilder();
                            for (int b = 0; b < 10; b++) bar.append(b < bars ? "▰" : "▱");
                            guide.append("\n").append(bar).append("  ").append(pct).append("%");
                        }
                        String desc = new String(Base64.decode(e.optString("description"), Base64.DEFAULT), "UTF-8").trim();
                        if (!desc.isEmpty()) guide.append("\n").append(desc.length() > 140 ? desc.substring(0, 140) + "…" : desc);
                        guide.append("\n\nUP NEXT");
                    } else {
                        guide.append("\n").append(st > 0 ? clock(st) : times).append("   ").append(t);
                    }
                }
                String g = guide.length() == 0 ? "No TV guide for this channel." : guide.toString();
                ui.post(() -> { out.setText(head.toString()); if (box != null) box.setText(g); });
            } catch (Exception ignored) {
                ui.post(() -> { out.setText(it.name); if (box != null) box.setText("No TV guide for this channel."); });
            }
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
        String[] timeL = {"24 hour", "12 hour"}, timeV = {"24", "12"};
        boxes.add(settingBox("🕒", "Time format", label("time_format", "24", timeL, timeV),
                v -> choose("Time format", "time_format", "24", timeL, timeV)));
        int shift = prefs.getInt("epg_shift", 0);
        boxes.add(settingBox("📅", "EPG time shift", (shift > 0 ? "+" : "") + shift + " h", v -> {
            String[] l = new String[25];
            for (int i = 0; i < 25; i++) l[i] = (i - 12 > 0 ? "+" : "") + (i - 12) + " hours";
            new AlertDialog.Builder(this).setTitle("EPG time shift").setSingleChoiceItems(l, prefs.getInt("epg_shift", 0) + 12, (d, w) -> {
                prefs.edit().putInt("epg_shift", w - 12).apply(); d.dismiss(); showSettings();
            }).setNegativeButton("Cancel", null).show();
        }));
        boxes.add(settingBox("🔒", "Parental control", prefs.getString("pin", "").isEmpty() ? "Off" : adultUnlocked ? "Unlocked" : "On", v -> parentalControl()));
        String[] autoL = {"Off", "Every time the app opens", "Once a day"}, autoV = {"off", "open", "daily"};
        boxes.add(settingBox("🔄", "Automation", label("auto_refresh", "daily", autoL, autoV),
                v -> choose("Update channels, films and series automatically", "auto_refresh", "daily", autoL, autoV)));
        boxes.add(settingBox("⚡", "Speed test", "Test your internet", v -> speedTest()));
        boxes.add(settingBox("ℹ", "Account info", "Status and expiry", v -> accountInfo()));
        boxes.add(settingBox("🧹", "Clear cache", "Reload all lists", v -> {
            clearCache(null);
            Toast.makeText(this, "Cache cleared – lists will reload", Toast.LENGTH_SHORT).show();
        }));
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

    // ---------- playlist cache + refresh ----------

    private java.io.File cacheFile(String kind, String key) {
        java.io.File d = new java.io.File(getCacheDir(), "playlist");
        d.mkdirs();
        return new java.io.File(d, kind + "_" + Integer.toHexString(key.hashCode()) + ".json");
    }

    /** Lists come from the cache until the user (or Automation) refreshes them. */
    private String cachedGet(String kind, String action, String extra) throws Exception {
        java.io.File f = cacheFile(kind, action + extra);
        if (f.exists() && f.length() > 0) {
            try (java.io.FileInputStream in = new java.io.FileInputStream(f)) {
                java.io.ByteArrayOutputStream b = new java.io.ByteArrayOutputStream();
                byte[] buf = new byte[65536]; int n;
                while ((n = in.read(buf)) > 0) b.write(buf, 0, n);
                return b.toString("UTF-8");
            } catch (Exception ignored) {}
        }
        String body = Net.get(api(action) + extra);
        try (java.io.FileOutputStream o = new java.io.FileOutputStream(f)) { o.write(body.getBytes("UTF-8")); }
        return body;
    }

    private void clearCache(String kind) {
        java.io.File[] fs = new java.io.File(getCacheDir(), "playlist").listFiles();
        if (fs != null) for (java.io.File f : fs) if (kind == null || f.getName().startsWith(kind + "_")) f.delete();
        if (kind == null) prefs.edit().remove("refreshed_live").remove("refreshed_film").remove("refreshed_series").apply();
    }

    /** Clears one section and downloads its categories and full list again. */
    private void refreshSection(String kind, TextView status) {
        String catAction = kind.equals("live") ? "get_live_categories" : kind.equals("film") ? "get_vod_categories" : "get_series_categories";
        String listAction = kind.equals("live") ? "get_live_streams" : kind.equals("film") ? "get_vod_streams" : "get_series";
        if (status != null) status.setText("Updating…");
        clearCache(kind);
        io.execute(() -> {
            try {
                cachedGet(kind, catAction, "");
                int n = new JSONArray(Net.get(api(listAction))).length();
                prefs.edit().putLong("refreshed_" + kind, System.currentTimeMillis()).apply();
                String what = kind.equals("live") ? " channels" : kind.equals("film") ? " films" : " series";
                ui.post(() -> {
                    if (status != null) status.setText(n + what + " · updated now");
                    Toast.makeText(this, (kind.equals("live") ? "Live TV" : kind.equals("film") ? "Films" : "Series") + " updated – " + n + what, Toast.LENGTH_SHORT).show();
                });
            } catch (Exception e) {
                ui.post(() -> { if (status != null) status.setText("Couldn't update. Try again."); });
            }
        });
    }

    private String refreshedLabel(String kind) {
        long t = prefs.getLong("refreshed_" + kind, 0);
        if (t == 0) return "Not updated yet";
        return "Updated " + new java.text.SimpleDateFormat("d MMM, " + ("12".equals(prefs.getString("time_format", "24")) ? "h:mm a" : "HH:mm"), java.util.Locale.UK).format(new java.util.Date(t));
    }

    private View tileWithRefresh(String label, String icon, String kind) {
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.addView(tile(label, icon, v -> browse(kind)), new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(170)));
        TextView status = text(refreshedLabel(kind), 13, MUTED, false);
        status.setGravity(Gravity.CENTER);
        Button r = button("⟳  Refresh " + label, v -> refreshSection(kind, status));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.topMargin = dp(8);
        col.addView(r, lp);
        col.addView(status);
        String auto = prefs.getString("auto_refresh", "daily");
        long last = prefs.getLong("refreshed_" + kind, 0);
        if (!autoDone && (auto.equals("open") || (auto.equals("daily") && System.currentTimeMillis() - last > 86_400_000L))) refreshSection(kind, status);
        return col;
    }
    private boolean autoDone;

    // ---------- maintenance ----------

    private void showMaintenance(String msg) {
        if ("maintenance".equals(screen)) return;
        stopPreview();
        screen = "maintenance"; back = null;
        LinearLayout root = column();
        root.setGravity(Gravity.CENTER);
        root.addView(logo());
        TextView h = text("Down for maintenance", 30, ACCENT, true); h.setGravity(Gravity.CENTER);
        TextView m = text(msg, 20, TEXT, false); m.setGravity(Gravity.CENTER);
        TextView s = text("BM Player will come back on by itself when we're finished.", 15, MUTED, false); s.setGravity(Gravity.CENTER);
        root.addView(h); root.addView(m); root.addView(s);
        setContentView(root);
    }

    // ---------- parental control ----------

    private boolean hideAdult(String category) {
        if (prefs.getString("pin", "").isEmpty() || adultUnlocked) return false;
        return category.toLowerCase(java.util.Locale.UK).matches(".*(adult|xxx|18\\+|porn|for adults).*");
    }

    private void askPin(String title, java.util.function.Consumer<String> done) {
        android.widget.EditText e = new android.widget.EditText(this);
        e.setInputType(android.text.InputType.TYPE_CLASS_NUMBER | android.text.InputType.TYPE_NUMBER_VARIATION_PASSWORD);
        e.setHint("4 digit PIN");
        new AlertDialog.Builder(this).setTitle(title).setView(e)
                .setPositiveButton("OK", (d, w) -> done.accept(e.getText().toString().trim()))
                .setNegativeButton("Cancel", null).show();
    }

    private void parentalControl() {
        String pin = prefs.getString("pin", "");
        if (pin.isEmpty()) {
            askPin("Set a parental PIN", p -> {
                if (!p.matches("\\d{4}")) { Toast.makeText(this, "Use 4 numbers", Toast.LENGTH_SHORT).show(); return; }
                prefs.edit().putString("pin", p).apply();
                adultUnlocked = false;
                Toast.makeText(this, "Parental control on – adult categories are hidden", Toast.LENGTH_LONG).show();
                showSettings();
            });
            return;
        }
        String[] opts = {adultUnlocked ? "Lock adult categories again" : "Unlock adult categories (until the app closes)", "Change PIN", "Turn parental control off"};
        new AlertDialog.Builder(this).setTitle("Parental control").setItems(opts, (d, w) -> {
            if (w == 0 && adultUnlocked) { adultUnlocked = false; showSettings(); return; }
            askPin("Enter your PIN", p -> {
                if (!p.equals(prefs.getString("pin", ""))) { Toast.makeText(this, "Wrong PIN", Toast.LENGTH_SHORT).show(); return; }
                if (w == 0) adultUnlocked = true;
                else if (w == 1) { prefs.edit().remove("pin").apply(); parentalControl(); return; }
                else { prefs.edit().remove("pin").apply(); adultUnlocked = false; }
                showSettings();
            });
        }).show();
    }

    // ---------- speed test + account ----------

    private void speedTest() {
        AlertDialog dlg = new AlertDialog.Builder(this).setTitle("Speed test").setMessage("Testing your download speed…").setPositiveButton("Close", null).show();
        io.execute(() -> {
            try {
                java.net.HttpURLConnection c = (java.net.HttpURLConnection) new java.net.URL("https://speed.cloudflare.com/__down?bytes=50000000").openConnection();
                c.setConnectTimeout(10000); c.setReadTimeout(15000);
                long start = System.nanoTime(), bytes = 0;
                try (java.io.InputStream in = c.getInputStream()) {
                    byte[] buf = new byte[65536]; int n;
                    while ((n = in.read(buf)) > 0) { bytes += n; if (System.nanoTime() - start > 8_000_000_000L) break; }
                }
                double secs = (System.nanoTime() - start) / 1e9, mbps = bytes * 8 / secs / 1e6;
                String verdict = mbps >= 25 ? "Good for 4K." : mbps >= 10 ? "Good for HD. 4K may buffer." : "Slow – HD may buffer. Try a wired connection.";
                ui.post(() -> dlg.setMessage(String.format(java.util.Locale.UK, "%.1f Mbps\n\n%s", mbps, verdict)));
            } catch (Exception e) {
                ui.post(() -> dlg.setMessage("Couldn't run the speed test. Check the internet."));
            }
        });
    }

    private void accountInfo() {
        AlertDialog dlg = new AlertDialog.Builder(this).setTitle("Account info").setMessage("Loading…").setPositiveButton("Close", null).show();
        io.execute(() -> {
            try {
                JSONObject info = new JSONObject(Net.get(api(""))).optJSONObject("user_info");
                if (info == null) throw new Exception();
                String exp = info.optString("exp_date", "");
                String ends = exp.isEmpty() || "null".equals(exp) ? "No expiry" :
                        new java.text.SimpleDateFormat("d MMM yyyy", java.util.Locale.UK).format(new java.util.Date(Long.parseLong(exp) * 1000));
                String msg = "Username: " + info.optString("username") + "\nStatus: " + info.optString("status")
                        + "\nExpires: " + ends + "\nConnections: " + info.optString("active_cons", "0") + " of " + info.optString("max_connections", "?")
                        + "\nDevice: " + deviceLabel() + "\nApp version: " + appVersion();
                ui.post(() -> dlg.setMessage(msg));
            } catch (Exception e) { ui.post(() -> dlg.setMessage("Couldn't load your account. Check your login.")); }
        });
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


    // ---------- sports guide ----------

    private Runnable sportsTask;
    private String sportsVersion = "";

    /** Mirrors src/lib/player-channel-match.ts normChannel. */
    static String normChannel(String name) {
        String s = name.toLowerCase(java.util.Locale.ROOT);
        s = s.replaceAll("^\\s*(?:\\|?[a-z]{2,3}\\s*[|:\\-]\\s*)+", " ");
        s = s.replaceAll("[^a-z0-9]+", " ");
        s = s.replaceAll("\\b(?:fhd|uhd|hd|sd|4k|hevc|h265|raw|backup|vip|channel|tv)\\b", " ");
        return s.replaceAll("\\s+", " ").trim();
    }
    private static final String[][] BUILT_IN_ALIASES = {
        {"sky sports pl", "sky sports premier league"}, {"sky sports me", "sky sports main event"},
        {"sky sports f1", "sky sports formula 1"}, {"bt sport 1", "tnt sports 1"}, {"bt sport 2", "tnt sports 2"},
        {"bt sport 3", "tnt sports 3"}, {"bt sport 4", "tnt sports 4"} };
    private static String alias(String n, List<String[]> aliases) {
        for (String[] a : aliases) if (normChannel(a[0]).equals(n)) return normChannel(a[1]);
        return n;
    }
    private static int quality(String n) {
        String l = n.toLowerCase(java.util.Locale.ROOT);
        return l.contains("fhd") || l.contains("1080") ? 3 : l.matches(".*\\bhd\\b.*") ? 2 : l.contains("uhd") || l.contains("4k") ? 1 : 0;
    }
    /** Mirrors matchChannel: exact normalised (with aliases), else whole-word partial; best quality first. */
    static List<Item> matchChannel(String guide, List<Item> playlist, List<String[]> aliases) {
        String want = alias(normChannel(guide), aliases);
        List<Item> out = new ArrayList<>();
        if (want.isEmpty()) return out;
        for (Item it : playlist) if (alias(normChannel(it.name), aliases).equals(want)) out.add(it);
        if (out.isEmpty()) for (Item it : playlist) {
            String n = normChannel(it.name);
            if (!n.isEmpty() && (" " + n + " ").contains(" " + want + " ")) out.add(it);
        }
        java.util.Collections.sort(out, (a, b) -> quality(b.name) != quality(a.name) ? quality(b.name) - quality(a.name) : a.name.length() - b.name.length());
        return out;
    }

    private List<Item> liveChannels = null;

    private void showSports() {
        screen = "sports"; sportsPick = null; compPick = null;
        back = () -> { if (sportsPick != null) { sportsUp(); return; } stopSports(); retryEvent = null; showHome(); };
        stopPreview();
        LinearLayout root = column();
        LinearLayout head = row();
        head.setGravity(Gravity.CENTER_VERTICAL);
        head.addView(text("Sports guide", 26, TEXT, true), weight(1, ViewGroup.LayoutParams.WRAP_CONTENT));
        TextView status = text("Loading…", 14, MUTED, false);
        head.addView(status);
        head.addView(button("⟳ Refresh", v -> loadSports(status, true)));
        root.addView(head);
        sportsHeading = text("Pick a sport", 15, MUTED, false);
        root.addView(sportsHeading);
        ListView lv = list();
        lv.setTag("sports");
        root.addView(lv, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        setContentView(root);
        sportsList = lv;
        sportsVersion = "";
        String cached = prefs.getString("sports_cache", "");
        if (!cached.isEmpty()) try { renderSports(new JSONObject(cached)); } catch (Exception ignored) {}
        loadSports(status, false);
        stopSports();
        sportsTask = new Runnable() { @Override public void run() {
            if (!"sports".equals(screen)) return;
            loadSports(status, false);
            ui.postDelayed(this, 60000);
        } };
        ui.postDelayed(sportsTask, 60000);
    }
    private ListView sportsList;
    private void stopSports() { if (sportsTask != null) ui.removeCallbacks(sportsTask); sportsTask = null; }

    private void loadSports(TextView status, boolean manual) {
        io.execute(() -> {
            try {
                String raw = Net.postJson(Net.SITE + "/api/public/player",
                        new JSONObject().put("action", "sports").put("device_token", prefs.getString("token", "")).toString());
                JSONObject r = new JSONObject(raw);
                prefs.edit().putString("sports_cache", raw).apply();
                if (liveChannels == null || manual) {
                    JSONArray a = new JSONArray(manual ? cachedGetFresh() : cachedGet("live", "get_live_streams", ""));
                    List<Item> l = new ArrayList<>();
                    for (int i = 0; i < a.length(); i++) {
                        JSONObject o = a.getJSONObject(i);
                        l.add(new Item("live", o.optString("stream_id"), o.optString("name"), "ts", o.optString("category_id")));
                    }
                    liveChannels = l;
                }
                String v = r.optString("version");
                ui.post(() -> {
                    if (!"sports".equals(screen)) return;
                    status.setText("Updated " + clock(System.currentTimeMillis() / 1000) + "  ");
                    if (manual || !v.equals(sportsVersion)) renderSports(r);
                });
            } catch (Exception e) {
                ui.post(() -> status.setText(manual ? "Couldn't update – check the connection  " : status.getText()));
            }
        });
    }
    private String cachedGetFresh() throws Exception { clearCache("live"); return cachedGet("live", "get_live_streams", ""); }

    private JSONObject sportsData; private String sportsPick = null, compPick = null;

    /** Sports guide in three levels: sport → competition → events; an event opens its channel picker. */
    private void renderSports(JSONObject r) {
        if (sportsList == null) return;
        sportsData = r;
        sportsVersion = r.optString("version");
        JSONArray ev = r.optJSONArray("events");
        List<String[]> aliases = new ArrayList<>();
        JSONArray al = r.optJSONArray("aliases");
        if (al != null) for (int i = 0; i < al.length(); i++) { JSONObject o = al.optJSONObject(i); if (o != null) aliases.add(new String[]{o.optString("from"), o.optString("to")}); }
        for (String[] x : BUILT_IN_ALIASES) aliases.add(x);
        long now = System.currentTimeMillis();
        java.text.SimpleDateFormat day = new java.text.SimpleDateFormat("EEE d MMM", java.util.Locale.UK);
        day.setTimeZone(java.util.TimeZone.getTimeZone("Europe/London"));
        java.util.LinkedHashMap<String, Integer> groups = new java.util.LinkedHashMap<>();
        java.util.Set<String> liveGroups = new java.util.HashSet<>();
        List<JSONObject> events = new ArrayList<>();
        if (ev != null) for (int i = 0; i < ev.length(); i++) {
            JSONObject e = ev.optJSONObject(i);
            if (e == null || e.optLong("start") < now - 3 * 3600_000L) continue;
            String sp = e.optString("sport"), comp = e.optString("competition", sp);
            if (comp.isEmpty()) comp = sp;
            String key;
            if (sportsPick == null) key = sp;
            else if (!sp.equals(sportsPick)) continue;
            else if (compPick == null) key = comp;
            else if (!comp.equals(compPick)) continue;
            else { events.add(e); continue; }
            groups.put(key, groups.containsKey(key) ? groups.get(key) + 1 : 1);
            if (e.optLong("start") <= now) liveGroups.add(key);
        }
        List<String> rows = new ArrayList<>();
        final List<Object> targets = new ArrayList<>();
        if (sportsPick != null) { rows.add("◀ Back"); targets.add("<back>"); }
        if (compPick == null) {
            for (java.util.Map.Entry<String, Integer> g : groups.entrySet()) {
                rows.add((liveGroups.contains(g.getKey()) ? "🔴 " : "") + g.getKey() + "   (" + g.getValue() + (g.getValue() == 1 ? " event)" : " events)") + "  ›");
                targets.add(g.getKey());
            }
        } else for (JSONObject e : events) {
            long start = e.optLong("start");
            JSONArray ch = e.optJSONArray("channels");
            int n = ch == null ? 0 : ch.length();
            rows.add((start <= now ? "🔴 LIVE NOW  " : day.format(new java.util.Date(start)) + "  " + clock(start / 1000) + "  ") + e.optString("title")
                    + "\n      📺 " + n + (n == 1 ? " channel" : " channels") + " – press OK to pick one");
            targets.add(e);
        }
        if (targets.isEmpty() || (targets.size() == 1 && sportsPick != null)) { rows.add("No upcoming events here right now"); targets.add(null); }
        if (sportsHeading != null) sportsHeading.setText(sportsPick == null ? "Pick a sport" : compPick == null ? sportsPick + " › pick a competition" : sportsPick + " › " + compPick + " › pick an event");
        int keep = sportsList.getSelectedItemPosition();
        sportsList.setAdapter(adapter(rows));
        if (keep > 0 && keep < rows.size()) sportsList.setSelection(keep);
        sportsList.requestFocus();
        sportsList.setOnItemClickListener((p, v, pos, id) -> {
            Object t = targets.get(pos);
            if (t == null) return;
            if ("<back>".equals(t)) { sportsUp(); return; }
            if (t instanceof String) { if (sportsPick == null) sportsPick = (String) t; else compPick = (String) t; renderSports(sportsData); sportsList.setSelection(0); return; }
            pickSportsChannel((JSONObject) t, aliases, false);
        });
    }
    private TextView sportsHeading;
    private void sportsUp() {
        if (compPick != null) compPick = null; else sportsPick = null;
        if (sportsData != null) renderSports(sportsData);
    }

    private JSONObject retryEvent; private List<String[]> retryAliases;

    @Override protected void onResume() {
        super.onResume();
        if (("sports".equals(screen) || "sports_channels".equals(screen)) && retryEvent != null) {
            JSONObject e = retryEvent; retryEvent = null;
            ui.postDelayed(() -> pickSportsChannel(e, retryAliases, true), 300);
        }
    }

    /** Every playlist channel the event could be on: all guide matches, best first, then a search. */
    private void pickSportsChannel(JSONObject e, List<String[]> aliases, boolean retry) {
        if (liveChannels == null) {
            Toast.makeText(this, "Loading your channels…", Toast.LENGTH_SHORT).show();
            io.execute(() -> {
                try {
                    JSONArray a = new JSONArray(cachedGet("live", "get_live_streams", ""));
                    List<Item> l = new ArrayList<>();
                    for (int i = 0; i < a.length(); i++) { JSONObject o = a.getJSONObject(i); l.add(new Item("live", o.optString("stream_id"), o.optString("name"), "ts", o.optString("category_id"))); }
                    liveChannels = l;
                    ui.post(() -> pickSportsChannel(e, aliases, retry));
                } catch (Exception ex) { ui.post(() -> Toast.makeText(this, "Couldn't load your channels – check your login in Settings", Toast.LENGTH_LONG).show()); }
            });
            return;
        }
        JSONArray ch = e.optJSONArray("channels");
        List<String> labels = new ArrayList<>();
        List<Item> targets = new ArrayList<>();
        java.util.Set<String> seen = new java.util.HashSet<>();
        if (ch != null) for (int j = 0; j < ch.length(); j++) {
            String g = ch.optString(j);
            List<Item> m = matchChannel(g, liveChannels, aliases);
            if (m.isEmpty()) { labels.add("✕ " + g + "  —  not in your list"); targets.add(null); }
            for (Item it : m) if (seen.add(it.id)) { labels.add("▶ Watch " + it.name + "   (" + g + ")"); targets.add(it); }
        }
        labels.add("🔍 Search all channels…"); targets.add(null);
        int searchRow = labels.size() - 1;
        Runnable prevBack = back; String prevScreen = screen;
        screen = "sports_channels";
        back = () -> { screen = prevScreen; back = prevBack; showSportsKeep(); };
        LinearLayout root = column();
        root.addView(text(e.optString("title"), 26, TEXT, true));
        root.addView(text(retry ? "Not showing it? Pick another channel" : "Pick a channel to watch this event", 15, MUTED, false));
        ListView lv = list();
        lv.setAdapter(adapter(labels));
        lv.setOnItemClickListener((p, v, w, id) -> {
            if (w == searchRow) { searchChannels(e, aliases, ch != null && ch.length() > 0 ? normChannel(ch.optString(0)) : ""); return; }
            Item it = targets.get(w);
            if (it == null) Toast.makeText(this, "That channel isn't in your playlist – try another or search", Toast.LENGTH_SHORT).show();
            else { retryEvent = e; retryAliases = aliases; play(it, defaultVlc()); }
        });
        root.addView(lv, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        root.addView(button("◀ Back to sports guide", v -> back.run()));
        setContentView(root);
        lv.requestFocus();
    }

    /** Reopen the sports guide at the sport/competition the customer was in. */
    private void showSportsKeep() {
        String sp = sportsPick, cp = compPick;
        showSports();
        sportsPick = sp; compPick = cp;
        if (sportsData != null) renderSports(sportsData);
    }

    private void searchChannels(JSONObject e, List<String[]> aliases, String start) {
        android.widget.EditText q = new android.widget.EditText(this);
        q.setSingleLine(true); q.setText(start); q.setSelectAllOnFocus(true);
        new AlertDialog.Builder(this).setTitle("Search channels").setView(q)
                .setPositiveButton("Search", (d, w) -> {
                    String want = normChannel(q.getText().toString());
                    List<Item> hits = new ArrayList<>();
                    if (!want.isEmpty() && liveChannels != null) for (Item it : liveChannels) {
                        if (normChannel(it.name).contains(want)) hits.add(it);
                        if (hits.size() >= 60) break;
                    }
                    if (hits.isEmpty()) { Toast.makeText(this, "No channels found", Toast.LENGTH_SHORT).show(); searchChannels(e, aliases, q.getText().toString()); return; }
                    String[] names = new String[hits.size()];
                    for (int i = 0; i < names.length; i++) names[i] = "▶ " + hits.get(i).name;
                    new AlertDialog.Builder(this).setTitle(hits.size() + " channels")
                            .setItems(names, (d2, i) -> { retryEvent = e; retryAliases = aliases; play(hits.get(i), defaultVlc()); })
                            .setNegativeButton("Back", (d2, i) -> pickSportsChannel(e, aliases, false)).show();
                })
                .setNegativeButton("Back", (d, w) -> pickSportsChannel(e, aliases, false)).show();
    }

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
