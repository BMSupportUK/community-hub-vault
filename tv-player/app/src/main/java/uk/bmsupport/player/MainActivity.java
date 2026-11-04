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
import android.widget.AbsListView;
import android.widget.BaseAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.text.InputType;
import android.text.InputFilter;
import android.widget.FrameLayout;
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
    @Override protected void attachBaseContext(android.content.Context b) { super.attachBaseContext(PhoneScale.wrap(b)); }
    private static final int BG = 0xFF0B1220, CARD = 0xFF16213A, ACCENT = 0xFFE11D48, TEXT = 0xFFF1F5F9, MUTED = 0xFF94A3B8;

    private final Handler ui = new Handler(Looper.getMainLooper());
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private SharedPreferences prefs;
    private Runnable pollTask;
    private Runnable connectionTask;
    private final ExecutorService connectionIo = Executors.newSingleThreadExecutor();
    private long excessSince, excessElapsed;
    private String checkedLogin = "";
    private boolean excessReported;
    private volatile boolean maintenance;
    // Account number must be entered on every cold open of the app. Static so a phone
    // lock screen (which can recreate the activity) does not ask again while the process lives.
    private static boolean unlocked;
    private boolean adultUnlocked;
    private String screen = "";
    private Runnable back;
    private BaseAdapter watchedAdapter;
    private BaseAdapter ratingAdapter;
    private final java.util.Map<String, JSONObject> bmRatings = new java.util.HashMap<>();
    private final java.util.Map<String, Long> bmRatingTimes = new java.util.HashMap<>();
    private final java.util.Map<String, Item> ratingQueue = new java.util.LinkedHashMap<>();
    private final ExecutorService ratingIo = Executors.newSingleThreadExecutor();
    private boolean ratingLoading;
    private TextView seriesRatingLabel;
    private Item seriesRatingItem;
    private String ratingKey(Item it) { return it.kind + ":" + it.name; }
    private String ratingText(Item it) {
        JSONObject r = bmRatings.get(ratingKey(it));
        if (r == null) return "BM ☆ —";
        int n = r.optInt("count");
        return n == 0 ? "BM ☆ Not rated" : String.format(java.util.Locale.UK, "BM ★ %.1f/5 · %d vote%s", r.optDouble("average"), n, n == 1 ? "" : "s");
    }
    private void receiveRatings(JSONObject response) {
        JSONArray rows = response.optJSONArray("ratings");
        if (rows != null) for (int i = 0; i < rows.length(); i++) {
            JSONObject r = rows.optJSONObject(i); if (r == null) continue;
            String key = r.optString("kind") + ":" + r.optString("title");
            bmRatings.put(key, r); bmRatingTimes.put(key, System.currentTimeMillis());
        }
        if (ratingAdapter != null) ratingAdapter.notifyDataSetChanged();
        if (seriesRatingLabel != null && seriesRatingItem != null) seriesRatingLabel.setText(ratingText(seriesRatingItem));
    }
    private final Runnable flushRatings = () -> {
        if (ratingLoading || ratingQueue.isEmpty() || isFinishing() || isDestroyed()) return;
        List<Item> batch = new ArrayList<>(ratingQueue.values()); ratingQueue.clear(); ratingLoading = true;
        ratingIo.execute(() -> {
            try {
                JSONArray items = new JSONArray();
                for (Item it : batch) items.put(new JSONObject().put("kind", it.kind).put("title", it.name));
                JSONObject response = new JSONObject(Net.postJson("https://bmsupport.uk/api/public/player", new JSONObject().put("action", "ratings").put("device_token", prefs.getString("token", "")).put("items", items).toString()));
                ui.post(() -> receiveRatings(response));
            } catch (Exception ignored) {} finally { ui.post(() -> { ratingLoading = false; if (!ratingQueue.isEmpty()) ui.postDelayed(this::flushRatingQueue, 200); }); }
        });
    };
    private void flushRatingQueue() { flushRatings.run(); }
    private void requestRating(Item it) {
        if (!("film".equals(it.kind) || "series".equals(it.kind))) return;
        Long at = bmRatingTimes.get(ratingKey(it));
        if (at != null && System.currentTimeMillis() - at < 60000) return;
        bmRatingTimes.put(ratingKey(it), System.currentTimeMillis());
        ratingQueue.put(ratingKey(it), it); ui.removeCallbacks(flushRatings); ui.postDelayed(flushRatings, 200);
        if (ratingQueue.size() >= 200) flushRatings.run();
    }
    private void showVote(Item it) {
        if (!unlocked || !("film".equals(it.kind) || "series".equals(it.kind))) return;
        JSONObject mine = bmRatings.get(ratingKey(it));
        if (mine != null && mine.optInt("mine") > 0) {
            new AlertDialog.Builder(this).setTitle("Already voted").setMessage("You gave " + it.name + " " + mine.optInt("mine") + "/5. Votes can't be changed.")
                    .setPositiveButton("OK", null).show();
            return;
        }
        String[] stars = {"★ · 1/5", "★★ · 2/5", "★★★ · 3/5", "★★★★ · 4/5", "★★★★★ · 5/5"};
        resultList("Rate " + it.name + (mine != null && mine.optInt("mine") > 0 ? " · Your vote " + mine.optInt("mine") + "/5" : ""), stars.length, index -> text(stars[index], 18, TEXT, false), index -> {
            Toast.makeText(this, "Saving your vote…", Toast.LENGTH_SHORT).show();
            ratingIo.execute(() -> {
                try {
                    JSONObject response = new JSONObject(Net.postJson("https://bmsupport.uk/api/public/player", new JSONObject().put("action", "vote").put("device_token", prefs.getString("token", "")).put("kind", it.kind).put("title", it.name).put("stars", index + 1).toString()));
                    ui.post(() -> { receiveRatings(response); Toast.makeText(this, "Your " + (index + 1) + "-star vote is saved.", Toast.LENGTH_SHORT).show(); });
                } catch (Exception ex) {
                    String m = String.valueOf(ex.getMessage());
                    final boolean already = m.contains("already voted");
                    ui.post(() -> { Toast.makeText(this, already ? "You've already voted on this. Votes can't be changed." : "Couldn't save your vote. Try again.", Toast.LENGTH_LONG).show(); if (already) { bmRatingTimes.remove(ratingKey(it)); requestRating(it); } });
                }
            });
        }, null, null, "Cancel", null);
    }


    /** A playable or browsable entry. */
    static final class Item {
        String kind, id, name, ext, category;
        String norm, poster = "", seriesId = "", url = ""; long added; double rating; int pos; int archiveDays; String catchupId = ""; long catchupStart, catchupEnd;
        String norm() { if (norm == null) norm = normChannel(name == null ? "" : name); return norm; }
        Item(String kind, String id, String name, String ext, String category) {
            this.kind = kind; this.id = id; this.name = name; this.ext = ext; this.category = category;
        }
        @Override public String toString() { return name; }
        JSONObject toJson() {
            JSONObject o = new JSONObject();
            try { o.put("kind", kind).put("id", id).put("name", name).put("ext", ext).put("category", category).put("poster", poster).put("seriesId", seriesId); } catch (Exception ignored) {}
            return o;
        }
        static Item fromJson(JSONObject o) {
            Item it = new Item(o.optString("kind"), o.optString("id"), o.optString("name"), o.optString("ext"), o.optString("category"));
            it.poster = o.optString("poster"); it.seriesId = o.optString("seriesId"); return it;
        }
    }

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        prefs = getSharedPreferences("bmplayer", MODE_PRIVATE);
        if (Build.VERSION.SDK_INT >= 33) getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::goBack);
        start();
        checkForUpdate(false);
        sendLastCrash();
        startReminderCheck();
        handleReminderIntent(getIntent());
    }

    // ---------- multi-screen (Multi Room = 2, Triple Room = 3) ----------
    private final List<androidx.media3.exoplayer.ExoPlayer> multiPlayers = new ArrayList<>();
    private void stopMulti() { for (androidx.media3.exoplayer.ExoPlayer p : multiPlayers) p.release(); multiPlayers.clear(); }

    /** Asks how many screens to open, so one channel can fill the whole screen. */
    private void chooseMultiScreens(int max) {
        List<String> opts = new ArrayList<>();
        opts.add("1 screen – full size");
        if (max >= 2) opts.add("2 screens – side by side");
        if (max >= 3) opts.add("3 screens – one big, two small");
        String[] names = opts.toArray(new String[0]);
        new AlertDialog.Builder(this).setTitle("Multi-screen – how many?")
                .setItems(names, (d, w) -> showMultiScreen(w + 1)).setNegativeButton("Cancel", null).show();
    }

    private void showMultiScreen(int screens) {
        stopPreview(); stopMulti();
        screen = "multi";
        back = () -> { stopMulti(); showHome(); };
        FrameLayout[] panes = new FrameLayout[screens];
        TextView[] labels = new TextView[screens];
        LinearLayout root = row();
        root.setBackgroundColor(Color.BLACK);
        for (int i = 0; i < screens; i++) {
            final int n = i;
            FrameLayout f = new FrameLayout(this);
            f.setFocusable(true);
            f.setBackground(focusBg(4));
            f.setPadding(dp(3), dp(3), dp(3), dp(3));
            androidx.media3.ui.PlayerView pv = new androidx.media3.ui.PlayerView(this);
            pv.setUseController(false); pv.setFocusable(false);
            pv.setShutterBackgroundColor(Color.BLACK);
            androidx.media3.exoplayer.ExoPlayer pl = PlayerActivity.build(this);
            pl.setVolume(i == 0 ? 1f : 0f);
            pv.setPlayer(pl);
            multiPlayers.add(pl);
            f.addView(pv, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            TextView t = text("Screen " + (i + 1) + "\nPress OK to pick a channel", 16, TEXT, true);
            t.setGravity(Gravity.CENTER);
            t.setShadowLayer(4, 0, 0, Color.BLACK);
            f.addView(t, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            labels[i] = t; panes[i] = f;
            f.setOnFocusChangeListener((v, has) -> {
                if (!has) return;
                for (int k = 0; k < multiPlayers.size(); k++) multiPlayers.get(k).setVolume(k == n ? 1f : 0f);
            });
            f.setOnClickListener(v -> pickMultiChannel(n, labels[n]));
        }
        if (screens == 1) {
            root.addView(panes[0], weight(1, ViewGroup.LayoutParams.MATCH_PARENT));
        } else if (screens == 2) {
            root.addView(panes[0], weight(1, ViewGroup.LayoutParams.MATCH_PARENT));
            root.addView(panes[1], weight(1, ViewGroup.LayoutParams.MATCH_PARENT));
        } else {
            root.addView(panes[0], weight(2, ViewGroup.LayoutParams.MATCH_PARENT));
            LinearLayout right = column(); right.setPadding(0, 0, 0, 0);
            right.addView(panes[1], new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
            right.addView(panes[2], new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
            root.addView(right, weight(1, ViewGroup.LayoutParams.MATCH_PARENT));
        }
        setContentView(root);
        panes[0].requestFocus();
        Toast.makeText(this, "Sound plays from the highlighted screen. Press OK on a screen to change its channel.", Toast.LENGTH_LONG).show();
    }

    private void pickMultiChannel(int n, TextView label) {
        if (liveChannels == null) {
            Toast.makeText(this, "Loading your channels…", Toast.LENGTH_SHORT).show();
            io.execute(() -> {
                try {
                    JSONArray a = new JSONArray(cachedGet("live", "get_live_streams", ""));
                    List<Item> l = new ArrayList<>();
                    for (int i = 0; i < a.length(); i++) { JSONObject o = a.getJSONObject(i); l.add(liveItem(o)); }
                    liveChannels = l;
                    ui.post(() -> pickMultiChannel(n, label));
                } catch (Exception ex) { ui.post(() -> Toast.makeText(this, "Couldn't load your channels", Toast.LENGTH_LONG).show()); }
            });
            return;
        }
        android.widget.EditText q = new android.widget.EditText(this);
        q.setSingleLine(true); q.setHint("Type part of a channel name");
        AlertDialog dlg = new AlertDialog.Builder(this).setTitle("Screen " + (n + 1) + " – find a channel").setView(q)
                .setPositiveButton("Search", (d, w) -> {
                    String want = normChannel(q.getText().toString());
                    List<Item> hits = new ArrayList<>();
                    for (Item it : liveChannels) {
                        if (hideAdult(it.category)) continue;
                        if (want.isEmpty() || it.norm().contains(want)) hits.add(it);
                        if (hits.size() >= 80) break;
                    }
                    if (hits.isEmpty()) { Toast.makeText(this, "No channels found", Toast.LENGTH_SHORT).show(); return; }
                    String[] names = new String[hits.size()];
                    for (int i = 0; i < names.length; i++) names[i] = hits.get(i).name;
                    new AlertDialog.Builder(this).setTitle("Pick a channel").setItems(names, (d2, w2) -> {
                        Item it = hits.get(w2);
                        if (n >= multiPlayers.size()) return;
                        label.setText("");
                        PlayerActivity.playWithFallback(multiPlayers.get(n), streamUrls(it),
                                () -> ui.post(() -> label.setText(it.name + "\nCouldn't play – press OK to pick another")));
                    }).show();
                }).setNegativeButton("Cancel", null).create();
        keepEntryVisible(dlg, q);
        dlg.show();

    }

    // ---------- programme reminders ----------
    private Item epgItem; private List<Object[]> epgProgs = new ArrayList<>();
    private Runnable reminderTask; private boolean reminderShowing;

    /** Upcoming programmes on the highlighted channel; picking one sets a reminder 5 minutes before it starts. */
    private void pickReminder() {
        Item ch = epgItem;
        long nowSec = System.currentTimeMillis() / 1000;
        List<Object[]> up = new ArrayList<>();
        if (ch != null) for (Object[] p : epgProgs) if ((long) p[1] > nowSec) up.add(p);
        if (ch == null || up.isEmpty()) { Toast.makeText(this, "Highlight a channel with upcoming programmes in its TV guide first", Toast.LENGTH_LONG).show(); return; }
        String[] labels = new String[up.size()];
        for (int i = 0; i < up.size(); i++) labels[i] = clock((long) up.get(i)[1]) + "   " + up.get(i)[0] + (hasReminder(ch.id, (long) up.get(i)[1]) ? "   ⏰ set" : "");
        new AlertDialog.Builder(this).setTitle("Remind me – " + ch.name).setItems(labels, (d, w) -> {
            long st = (long) up.get(w)[1];
            String title = (String) up.get(w)[0];
            if (hasReminder(ch.id, st)) confirmRemoveReminder(ch, title, st, null);
            else confirmAddReminder(ch, title, st, null);
        }).setNegativeButton("Close", null).show();
    }

    /** Ask before booking a reminder so a stray OK never silently sets one. */
    private void confirmAddReminder(final Item ch, final String title, final long st, final Runnable after) {
        if (st <= System.currentTimeMillis() / 1000) { Toast.makeText(this, "That programme has already started – reminders are only for programmes that haven't begun", Toast.LENGTH_LONG).show(); if (after != null) after.run(); return; }
        new AlertDialog.Builder(this).setTitle("Set a reminder?")
                .setMessage("We'll remind you 5 minutes before " + title + " on " + ch.name + " at " + clock(st) + ".")
                .setPositiveButton("Set reminder", (d, w) -> {
                    addReminder(ch, title, st);
                    Toast.makeText(this, "Reminder set – we'll tell you 5 minutes before " + title + " starts", Toast.LENGTH_LONG).show();
                    if (after != null) after.run();
                })
                .setNegativeButton("Cancel", (d, w) -> { if (after != null) after.run(); })
                .setOnCancelListener(d -> { if (after != null) after.run(); })
                .show();
    }

    /** Ask before cancelling a reminder so it can't be dropped by accident. */
    private void confirmRemoveReminder(final Item ch, final String title, final long st, final Runnable after) {
        new AlertDialog.Builder(this).setTitle("Remove reminder?")
                .setMessage("Stop the reminder for " + title + " on " + ch.name + " at " + clock(st) + "?")
                .setPositiveButton("Remove reminder", (d, w) -> {
                    removeReminder(ch.id, st);
                    Toast.makeText(this, "Reminder removed", Toast.LENGTH_SHORT).show();
                    if (after != null) after.run();
                })
                .setNegativeButton("Keep reminder", (d, w) -> { if (after != null) after.run(); })
                .setOnCancelListener(d -> { if (after != null) after.run(); })
                .show();
    }


    private JSONArray reminders() { try { return new JSONArray(prefs.getString("reminders", "[]")); } catch (Exception e) { return new JSONArray(); } }
    private boolean hasReminder(String id, long st) {
        JSONArray a = reminders();
        for (int i = 0; i < a.length(); i++) { JSONObject o = a.optJSONObject(i); if (o != null && id.equals(o.optString("id")) && o.optLong("start") == st) return true; }
        return false;
    }
    private void removeReminder(String id, long st) {
        JSONArray a = reminders(), out = new JSONArray();
        for (int i = 0; i < a.length(); i++) { JSONObject o = a.optJSONObject(i); if (o != null && !(id.equals(o.optString("id")) && o.optLong("start") == st)) out.put(o); }
        prefs.edit().putString("reminders", out.toString()).apply();
        ReminderReceiver.cancel(this, id, st);
    }
    private void addReminder(Item ch, String title, long st) {
        if (st <= System.currentTimeMillis() / 1000) { Toast.makeText(this, "That programme has already started – reminders are only for programmes that haven't begun", Toast.LENGTH_LONG).show(); return; }
        JSONArray a = reminders();
        try { a.put(new JSONObject().put("id", ch.id).put("name", ch.name).put("category", ch.category).put("title", title).put("start", st)); } catch (Exception ignored) {}
        prefs.edit().putString("reminders", a.toString()).apply();
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission("android.permission.POST_NOTIFICATIONS") != android.content.pm.PackageManager.PERMISSION_GRANTED)
            requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, 7);
        ReminderReceiver.schedule(this, ch.id, ch.name, title, st);
    }

    /** While the app is open, a due reminder pops up in the app with a button to jump to the channel. */
    private void startReminderCheck() {
        reminderTask = new Runnable() { @Override public void run() { checkReminders(); ui.postDelayed(this, 20000); } };
        ui.postDelayed(reminderTask, 3000);
    }
    private void checkReminders() {
        if (reminderShowing || isFinishing()) return;
        long nowSec = System.currentTimeMillis() / 1000;
        JSONArray a = reminders(), keep = new JSONArray();
        JSONObject due = null;
        for (int i = 0; i < a.length(); i++) {
            JSONObject o = a.optJSONObject(i); if (o == null) continue;
            long st = o.optLong("start");
            if (st + 60 < nowSec) continue; // already started – reminders are only for programmes yet to begin
            if (due == null && st - 300 <= nowSec) { due = o; continue; }
            keep.put(o);
        }
        if (a.length() != keep.length()) prefs.edit().putString("reminders", keep.toString()).apply();
        if (due != null) showReminder(due.optString("id"), due.optString("name"), due.optString("category"), due.optString("title"), due.optLong("start"));
    }
    private void showReminder(String id, String name, String category, String title, long st) {
        reminderShowing = true;
        ReminderReceiver.cancel(this, id, st);
        long mins = Math.max(0, (st - System.currentTimeMillis() / 1000 + 59) / 60);
        AlertDialog dlg = new AlertDialog.Builder(this).setTitle("⏰ " + title)
                .setMessage((mins > 0 ? "Starts in " + mins + (mins == 1 ? " minute" : " minutes") : "Starting now") + " at " + clock(st) + " on " + name + ".")
                .setPositiveButton("▶ Go to " + name, (d, w) -> play(new Item("live", id, name, "ts", category), defaultVlc()))
                .setNegativeButton("Dismiss", null)
                .setOnDismissListener(d -> reminderShowing = false).create();
        dlg.setOnShowListener(x -> { android.widget.Button go = dlg.getButton(AlertDialog.BUTTON_POSITIVE); go.setFocusable(true); go.requestFocus(); });
        dlg.show();
    }
    private void handleReminderIntent(Intent i) {
        if (i == null || !i.hasExtra("reminder_id")) return;
        String id = i.getStringExtra("reminder_id"), name = i.getStringExtra("reminder_name");
        i.removeExtra("reminder_id");
        removeReminder(id, i.getLongExtra("reminder_start", 0));
        ui.postDelayed(() -> play(new Item("live", id, name, "ts", ""), defaultVlc()), 800);
    }
    @Override protected void onNewIntent(Intent i) { super.onNewIntent(i); setIntent(i); handleReminderIntent(i); refreshVersionScreens(); }

    @Override public void onUserInteraction() { super.onUserInteraction(); PlayerApplication.interaction(this); }
    @Override public boolean dispatchKeyEvent(KeyEvent e) { return PlayerApplication.closeAnnouncementOnBack(this, e) || super.dispatchKeyEvent(e); }
    @Override protected void onDestroy() { stopPreview(); stopMulti(); stopPolling(); ui.removeCallbacksAndMessages(null); super.onDestroy(); io.shutdownNow(); connectionIo.shutdownNow(); }

    @Override public boolean onKeyDown(int keyCode, KeyEvent e) {
        if (keyCode == KeyEvent.KEYCODE_BACK) { goBack(); return true; }
        return super.onKeyDown(keyCode, e);
    }
    @SuppressWarnings("deprecation")
    @Override public void onBackPressed() { goBack(); }

    /** Back steps up one screen; only the front screen asks before closing the app. */
    private void goBack() {
        if (panelOpen()) { hidePanel(); return; }
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

    /** Never crash when a delayed task fires after the screen closed and its queue shut down. */
    private boolean safeRun(ExecutorService ex, Runnable r) {
        if (ex.isShutdown() || isDestroyed()) return false;
        try { ex.execute(r); return true; } catch (java.util.concurrent.RejectedExecutionException e) { return false; }
    }

    private boolean hasLogin() {
        return !prefs.getString("user", "").isEmpty() && !prefs.getString("dns", "").isEmpty();
    }

    private void startPolling() {
        stopPolling();
        pollTask = new Runnable() {
            @Override public void run() {
                if (!safeRun(io, MainActivity.this::pollOnce)) return;
                ui.postDelayed(this, maintenance ? 15000 : hasLogin() ? 60000 : 5000);
            }
        };
        ui.post(pollTask);
        connectionTask = new Runnable() {
            @Override public void run() {
                safeRun(connectionIo, () -> {
                    checkConnectionLimit();
                    if (!isFinishing() && !isDestroyed()) ui.postDelayed(this, 30_000);
                });
            }
        };
        ui.post(connectionTask);
    }

    /** Poll also reports what is on screen so admins see live connections. */
    private JSONObject pollBody() throws Exception {
        JSONObject b = new JSONObject().put("action", "poll").put("device_token", prefs.getString("token", ""))
                .put("login", prefs.getString("user", "")).put("version", appVersion());
        long since = prefs.getLong("np_since", 0);
        if (since > 0) b.put("watching", new JSONObject().put("kind", prefs.getString("np_kind", "live"))
                .put("title", prefs.getString("np_title", "")).put("category", prefs.getString("np_cat", ""))
                .put("player", prefs.getString("np_player", "BM Player")).put("since", since));
        return b;
    }

    private void setNowPlaying(Item it, boolean vlc) {
        long since = System.currentTimeMillis();
        prefs.edit().putString("np_kind", it.kind).putString("np_title", it.name == null ? "" : it.name)
                .putString("np_cat", "").putString("np_player", vlc ? "VLC" : "BM Player").putLong("np_since", since).apply();
        io.execute(() -> {
            String cat = ""; try { cat = categoryName(it); } catch (Exception ignored) {}
            if (prefs.getLong("np_since", 0) == since) prefs.edit().putString("np_cat", cat == null ? "" : cat).apply();
            pollOnce();
        });
    }

    private void clearNowPlaying() {
        if (prefs.getLong("np_since", 0) == 0) return;
        prefs.edit().putLong("np_since", 0).apply();
        io.execute(this::pollOnce);
    }

    private void stopPolling() {
        if (pollTask != null) ui.removeCallbacks(pollTask); pollTask = null;
        if (connectionTask != null) ui.removeCallbacks(connectionTask); connectionTask = null;
    }

    /** Ask the provider for actual account connections, including other apps/devices. */
    private void checkConnectionLimit() {
        try {
            String login = prefs.getString("dns", "") + "|" + prefs.getString("user", "");
            if (!login.equals(checkedLogin)) { checkedLogin = login; excessSince = 0; excessReported = false; }
            if (!hasLogin() || maintenance) { excessSince = 0; excessReported = false; return; }
            JSONObject info = new JSONObject(Net.get(api(""))).optJSONObject("user_info");
            if (info == null || !info.has("active_cons") || !info.has("max_connections")) { excessSince = 0; excessReported = false; return; }
            int active = Integer.parseInt(info.getString("active_cons"));
            int max = Integer.parseInt(info.getString("max_connections"));
            if (!ConnectionLimit.over(active, max)) { excessSince = 0; excessReported = false; return; }
            long now = System.currentTimeMillis(), elapsed = android.os.SystemClock.elapsedRealtime();
            if (excessSince == 0) { excessSince = now; excessElapsed = elapsed; }
            if (excessReported || !ConnectionLimit.sustained(excessElapsed, elapsed)) return;
            JSONObject report = new JSONObject().put("action", "connection_alert")
                    .put("device_token", prefs.getString("token", "")).put("active", active).put("max", max)
                    .put("exceeded_since", excessSince).put("login", prefs.getString("user", "")).put("version", appVersion());
            JSONObject result = new JSONObject(Net.postJson(Net.SITE + "/api/public/player", report.toString()));
            if (!result.optBoolean("reported")) return;
            excessReported = true;
            ui.post(() -> startActivity(new Intent(this, ConnectionWarningActivity.class).putExtra("active", active).putExtra("max", max)));
        } catch (Exception ignored) {
            // Unknown connection counts never prove continuous excess; reset rather than falsely report.
            excessSince = 0; excessReported = false;
        }
    }

    private void pollOnce() {
        try {
            JSONObject r = new JSONObject(Net.postJson(Net.SITE + "/api/public/player",
                    pollBody().toString()));
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
        unlocked = false;
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
        setContentView(scrollable(root));
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

    private void showUnlock() {
        stopPreview(); stopMulti();
        screen = "unlock"; back = null;
        LinearLayout root = column();
        // Held near the top so the on-screen keypad can never sit on top of the number you're typing.
        root.setGravity(Gravity.TOP);
        root.setPadding(dp(32), dp(16), dp(32), dp(16));
        root.addView(logo());
        root.addView(text("Enter your account number", 30, TEXT, true));

        root.addView(text("Your 6-digit account number is in the subscription box on bmsupport.uk.", 18, MUTED, false));
        EditText in = new EditText(this);
        in.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_VARIATION_PASSWORD);
        in.setFilters(new InputFilter[]{ new InputFilter.LengthFilter(6) });
        // Landscape phones otherwise swap the whole screen for the keyboard's own full-screen text box.
        in.setImeOptions(android.view.inputmethod.EditorInfo.IME_ACTION_DONE | android.view.inputmethod.EditorInfo.IME_FLAG_NO_EXTRACT_UI | android.view.inputmethod.EditorInfo.IME_FLAG_NO_FULLSCREEN);
        in.setTextSize(36); in.setTextColor(ACCENT); in.setGravity(Gravity.CENTER);
        in.setLetterSpacing(0.3f); in.setHint("••••••"); in.setHintTextColor(MUTED);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(dp(320), ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.gravity = Gravity.CENTER_HORIZONTAL; in.setLayoutParams(lp);
        root.addView(in);
        TextView status = text("", 16, MUTED, false);
        Button go = button("Unlock", v -> {
            String n = in.getText().toString().trim();
            if (!n.matches("\\d{6}")) { status.setText("Enter all 6 digits."); return; }
            status.setText("Checking…");
            io.execute(() -> {
                try {
                    Net.postJson(Net.SITE + "/api/public/player", new JSONObject().put("action", "unlock")
                            .put("device_token", prefs.getString("token", "")).put("account_number", n).toString());
                    ui.post(() -> { unlocked = true; hideKeyboard(in); getWindow().setSoftInputMode(android.view.WindowManager.LayoutParams.SOFT_INPUT_ADJUST_PAN | android.view.WindowManager.LayoutParams.SOFT_INPUT_STATE_HIDDEN); showHome(); syncFavourites(null); });
                } catch (Exception ex) {
                    String m = String.valueOf(ex.getMessage()), msg = "Couldn't check. Check the internet and try again.";
                    int i = m.indexOf('{');
                    if (i >= 0) try { msg = new JSONObject(m.substring(i)).optString("error", msg); } catch (Exception ignored) {}
                    final String shown = msg;
                    ui.post(() -> { status.setText(shown); in.setText(""); });
                }
            });
        });
        in.setOnEditorActionListener((v, a, e) -> { go.performClick(); return true; });
        root.addView(go);
        root.addView(status);
        getWindow().setSoftInputMode(android.view.WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE | android.view.WindowManager.LayoutParams.SOFT_INPUT_STATE_VISIBLE);
        android.widget.ScrollView sc = scrollable(root);
        setContentView(sc);
        fitScreenAboveKeypad(sc, in);
        in.requestFocus();
    }

    private void showHome() {
        stopPreview(); stopMulti(); // never keep a channel playing behind the main menu
        if (!unlocked) { showUnlock(); return; }
        screen = "home"; back = null; drawnVersion = appVersion();
        LinearLayout root = column();
        LinearLayout top = row();
        top.setGravity(Gravity.CENTER_VERTICAL);
        top.addView(logo());
        top.addView(text("  BM Player", 28, TEXT, true));
        top.addView(text("   v" + appVersion(), 16, MUTED, false));
        top.addView(new View(this), new LinearLayout.LayoutParams(0, 1, 1));
        top.addView(headerPill("🔍 Search TV", v -> showSearch("live", "")));
        top.addView(headerPill("🔍 Search Movies", v -> showSearch("film", "")));
        top.addView(headerPill("🔍 Search Series", v -> showSearch("series", "")));
        root.addView(top);
        TextView account = text("Signed in as " + prefs.getString("user", ""), 15, MUTED, false);
        root.addView(account);

        LinearLayout tiles = row();
        tiles.setPadding(0, dp(20), 0, dp(12));
        tiles.addView(tileWithRefresh("Live TV", "📺", "live"), weight(1, ViewGroup.LayoutParams.WRAP_CONTENT));
        tiles.addView(tileWithRefresh("Films", "🎬", "film"), weight(1, ViewGroup.LayoutParams.WRAP_CONTENT));
        tiles.addView(tileWithRefresh("Series", "🎞", "series"), weight(1, ViewGroup.LayoutParams.WRAP_CONTENT));
        root.addView(tiles);

        LinearLayout small = row();
        small.addView(smallButton("📅 TV guide", v -> showTvGuide()), smallWeight("📅 TV guide"));
        small.addView(smallButton("🏆 Sports guide", v -> askSportsMode()), smallWeight("🏆 Sports guide"));
        small.addView(smallButton("★ Favourites", v -> showSaved("fav", "Favourites")), smallWeight("★ Favourites"));
        small.addView(smallButton("⟲ Recently watched", v -> showSaved("recent", "Recently watched")), smallWeight("⟲ Recently watched"));
        small.addView(smallButton("⚙ Settings", v -> showSettings()), smallWeight("⚙ Settings"));
        root.addView(small);
        setContentView(withHomeBackground(root));
        tiles.getChildAt(0).requestFocus();
        autoUpdatePlaylists();

        io.execute(() -> {
            try {
                JSONObject info = new JSONObject(Net.get(api(""))).optJSONObject("user_info");
                if (info == null) return;
                String exp = info.optString("exp_date", "");
                String status = info.optString("status", "");
                boolean hasExp = !exp.isEmpty() && !"null".equals(exp);
                long expMs = 0;
                try { if (hasExp) expMs = Long.parseLong(exp) * 1000; } catch (Exception ignored) { hasExp = false; }
                if ("expired".equalsIgnoreCase(status) || (hasExp && expMs < System.currentTimeMillis())) {
                    ui.post(this::showExpired); return;
                }
                String line = "Signed in as " + prefs.getString("user", "") + (status.isEmpty() ? "" : " · " + status);
                java.text.SimpleDateFormat f = new java.text.SimpleDateFormat("d MMM yyyy", java.util.Locale.UK);
                line += hasExp ? " (expires " + f.format(new java.util.Date(expMs)) + ")" : " (no expiry)";
                String l = line;
                int cons = info.optInt("max_connections", 1);
                prefs.edit().putInt("max_cons", cons).apply();
                ui.post(() -> {
                    account.setText(l);
                    if (cons >= 2 && small.findViewWithTag("multi") == null) {
                        String ml = "🖥 Multi-screen (" + Math.min(cons, 3) + ")";
                        Button mb = smallButton(ml, v -> chooseMultiScreens(Math.min(cons, 3)));
                        mb.setTag("multi");
                        small.addView(mb, 1, smallWeight(ml));
                    }
                });
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
        if (it.url != null && !it.url.isEmpty()) return new String[]{it.url};
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
    private Item previewItem;
    private long previewLastTap;

    /** Two presses on the preview (remote OK, or a tap on a phone) open that channel full screen. */
    private void previewDoubleTap() {
        long now = android.os.SystemClock.uptimeMillis();
        if (now - previewLastTap > 600) {
            previewLastTap = now;
            Toast.makeText(this, "Press OK again for full screen", Toast.LENGTH_SHORT).show();
            return;
        }
        previewLastTap = 0;
        Item cur = previewItem;
        if (cur == null) { Toast.makeText(this, "Highlight a channel first", Toast.LENGTH_SHORT).show(); return; }
        stopPreview();
        play(cur, defaultVlc());
    }


    private void schedulePreview(Item it, androidx.media3.ui.PlayerView view, TextView status) {
        stopPreview();
        previewItem = it;
        status.setText("Loading preview…");
        previewTask = () -> {
            preview = PlayerActivity.build(this);
            view.setPlayer(preview);
            preview.addListener(new androidx.media3.common.Player.Listener() {
                @Override public void onPlaybackStateChanged(int s) {
                    if (s == androidx.media3.common.Player.STATE_READY) status.setText("Press OK twice for full screen");
                }
            });
            PlayerActivity.playWithFallback(preview, streamUrls(it),
                    () -> status.setText("Preview unavailable – try Play with VLC"));
        };
        ui.postDelayed(previewTask, 700);
    }

    @Override protected void onPause() { super.onPause(); stopPreview(); if ("multi".equals(screen)) { stopMulti(); showHome(); } }

    private String liveCatId = "*";

    private void browse(String kind) {
        screen = "browse"; back = this::showHome;
        String title = kind.equals("live") ? "Live TV" : kind.equals("film") ? "Films" : "Series";
        String catAction = kind.equals("live") ? "get_live_categories" : kind.equals("film") ? "get_vod_categories" : "get_series_categories";
        String listAction = kind.equals("live") ? "get_live_streams" : kind.equals("film") ? "get_vod_streams" : "get_series";

        final String[] liveFilter = { "" };
        final String[] catLabel = { "" };
        final List<Item> currentList = new ArrayList<>();
        final Runnable[] applyFilter = new Runnable[1];
        LinearLayout root = column();

        LinearLayout head = row(); head.setGravity(Gravity.CENTER_VERTICAL);
        head.addView(text(title, 26, TEXT, true));
        head.addView(new View(this), new LinearLayout.LayoutParams(0, 1, 1));
        if (kind.equals("live")) head.addView(headerPill("📅 EPG", v -> showTvGuide(liveCatId)));
        head.addView(headerPill("🔍 Search " + (kind.equals("live") ? "TV" : kind.equals("film") ? "Movies" : "Series"), v -> showSearch(kind, "")));
        head.addView(headerPill("🎤 Voice search", v -> startVoice(kind)));

        root.addView(head);
        TextView epg = text(kind.equals("live") ? "Pick a category" : "", 15, MUTED, false);
        root.addView(epg);
        stopPreview();
        LinearLayout panes = row();
        ListView cats = list();
        final boolean posters = !kind.equals("live");
        final AbsListView items = posters ? posterGrid() : list();
        final List<Item> shown = new ArrayList<>();
        final String[] sortKey = { prefs.getString("sort_" + kind, "added") };
        final Runnable[] applySort = new Runnable[1];
        if (posters) {
            LinearLayout sortRow = row();
            sortRow.addView(text("Sort:  ", 16, MUTED, false));
            String[][] opts = {{"default", "Default"}, {"added", "Recently added"}, {"az", "A–Z"}, {"za", "Z–A"}, {"rating", "Top rated"}};
            List<Button> btns = new ArrayList<>();
            for (String[] o : opts) {
                Button b = button(o[1], v -> {
                    sortKey[0] = o[0]; prefs.edit().putString("sort_" + kind, o[0]).apply();
                    for (Button x : btns) x.setAlpha(x.getTag().equals(sortKey[0]) ? 1f : 0.55f);
                    if (applySort[0] != null) applySort[0].run();
                });
                b.setTag(o[0]); b.setAlpha(o[0].equals(sortKey[0]) ? 1f : 0.55f);
                btns.add(b); sortRow.addView(b);
            }
            android.widget.HorizontalScrollView hs = new android.widget.HorizontalScrollView(this);
            hs.addView(sortRow); root.addView(hs);
        }
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
            pv.setFocusable(true);
            pv.setFocusableInTouchMode(true);
            pv.setOnFocusChangeListener((v, has) -> {
                if (has) {
                    GradientDrawable ring = new GradientDrawable();
                    ring.setColor(Color.TRANSPARENT);
                    ring.setCornerRadius(dp(10));
                    ring.setStroke(dp(3), ACCENT);
                    v.setForeground(ring);
                } else v.setForeground(null);
            });

            pv.setResizeMode(androidx.media3.ui.AspectRatioFrameLayout.RESIZE_MODE_FILL);
            pv.setShutterBackgroundColor(Color.BLACK);
            final androidx.media3.ui.PlayerView box = pv;
            side.addView(pv, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(200)));
            pv.addOnLayoutChangeListener((v, l, t, r, b2, ol, ot, or, ob) -> {
                int h = (r - l) * 9 / 16;
                if (side.getHeight() > 0) h = Math.min(h, side.getHeight() * 2 / 5);
                if (h > 0 && Math.abs(v.getHeight() - h) > 2) { ViewGroup.LayoutParams lp = v.getLayoutParams(); lp.height = h; v.post(() -> v.setLayoutParams(lp)); }
            });
            pvStatus = text("Highlight a channel to preview it · press OK twice for full screen", 14, MUTED, false);
            side.addView(pvStatus);
            pv.setClickable(true);
            pv.setContentDescription("Channel preview · press OK twice to open full screen");
            pv.setOnClickListener(v -> previewDoubleTap());

            pvEpg = text("", 14, TEXT, false);
            pvEpg.setPadding(dp(12), dp(10), dp(12), dp(10));
            pvEpg.setSingleLine(false);
            pvEpg.setHorizontallyScrolling(false);
            android.widget.ScrollView guideScroll = new android.widget.ScrollView(this);
            guideScroll.setBackground(focusBg(10));
            guideScroll.setFillViewport(true);
            guideScroll.setFocusable(true);
            guideScroll.setContentDescription("Now and Up next programmes");
            guideScroll.setVerticalScrollBarEnabled(true);
            guideScroll.addView(pvEpg, new android.widget.ScrollView.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
            side.addView(guideScroll, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
            panes.addView(side, weight(1.7f, ViewGroup.LayoutParams.MATCH_PARENT));
        }
        final androidx.media3.ui.PlayerView previewView = pv;
        final TextView previewStatus = pvStatus, previewEpg = pvEpg;
        root.addView(panes, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        setContentView(root);

        // Whole section is loaded once (from the saved list) and split by category locally,
        // so "All" shows straight away and every category opens instantly.
        List<String[]> catRows = new ArrayList<>();
        final java.util.Map<String, List<Item>> byCat = new java.util.HashMap<>();
        final List<Item> all = new ArrayList<>();
        final String[] current = { null };
        final boolean[] freshTop = { false };
        final int[] livePos = { -1 };
        final boolean[] restoring = { false };
        // Live TV's inline search box filters the channel list as the customer types.
        applyFilter[0] = () -> {
            String q = liveFilter[0].trim().toLowerCase();
            List<Item> out = new ArrayList<>();
            for (Item it : currentList) if (q.isEmpty() || it.name.toLowerCase().contains(q)) out.add(it);
            items.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_list_item_1, out) {
                @Override public View getView(int i, View cv, ViewGroup parent) { return styleRow(super.getView(i, cv, parent)); }
            });
            freshTop[0] = true;
            livePos[0] = -1;
            items.setSelection(0);
            items.post(() -> items.setSelection(0));
            epg.setText(catLabel[0] + " · " + out.size() + (q.isEmpty() ? " channels" : " of " + currentList.size() + " channels"));
        };

        java.util.function.BiConsumer<Integer, Boolean> showCat = (pos, focusItems) -> {
            if (pos < 0 || pos >= catRows.size()) return;
            String[] c = catRows.get(pos);
            if (c[0].equals(current[0])) { if (focusItems) items.requestFocus(); return; }
            current[0] = c[0];
            if (kind.equals("live")) liveCatId = c[0];
            List<Item> got = c[0].equals("*") ? all : byCat.get(c[0]);
            java.util.function.Consumer<List<Item>> render = list -> {
                if (!c[0].equals(current[0])) return;
                if (posters) {
                    shown.clear(); shown.addAll(list);
                    applySort[0] = () -> { sortItems(shown, sortKey[0]); ((BaseAdapter) items.getAdapter()).notifyDataSetChanged(); items.setSelection(0); };
                    sortItems(shown, sortKey[0]);
                    items.setAdapter(posterAdapter(shown));
                    watchedAdapter = (BaseAdapter) items.getAdapter();
                } else {
                    catLabel[0] = c[1];
                    currentList.clear(); currentList.addAll(list);
                    if (applyFilter[0] != null) applyFilter[0].run();
                }
                freshTop[0] = true;
                livePos[0] = -1;
                items.clearFocus();
                items.setSelection(0);
                items.post(() -> {
                    if (!c[0].equals(current[0])) return;
                    items.setSelection(0);
                    if (items instanceof ListView) ((ListView) items).setSelectionFromTop(0, 0);
                    if (focusItems) items.requestFocus();
                });
                if (!kind.equals("live")) epg.setText(c[1] + " · " + list.size() + " titles");

            };
            if (got != null && !got.isEmpty()) { render.accept(got); return; }
            // List had no category tags for this one – ask the server for just this category.
            epg.setText("Loading " + c[1] + "…");
            plIo.execute(() -> {
                try {
                    List<Item> list = parseItems(kind, new JSONArray(cachedGet(kind, listAction, "&category_id=" + URLEncoder.encode(c[0], "UTF-8"))), c[1]);
                    ui.post(() -> render.accept(list));
                } catch (Exception ex) { ui.post(() -> { if (c[0].equals(current[0])) epg.setText("Couldn't load this category."); }); }
            });
        };

        if (!hasFullList(kind)) updatePlaylists(java.util.Collections.singletonList(kind), true);
        else if (plQueued.contains(kind)) showPlaylistDialog();
        epg.setText("Loading " + title + "…");
        plIo.execute(() -> {
            try {
                JSONArray a = new JSONArray(cachedGet(kind, catAction, ""));
                java.util.Map<String, String> catName = new java.util.HashMap<>();
                List<String[]> rows = new ArrayList<>();
                rows.add(new String[]{"*", "All"});
                for (int i = 0; i < a.length(); i++) {
                    JSONObject o = a.getJSONObject(i);
                    String cid = o.optString("category_id"), cn = o.optString("category_name");
                    catName.put(cid, cn);
                    if (hideAdult(cn)) continue;
                    rows.add(new String[]{cid, cn});
                }
                JSONArray full = new JSONArray(cachedGet(kind, listAction, ""));
                java.util.Map<String, List<Item>> groups = new java.util.HashMap<>();
                List<Item> everything = new ArrayList<>();
                for (int i = 0; i < full.length(); i++) {
                    JSONObject o = full.getJSONObject(i);
                    String cid = o.optString("category_id");
                    String cn = catName.containsKey(cid) ? catName.get(cid) : "";
                    if (hideAdult(cn)) continue;
                    Item it = itemFrom(kind, o, cn, i);
                    everything.add(it);
                    if (!cid.isEmpty()) { List<Item> g = groups.get(cid); if (g == null) groups.put(cid, g = new ArrayList<>()); g.add(it); }
                }
                List<String> names = new ArrayList<>();
                for (String[] r : rows) names.add(r[1]);
                ui.post(() -> {
                    catRows.clear(); catRows.addAll(rows);
                    byCat.clear(); byCat.putAll(groups);
                    all.clear(); all.addAll(everything);
                    cats.setAdapter(adapter(names));
                    cats.requestFocus();
                    cats.setSelection(0);
                    showCat.accept(0, false);
                });
            } catch (Exception ex) { ui.post(() -> epg.setText("Couldn't load " + title + ". Check your login in Settings, or press Refresh on the front screen.")); }
        });

        // Left from the preview or its guide always goes back to the channel being watched,
        // never to whichever row happens to sit beside it on screen.
        if (kind.equals("live")) {
            View.OnKeyListener backToChannel = (v, code, ev) -> {
                if (code != KeyEvent.KEYCODE_DPAD_LEFT) return false;
                if (ev.getAction() == KeyEvent.ACTION_DOWN) {
                    final int keep = livePos[0] >= 0 ? livePos[0] : Math.max(0, items.getSelectedItemPosition());
                    restoring[0] = true;
                    items.requestFocus();
                    items.setSelection(keep);
                    items.post(() -> items.setSelection(keep));
                    ui.postDelayed(() -> { items.setSelection(keep); livePos[0] = keep; restoring[0] = false; }, 120);
                }
                return true;
            };
            if (previewView != null) previewView.setOnKeyListener(backToChannel);
            if (previewEpg != null && previewEpg.getParent() instanceof View) ((View) previewEpg.getParent()).setOnKeyListener(backToChannel);
        }

        // D-pad focus entering the list picks the row nearest the category, so a fresh category
        // would land on a lower row; force the first item the first time focus arrives.
        final View.OnFocusChangeListener oldFocus = items.getOnFocusChangeListener();
        items.setOnFocusChangeListener((v, has) -> {
            if (oldFocus != null) oldFocus.onFocusChange(v, has);
            if (has && !freshTop[0] && kind.equals("live") && livePos[0] >= 0) {
                final int keep = livePos[0];
                restoring[0] = true;
                items.setSelection(keep);
                items.post(() -> items.setSelection(keep));
                ui.postDelayed(() -> { items.setSelection(keep); livePos[0] = keep; restoring[0] = false; }, 120);
            }
            if (has && freshTop[0]) {
                freshTop[0] = false;
                items.setSelection(0);
                if (items instanceof ListView) ((ListView) items).setSelectionFromTop(0, 0);
                items.post(() -> items.setSelection(0));
            }
        });
        final Runnable[] pendingCat = new Runnable[1];
        cats.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            @Override public void onItemSelected(AdapterView<?> p, View v, int pos, long id) {
                if (pendingCat[0] != null) ui.removeCallbacks(pendingCat[0]);
                pendingCat[0] = () -> showCat.accept(pos, false);
                ui.postDelayed(pendingCat[0], 250);
            }
            @Override public void onNothingSelected(AdapterView<?> p) {}
        });
        cats.setOnItemClickListener((p, v, pos, id) -> {
            if (pendingCat[0] != null) ui.removeCallbacks(pendingCat[0]);
            showCat.accept(pos, true);
        });

        items.setOnItemClickListener((p, v, pos, id) -> {
            Item it = (Item) items.getItemAtPosition(pos);
            if (previewView != null && platform().equals("phone")) { loadEpg(it, epg, previewEpg); schedulePreview(it, previewView, previewStatus); }
            open(it);
        });
        if (kind.equals("live")) items.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            @Override public void onItemSelected(AdapterView<?> p, View v, int pos, long id) {
                Item it = (Item) items.getItemAtPosition(pos);
                if (items.hasFocus() && !restoring[0]) livePos[0] = pos;
                loadEpg(it, epg, previewEpg);
                schedulePreview(it, previewView, previewStatus);
            }
            @Override public void onNothingSelected(AdapterView<?> p) {}
        });
    }

    private Item itemFrom(String kind, JSONObject o, String category, int pos) {
        String sid = kind.equals("series") ? o.optString("series_id") : o.optString("stream_id");
        Item it = new Item(kind, sid, o.optString("name"), o.optString("container_extension"), category);
        it.poster = kind.equals("series") ? o.optString("cover") : o.optString("stream_icon");
        it.added = o.optLong(kind.equals("series") ? "last_modified" : "added", 0);
        it.rating = o.optDouble(o.has("rating_5based") ? "rating_5based" : "rating", 0);
        if (Double.isNaN(it.rating)) it.rating = 0;
        it.pos = pos;
        return it;
    }

    private List<Item> parseItems(String kind, JSONArray a, String category) throws Exception {
        List<Item> l = new ArrayList<>();
        for (int i = 0; i < a.length(); i++) l.add(itemFrom(kind, a.getJSONObject(i), category, i));
        return l;
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
                List<Object[]> progs = new ArrayList<>();
                long nowSec = System.currentTimeMillis() / 1000;
                if (l != null) for (int i = 0; i < l.length(); i++) {
                    JSONObject e = l.getJSONObject(i);
                    String t = new String(Base64.decode(e.optString("title"), Base64.DEFAULT), "UTF-8");
                    long st = e.optLong("start_timestamp", 0), en = e.optLong("stop_timestamp", 0);
                    if (st > 0) progs.add(new Object[]{t, st});
                    String times = st > 0 ? clock(st) + (en > 0 ? " – " + clock(en) : "") : e.optString("start", "");
                    if (i == 0) {
                        int pct = st > 0 && en > st ? (int) Math.max(0, Math.min(100, (nowSec - st) * 100 / (en - st))) : -1;
                        guide.append("NOW");
                        if (pct >= 0) guide.append("  ·  ").append(pct).append("%");
                        guide.append("\n").append(times).append("\n").append(t);
                        guide.append("\n\nUP NEXT");
                    } else if (i == 1) {
                        // Live TV preview shows only Now and Up next.
                        guide.append("\n").append(times).append("\n").append(t);
                    }
                }
                String g = guide.length() == 0 ? "No TV guide for this channel." : guide.toString();
                ui.post(() -> { out.setText(head.toString()); if (box != null) box.setText(g); epgItem = it; epgProgs = progs; });
            } catch (Exception ignored) {
                ui.post(() -> { out.setText(it.name); if (box != null) box.setText("No TV guide for this channel."); });
            }
        });
    }

    private void open(Item it) {
        if (it.kind.equals("series")) { showSeries(it); return; }
        String fav = isSaved("fav", it) ? "Remove from favourites" : "Add to favourites";
        String key = watchKey(it.kind, it.id);
        long pos = prefs.getLong(key + ":position", 0), dur = prefs.getLong(key + ":duration", 0);
        if (WatchProgress.eligible(it.kind) && WatchProgress.resumable(pos, dur)) {
            String time = String.format(java.util.Locale.UK, "%d:%02d", pos / 60000, (pos / 1000) % 60);
            String[] o2 = {"▶ Continue watching · " + time + " (" + WatchProgress.percent(pos, dur) + "%)", "Play from beginning", "Play with VLC", fav, "Report a problem"};
            if ("film".equals(it.kind)) o2 = java.util.Arrays.copyOf(o2, o2.length + 1);
            if ("film".equals(it.kind)) o2[o2.length - 1] = "☆ Vote";
            new AlertDialog.Builder(this).setTitle(it.name).setItems(o2, (d, w) -> {
                if (w == 0) startPlayback(it, defaultVlc(), pos);
                else if (w == 1) startPlayback(it, defaultVlc(), 0);
                else if (w == 2) play(it, true);
                else if (w == 3) toggleSaved("fav", it);
                else if (w == 4) showReport(it);
                else showVote(it);
            }).show();
            return;
        }
        String[] opts = "film".equals(it.kind) ? new String[]{"Play", "Play with VLC", fav, "Report a problem", "☆ Vote"} : new String[]{"Play", "Play with VLC", fav, "Report a problem"};
        new AlertDialog.Builder(this).setTitle(it.name).setItems(opts, (d, w) -> {
            if (w == 0) play(it, defaultVlc());
            else if (w == 1) play(it, true);
            else if (w == 2) toggleSaved("fav", it);
            else if (w == 3) showReport(it);
            else showVote(it);
        }).show();
    }

    private void showSeries(Item show) {
        back = () -> browse("series");
        LinearLayout root = column();
        LinearLayout top = row();
        android.widget.ImageView poster = new android.widget.ImageView(this);
        poster.setScaleType(android.widget.ImageView.ScaleType.CENTER_CROP);
        poster.setBackgroundColor(Color.rgb(20, 28, 48));
        LinearLayout.LayoutParams plp = new LinearLayout.LayoutParams(dp(150), dp(220)); plp.rightMargin = dp(16);
        top.addView(poster, plp);
        loadPoster(poster, show.poster);
        LinearLayout head = column();
        head.addView(text(show.name, 26, TEXT, true));
        seriesRatingItem = show; seriesRatingLabel = text(ratingText(show), 14, MUTED, false); head.addView(seriesRatingLabel); requestRating(show);
        TextView info = text("Loading episodes…", 15, MUTED, false);
        head.addView(info);
        TextView plot = text("", 14, TEXT, false); plot.setMaxLines(5);
        head.addView(plot);
        LinearLayout btns = row();
        btns.addView(button(isSaved("fav", show) ? "★ Remove favourite" : "☆ Add favourite", v -> toggleSaved("fav", show)));
        btns.addView(button("☆ Vote", v -> showVote(show)));
        btns.addView(button("⚠ Report a problem", v -> showReport(show)));
        head.addView(btns);
        top.addView(head, weight(1, ViewGroup.LayoutParams.WRAP_CONTENT));
        root.addView(top);
        LinearLayout pills = row();
        android.widget.HorizontalScrollView hs = new android.widget.HorizontalScrollView(this);
        hs.addView(pills);
        root.addView(hs);
        ListView eps = list();
        root.addView(eps, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        setContentView(root);
        io.execute(() -> {
            try {
                JSONObject r = new JSONObject(Net.get(api("get_series_info") + "&series_id=" + show.id));
                JSONObject meta = r.optJSONObject("info");
                JSONObject all = r.optJSONObject("episodes");
                java.util.TreeMap<Integer, List<Item>> bySeason = new java.util.TreeMap<>();
                if (all != null) {
                    java.util.Iterator<String> seasons = all.keys();
                    while (seasons.hasNext()) {
                        String sn = seasons.next();
                        JSONArray a = all.optJSONArray(sn);
                        if (a == null) continue;
                        int num; try { num = Integer.parseInt(sn.trim()); } catch (Exception e) { num = 999; }
                        List<Item> l = new ArrayList<>();
                        for (int i = 0; i < a.length(); i++) {
                            JSONObject e = a.getJSONObject(i);
                            String t = e.optString("title");
                            String name = "E" + e.optString("episode_num") + "   " + t;
                            Item ep = new Item("episode", e.optString("id"), name, e.optString("container_extension"), show.category);
                            ep.seriesId = show.id;
                            JSONObject ei = e.optJSONObject("info");
                            if (ei != null) ep.poster = ei.optString("movie_image");
                            l.add(ep);
                        }
                        bySeason.put(num, l);
                    }
                }
                String cover = meta == null ? "" : meta.optString("cover");
                String story = meta == null ? "" : meta.optString("plot");
                ui.post(() -> {
                    if ((show.poster == null || show.poster.isEmpty()) && !cover.isEmpty()) loadPoster(poster, cover);
                    plot.setText(story);
                    int total = 0; for (List<Item> l : bySeason.values()) total += l.size();
                    info.setText(bySeason.size() + (bySeason.size() == 1 ? " season · " : " seasons · ") + total + " episodes");
                    bindSeriesSeasons(pills, eps, bySeason);
                    if (bySeason.isEmpty()) info.setText("No episodes for this series.");
                });
            } catch (Exception ex) { ui.post(() -> info.setText("Couldn't load episodes.")); }
        });
        eps.setOnItemClickListener((p, v, pos, id) -> {
            Item ep = (Item) eps.getItemAtPosition(pos);
            Item named = new Item(ep.kind, ep.id, show.name + " – " + ep.name, ep.ext, ep.category);
            named.poster = show.poster;
            named.seriesId = show.id;
            new AlertDialog.Builder(this).setTitle(named.name).setItems(new String[]{"Play", "Play with VLC", "⚠ Report a problem"},
                    (d, w) -> { if (w == 2) showReport(show, ep.name); else play(named, w == 1 || (w == 0 && defaultVlc())); }).show();
        });
    }

    /** Keep the season selection separate from remote focus, and hand Down/Up between panes. */
    private void bindSeriesSeasons(LinearLayout pills, ListView eps,
                                  java.util.SortedMap<Integer, List<Item>> bySeason) {
        List<Button> buttons = new ArrayList<>();
        Button[] active = new Button[1];
        GradientDrawable ring = new GradientDrawable();
        ring.setColor(Color.TRANSPARENT); ring.setCornerRadius(dp(8)); ring.setStroke(dp(3), ACCENT);
        eps.setSelector(ring);
        eps.setDrawSelectorOnTop(true);
        eps.setItemsCanFocus(false);
        eps.setFocusable(true);
        eps.setOnKeyListener((v, key, event) -> {
            int selected = eps.getSelectedItemPosition();
            if (key == KeyEvent.KEYCODE_DPAD_UP && selected <= 0 && active[0] != null) {
                if (event.getAction() == KeyEvent.ACTION_DOWN) active[0].requestFocus();
                return true;
            }
            if (key == KeyEvent.KEYCODE_DPAD_UP || key == KeyEvent.KEYCODE_DPAD_DOWN) {
                if (event.getAction() == KeyEvent.ACTION_DOWN && eps.getCount() > 0) {
                    int next = Math.max(0, Math.min(eps.getCount() - 1,
                            selected + (key == KeyEvent.KEYCODE_DPAD_DOWN ? 1 : -1)));
                    eps.setSelectionFromTop(next, 0);
                }
                return true;
            }
            if (key == KeyEvent.KEYCODE_DPAD_CENTER || key == KeyEvent.KEYCODE_ENTER
                    || key == KeyEvent.KEYCODE_NUMPAD_ENTER) {
                if (event.getAction() == KeyEvent.ACTION_UP && selected >= 0 && selected < eps.getCount())
                    eps.performItemClick(eps.getSelectedView(), selected, eps.getItemIdAtPosition(selected));
                return true;
            }
            return false;
        });
        for (java.util.Map.Entry<Integer, List<Item>> entry : bySeason.entrySet()) {
            Button b = button(entry.getKey() == 999 ? "Extras" : "Season " + entry.getKey(), null);
            GradientDrawable chosen = new GradientDrawable();
            chosen.setColor(CARD); chosen.setCornerRadius(dp(12)); chosen.setStroke(dp(3), ACCENT);
            StateListDrawable background = new StateListDrawable();
            background.addState(new int[]{android.R.attr.state_selected}, chosen);
            background.addState(new int[]{}, focusBg(12));
            b.setBackground(background);
            b.setOnClickListener(v -> {
                if (active[0] == b) return;
                active[0] = b;
                for (Button other : buttons) other.setSelected(other == b);
                List<Item> episodes = entry.getValue();
                eps.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_list_item_1, episodes) {
                    @Override public View getView(int i, View recycled, ViewGroup parent) {
                        LinearLayout episode = column();
                        episode.addView(text(episodes.get(i).name, 16, TEXT, false));
                        episode.addView(watchedBar(episodes.get(i)));
                        episode.setFocusable(false); episode.setClickable(false);
                        episode.setDescendantFocusability(ViewGroup.FOCUS_BLOCK_DESCENDANTS);
                        return episode;
                    }
                });
                watchedAdapter = (BaseAdapter) eps.getAdapter();
                eps.setSelectionFromTop(0, 0);
            });
            b.setOnKeyListener((v, key, event) -> {
                if (key != KeyEvent.KEYCODE_DPAD_DOWN) return false;
                if (event.getAction() == KeyEvent.ACTION_DOWN) {
                    b.performClick();
                    if (eps.getCount() > 0) {
                        eps.requestFocus();
                        if (eps.getSelectedItemPosition() < 0) eps.setSelection(0);
                    }
                }
                return true;
            });
            buttons.add(b); pills.addView(b);
        }
        if (!buttons.isEmpty()) {
            buttons.get(0).performClick();
            buttons.get(0).requestFocus();
        }
    }

    private void play(Item it, boolean vlc) {
        String key = watchKey(it.kind, it.id);
        long position = prefs.getLong(key + ":position", 0), duration = prefs.getLong(key + ":duration", 0);
        if (WatchProgress.eligible(it.kind) && WatchProgress.resumable(position, duration)) {
            String time = String.format(java.util.Locale.UK, "%d:%02d", position / 60000, (position / 1000) % 60);
            new AlertDialog.Builder(this).setTitle(it.name)
                    .setItems(new String[]{"Resume · " + time, "Play from beginning"},
                            (d, w) -> startPlayback(it, vlc, w == 0 ? position : 0)).show();
        } else startPlayback(it, vlc, 0);
    }

    private void startPlayback(Item it, boolean vlc, long position) {
        // No question up front: the built-in player asks only when the film or episode really has subtitles.
        beginPlayback(it, vlc, position, false);
    }

    private void beginPlayback(Item it, boolean vlc, long position, boolean subtitles) {
        // Adult-category items are never kept in recently watched, for safety.
        if (!isAdultCategory(it.category) && !"catchup".equals(it.kind)) remember("recent", it);
        String url = streamUrl(it);
        setNowPlaying(it, vlc);
        if (vlc) {
            Intent i = new Intent(Intent.ACTION_VIEW).setPackage("org.videolan.vlc").setDataAndTypeAndNormalize(Uri.parse(url), "video/*");
            i.putExtra("title", it.name);
            i.putExtra("position", position);
            i.putExtra("from_start", position <= 0);
            if (WatchProgress.eligible(it.kind)) i.putExtra("subtitles_enabled", subtitles);
            vlcKey = WatchProgress.eligible(it.kind) ? watchKey(it.kind, it.id) : null;
            vlcSeriesKey = WatchProgress.eligible(it.kind) && !it.seriesId.isEmpty() ? watchKey("series", it.seriesId) : null;
            // Some Android boxes can't hardware-decode provider recordings; VLC's software decoder plays them.
            if ("catchup".equals(it.kind)) i.putExtra("disable_hardware", true);
            vlcCatchup = "catchup".equals(it.kind) ? it : null; vlcStarted = android.os.SystemClock.elapsedRealtime();
            try { startActivityForResult(i, VLC_REQUEST); }
            catch (Exception e) {
                new AlertDialog.Builder(this).setTitle("VLC isn't installed")
                        .setMessage("Install VLC from your app store (or Downloader) to use it as the player. Playing in BM Player instead.")
                        .setPositiveButton("OK", (d, w) -> beginPlayback(it, false, position, subtitles)).show();
            }
            return;
        }
        Intent intent = new Intent(this, PlayerActivity.class).putExtra("url", url);
        if ("catchup".equals(it.kind) && it.catchupEnd > it.catchupStart) {
            // Providers often close timeshift streams early; the player reconnects from where it stopped.
            intent.putExtra("catchup_prefix", prefs.getString("dns", "").replaceAll("/+$", "") + "/timeshift/" + prefs.getString("user", "") + "/" + prefs.getString("pass", "") + "/")
                    .putExtra("catchup_id", it.catchupId).putExtra("catchup_start", it.catchupStart).putExtra("catchup_end", it.catchupEnd)
                    .putExtra("catchup_tz", prefs.getString("server_tz", "Europe/London"));
        }
        if (WatchProgress.eligible(it.kind)) {
            intent.putExtra("subtitles", 2);
            intent.putExtra("progress_key", watchKey(it.kind, it.id)).putExtra("resume_ms", position);
            if (!it.seriesId.isEmpty()) intent.putExtra("series_key", watchKey("series", it.seriesId));
        }
        startActivity(intent);
    }

    private static final int VLC_REQUEST = 4242;
    private Item vlcCatchup; private long vlcStarted;

    // ---------- search (TV / Movies / Series, typed or by voice) ----------
    private static final int VOICE_REQUEST = 4343;
    private String voiceKind;

    private void startVoice(String kind) {
        Intent i = new Intent(android.speech.RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        i.putExtra(android.speech.RecognizerIntent.EXTRA_LANGUAGE_MODEL, android.speech.RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        i.putExtra(android.speech.RecognizerIntent.EXTRA_LANGUAGE, "en-GB");
        i.putExtra(android.speech.RecognizerIntent.EXTRA_PROMPT, "Say what you're looking for");
        voiceKind = kind;
        boolean has = false;
        try { has = i.resolveActivity(getPackageManager()) != null; } catch (Exception ignored) {}
        if (has) {
            try { startActivityForResult(i, VOICE_REQUEST); return; } catch (Exception ignored) {}
        }
        voiceKind = null;
        voiceDictation(kind);
    }

    private void hideKeyboard(View v) {
        android.view.inputmethod.InputMethodManager imm = (android.view.inputmethod.InputMethodManager) getSystemService(INPUT_METHOD_SERVICE);
        if (imm != null) imm.hideSoftInputFromWindow(v.getWindowToken(), 0);
        if (getWindow() != null) getWindow().setSoftInputMode(android.view.WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_HIDDEN);
    }
    private void openKbNow(View v) {
        v.requestFocus();
        android.view.inputmethod.InputMethodManager imm = (android.view.inputmethod.InputMethodManager) getSystemService(INPUT_METHOD_SERVICE);
        if (imm != null) imm.showSoftInput(v, 0);
    }

    /**
     * Keeps the on-screen keypad from sitting on top of what you're typing: the box is held in the
     * top part of the screen, clear of the keypad, on TV boxes, Fire TVs and phones alike.
     */
    private void keepEntryVisible(android.app.Dialog dlg, EditText in) {
        if (in != null) in.setImeOptions(in.getImeOptions()
                | android.view.inputmethod.EditorInfo.IME_FLAG_NO_EXTRACT_UI
                | android.view.inputmethod.EditorInfo.IME_FLAG_NO_FULLSCREEN);
        android.view.Window w = dlg == null ? null : dlg.getWindow();
        if (w == null) return;
        // Pan, not resize: a resized pop-up on a sideways phone is cut off at the keypad's top edge and
        // hides the box, whereas pan always slides the pop-up up until the box itself is above the keys.
        w.setSoftInputMode(android.view.WindowManager.LayoutParams.SOFT_INPUT_ADJUST_PAN
                | android.view.WindowManager.LayoutParams.SOFT_INPUT_STATE_VISIBLE);
        android.view.WindowManager.LayoutParams lp = w.getAttributes();
        lp.gravity = Gravity.TOP;
        lp.y = dp(16);
        w.setAttributes(lp);
    }

    /** How far a screen must be lifted so the keypad no longer covers it (keypad, else the phone's nav bar). */
    static int keypadLift(int imeBottom, int navBottom) {
        return Math.max(0, Math.max(imeBottom, navBottom));
    }

    /**
     * Android 15+ draws apps edge-to-edge and ignores "resize for the keypad", so full screens (the
     * account number screen) lift themselves by the keypad's height and scroll the box into view.
     */
    private void fitScreenAboveKeypad(View screen, View field) {
        if (Build.VERSION.SDK_INT < 30) return; // older Android still resizes the window itself
        final int base = screen.getPaddingBottom();
        screen.setOnApplyWindowInsetsListener((v, ins) -> {
            int ime = ins.getInsets(android.view.WindowInsets.Type.ime()).bottom;
            int nav = Build.VERSION.SDK_INT >= 35 ? ins.getInsets(android.view.WindowInsets.Type.systemBars()).bottom : 0;
            // Below 35 the window was already resized above the keypad, so only lift when edge-to-edge.
            int lift = Build.VERSION.SDK_INT >= 35 ? keypadLift(ime, nav) : 0;
            v.setPadding(v.getPaddingLeft(), v.getPaddingTop(), v.getPaddingRight(), base + lift);
            if (ime > 0 && field != null) v.post(() -> {
                android.graphics.Rect r = new android.graphics.Rect();
                field.getDrawingRect(r);
                r.bottom += dp(72); // keep the Unlock button in view too
                field.requestRectangleOnScreen(r, true);
            });
            return ins;
        });
        screen.requestApplyInsets();
    }


    /** Fire TV has no speech service for sideloaded apps, but its keyboard takes dictation from the remote's mic button. */
    private void voiceDictation(String kind) {
        LinearLayout box = new LinearLayout(this); box.setOrientation(LinearLayout.VERTICAL); box.setPadding(dp(16), dp(8), dp(16), 0);
        box.addView(text("🎤 Wait for the on-screen keyboard to open, then press and hold the microphone button on your remote, say what you're looking for, and let go. If the keyboard closes, press OK on the box below to open it again.", 16, TEXT, false));
        android.widget.EditText q = new android.widget.EditText(this);
        q.setSingleLine(true); q.setHint("Your words appear here");
        q.setImeOptions(android.view.inputmethod.EditorInfo.IME_ACTION_SEARCH);
        box.addView(q);
        AlertDialog[] dlg = new AlertDialog[1];
        Runnable go = () -> {
            String want = q.getText().toString().trim();
            if (want.length() < 2) { Toast.makeText(this, "Hold the mic button and speak, or type", Toast.LENGTH_SHORT).show(); return; }
            hideKeyboard(q);
            if (dlg[0] != null) dlg[0].dismiss();
            if ("sports".equals(kind)) { if (!"sports".equals(screen)) showSports(); sportsVoice(want); }
            else showSearch(kind, want);
        };
        q.setOnEditorActionListener((tv, a, ev) -> { go.run(); return true; });
        dlg[0] = new AlertDialog.Builder(this).setTitle("Voice search").setView(box)
                .setPositiveButton("Search", null).setNegativeButton("Cancel", null).create();
        dlg[0].setOnShowListener(d -> {
            dlg[0].getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> go.run());
            // Fire TV only routes the mic to dictation while its own keyboard is open on a focused box,
            // otherwise Alexa takes the press and searches the whole device. Force the keyboard open.
            q.setFocusable(true); q.setFocusableInTouchMode(true);
            Runnable openKb = () -> {
                q.requestFocus();
                android.view.inputmethod.InputMethodManager imm = (android.view.inputmethod.InputMethodManager) getSystemService(INPUT_METHOD_SERVICE);
                if (imm != null && dlg[0].isShowing()) imm.showSoftInput(q, 0);
            };
            q.postDelayed(openKb, 300);
        });
        if (dlg[0].getWindow() != null) dlg[0].getWindow().setSoftInputMode(android.view.WindowManager.LayoutParams.SOFT_INPUT_STATE_VISIBLE);
        // Close the keyboard whenever the voice box goes, so it never stays stuck on screen.
        dlg[0].setOnDismissListener(d -> hideKeyboard(q));
        q.setOnClickListener(v -> openKbNow(q));
        keepEntryVisible(dlg[0], q);
        dlg[0].show();

    }

    private void showSearch(String kind, String start) {
        String label = kind.equals("live") ? "TV channels" : kind.equals("film") ? "Movies" : "Series";
        LinearLayout box = new LinearLayout(this); box.setOrientation(LinearLayout.VERTICAL); box.setPadding(dp(16), dp(8), dp(16), 0);
        android.widget.EditText q = new android.widget.EditText(this);
        q.setSingleLine(true); q.setHint("Type at least 3 letters"); q.setText(start);
        q.setImeOptions(android.view.inputmethod.EditorInfo.IME_ACTION_SEARCH);
        box.addView(q);
        AlertDialog[] dlg = new AlertDialog[1];
        box.addView(button("🎤 Search by voice", v -> { if (dlg[0] != null) dlg[0].dismiss(); startVoice(kind); }));
        Runnable go = () -> {
            String want = q.getText().toString().trim();
            if (want.length() < 3) { Toast.makeText(this, "Please enter at least 3 letters", Toast.LENGTH_SHORT).show(); return; }
            if (dlg[0] != null) dlg[0].dismiss();
            runSearch(kind, want);
        };
        q.setOnEditorActionListener((tv, a, ev) -> { go.run(); return true; });
        dlg[0] = new AlertDialog.Builder(this).setTitle("Search " + label).setView(box)
                .setPositiveButton("Search", null).setNegativeButton("Cancel", null).create();
        dlg[0].setOnShowListener(d -> dlg[0].getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> go.run()));
        keepEntryVisible(dlg[0], q);
        dlg[0].show();

        if (start.trim().length() >= 3) { go.run(); }
    }

    private void runSearch(String kind, String want) {
        Toast.makeText(this, "Searching…", Toast.LENGTH_SHORT).show();
        io.execute(() -> {
            try {
                List<Item> all = parseItems(kind, new JSONArray(cachedGet(kind, listActionFor(kind), "")), null);
                String w = want.toLowerCase(java.util.Locale.UK);
                List<Item> hits = new ArrayList<>();
                for (Item it : all) { if (it.name != null && it.name.toLowerCase(java.util.Locale.UK).contains(w)) hits.add(it); if (hits.size() >= 200) break; }
                ui.post(() -> {
                    if (hits.isEmpty()) { Toast.makeText(this, "Nothing found for \"" + want + "\"", Toast.LENGTH_LONG).show(); showSearch(kind, ""); return; }
                    String[] names = new String[hits.size()];
                    for (int i = 0; i < names.length; i++) names[i] = hits.get(i).name;
                    resultList(hits.size() + (hits.size() >= 200 ? "+" : "") + " results for \"" + want + "\"", hits.size(), i -> {
                                LinearLayout row = column();
                                row.addView(text(names[i], 16, TEXT, false));
                                // Films show how much has been watched; series show it per episode on their own page.
                                if (kind.equals("film")) row.addView(watchedBar(hits.get(i)));
                                return row;
                            }, i -> { Item it = hits.get(i); if (kind.equals("series")) showSeries(it); else open(it); },
                            null, null, "New search", () -> showSearch(kind, ""));
                });
            } catch (Exception ex) { ui.post(() -> Toast.makeText(this, "Couldn't search – try refreshing your playlist", Toast.LENGTH_LONG).show()); }
        });
    }
    private String vlcKey, vlcSeriesKey;

    /** VLC reports where the customer stopped, so VLC playback also keeps watched progress. */
    @Override protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req == VOICE_REQUEST) {
            String kind = voiceKind; voiceKind = null;
            if (res != RESULT_OK || data == null || kind == null) return;
            java.util.ArrayList<String> r = data.getStringArrayListExtra(android.speech.RecognizerIntent.EXTRA_RESULTS);
            if (r != null && !r.isEmpty()) {
                if ("sports".equals(kind)) { if (!"sports".equals(screen)) showSports(); sportsVoice(r.get(0)); }
                else showSearch(kind, r.get(0));
            }
            return;
        }
        if (req == VLC_REQUEST && vlcCatchup != null) {
            Item cu = vlcCatchup; vlcCatchup = null;
            long pos = data == null ? -1 : data.getLongExtra("extra_position", -1);
            if (CatchupFallback.vlcFailed(res, android.os.SystemClock.elapsedRealtime() - vlcStarted, pos)) {
                Toast.makeText(this, "VLC couldn't play this recording, playing it in BM Player instead", Toast.LENGTH_LONG).show();
                beginPlayback(cu, false, 0, false);
            }
            return;
        }
        if (req != VLC_REQUEST || data == null || vlcKey == null) return;
        long position = data.getLongExtra("extra_position", -1), duration = data.getLongExtra("extra_duration", -1);
        if (position < 0 || duration <= 0) return;
        if (position >= duration - 15000) position = duration;
        SharedPreferences.Editor e = prefs.edit().putLong(vlcKey + ":position", position).putLong(vlcKey + ":duration", duration);
        if (vlcSeriesKey != null) e.putLong(vlcSeriesKey + ":position", position).putLong(vlcSeriesKey + ":duration", duration);
        e.apply();
        vlcKey = null; vlcSeriesKey = null;
        if (watchedAdapter != null) watchedAdapter.notifyDataSetChanged();
    }

    private String watchKey(String kind, String id) {
        try {
            String scope = prefs.getString("dns", "").replaceAll("/+$", "") + "\n" + prefs.getString("user", "");
            byte[] hash = java.security.MessageDigest.getInstance("SHA-256").digest(scope.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            return "watch:" + Base64.encodeToString(hash, Base64.NO_WRAP) + ":" + kind + ":" + id;
        } catch (java.security.NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }

    private LinearLayout watchedBar(Item it) {
        String key = watchKey(it.kind, it.id);
        long duration = prefs.getLong(key + ":duration", 0), position = prefs.getLong(key + ":position", 0);
        LinearLayout box = new LinearLayout(this); box.setOrientation(LinearLayout.VERTICAL);
        android.widget.ProgressBar bar = new android.widget.ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        if (duration <= 0) { box.setVisibility(View.GONE); return box; }
        bar.setMax(100); bar.setProgress(WatchProgress.percent(position, duration));
        bar.setProgressTintList(android.content.res.ColorStateList.valueOf(ACCENT));
        box.addView(bar, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(6)));
        String label = duration > 0 ? WatchProgress.percent(position, duration) + "% watched" : "";
        if ("series".equals(it.kind) && duration > 0) label = "Last episode · " + label;
        box.addView(text(label, 12, MUTED, false));
        return box;
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

    /** Favourites live on the website per account and login so every BM Player shows the same list. */
    private void syncFavourites(Runnable changed) {
        String token = prefs.getString("token", ""), login = prefs.getString("user", "");
        if (token.isEmpty() || login.isEmpty()) return;
        ratingIo.execute(() -> {
            try {
                JSONObject r = new JSONObject(Net.postJson("https://bmsupport.uk/api/public/player", new JSONObject().put("action", "favourites").put("device_token", token).put("login", login).toString()));
                if (!r.has("items")) return;
                if (!r.optBoolean("stored")) { if (saved("fav").length() > 0) pushFavourites(); prefs.edit().putBoolean("fav_synced", true).apply(); return; }
                JSONArray items = r.getJSONArray("items");
                if (!prefs.getBoolean("fav_synced", false)) {
                    // First sync on this device: keep its own favourites as well as the account's, then share the lot.
                    JSONArray local = saved("fav"); java.util.Set<String> seen = new java.util.HashSet<>();
                    for (int i = 0; i < items.length(); i++) { JSONObject o = items.optJSONObject(i); if (o != null) seen.add(o.optString("kind") + "|" + o.optString("id")); }
                    boolean added = false;
                    for (int i = 0; i < local.length(); i++) { JSONObject o = local.optJSONObject(i); if (o != null && seen.add(o.optString("kind") + "|" + o.optString("id"))) { items.put(o); added = true; } }
                    final boolean push = added;
                    final String merged = items.toString();
                    ui.post(() -> { prefs.edit().putString("fav", merged).putBoolean("fav_synced", true).apply(); if (push) pushFavourites(); if (changed != null) changed.run(); });
                    return;
                }
                String remote = items.toString();
                ui.post(() -> {
                    if (remote.equals(prefs.getString("fav", "[]"))) return;
                    prefs.edit().putString("fav", remote).apply();
                    if (changed != null) changed.run();
                });
            } catch (Exception ignored) {}
        });
    }
    private void pushFavourites() {
        String token = prefs.getString("token", ""), login = prefs.getString("user", ""), items = prefs.getString("fav", "[]");
        if (token.isEmpty() || login.isEmpty()) return;
        ratingIo.execute(() -> {
            try { Net.postJson("https://bmsupport.uk/api/public/player", new JSONObject().put("action", "favourites_set").put("device_token", token).put("login", login).put("items", new JSONArray(items)).toString()); }
            catch (Exception ignored) {}
        });
    }

    private void toggleSaved(String key, Item it) {
        if ("fav".equals(key)) { toggleSavedLocal(key, it); pushFavourites(); return; }
        toggleSavedLocal(key, it);
    }
    private void toggleSavedLocal(String key, Item it) {
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
        if ("fav".equals(key) && !"fav".equals(screen)) syncFavourites(() -> { if ("fav".equals(screen)) showSaved(key, title); });
        screen = key; back = this::showHome;
        LinearLayout root = column();
        root.addView(text(title, 26, TEXT, true));
        JSONArray a = saved(key);
        List<Item> list = new ArrayList<>();
        boolean droppedAdult = false;
        for (int i = 0; i < a.length(); i++) {
            JSONObject o = a.optJSONObject(i);
            if (o == null) continue;
            Item it = Item.fromJson(o);
            // Recently watched never shows adult-category items, even ones saved before this rule.
            if (key.equals("recent") && isAdultCategory(it.category)) { droppedAdult = true; continue; }
            list.add(it);
        }
        if (droppedAdult) {
            JSONArray clean = new JSONArray();
            for (Item it : list) clean.put(it.toJson());
            prefs.edit().putString(key, clean.toString()).apply();
        }
        // Tabs split the saved list into Live TV, Movies and Series (episodes count as Series).
        final String tab = savedTab.containsKey(key) ? savedTab.get(key) : "live";
        LinearLayout tabs = new LinearLayout(this);
        tabs.setOrientation(LinearLayout.HORIZONTAL);
        String[][] tabDefs = {{"live", "📺 Live TV"}, {"film", "🎬 Movies"}, {"series", "🎞 Series"}};
        Button activeTab = null;
        for (String[] t : tabDefs) {
            int count = 0;
            for (Item it : list) if (savedKind(it).equals(t[0])) count++;
            final String id = t[0];
            Button b = button((id.equals(tab) ? "● " : "") + t[1] + " (" + count + ")", v -> { savedTab.put(key, id); showSaved(key, title); });
            if (id.equals(tab)) activeTab = b;
            tabs.addView(b, weight(1, ViewGroup.LayoutParams.WRAP_CONTENT));
        }
        root.addView(tabs);
        List<Item> all = list;
        list = new ArrayList<>();
        for (Item it : all) if (savedKind(it).equals(tab)) list.add(it);
        final List<Item> shown = list;
        if (shown.isEmpty()) root.addView(text("Nothing here yet.", 18, MUTED, false));
        ListView lv = list();
        lv.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_list_item_1, shown) {
            @Override public View getView(int i, View cv, ViewGroup parent) { return styleRow(super.getView(i, cv, parent)); }
        });
        lv.setOnItemClickListener((p, v, pos, id) -> {
            Item it = shown.get(pos);
            if (it.kind.equals("episode")) play(it, defaultVlc()); else open(it);
        });
        root.addView(lv, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        setContentView(root);
        if (shown.isEmpty() && activeTab != null) activeTab.requestFocus(); else lv.requestFocus();
    }

    private final java.util.Map<String, String> savedTab = new java.util.HashMap<>();

    private static String savedKind(Item it) { return it.kind.equals("live") ? "live" : it.kind.equals("film") ? "film" : "series"; }

    // ---------- report a problem ----------

    private void showReport(Item it) { showReport(it, null); }

    /** Report from inside a channel, film or episode: the app sends the names and category with the customer's words, and the website opens a ticket. */
    private void showReport(Item it, String episode) {
        if (it == null) return;
        String kind = it.kind.equals("live") ? "live" : it.kind.equals("film") ? "film" : "series";
        String cat = categoryName(it);
        LinearLayout box = column();
        box.setPadding(dp(20), dp(10), dp(20), 0);
        box.addView(text((kind.equals("live") ? "Channel: " : kind.equals("film") ? "Film: " : "Series: ") + it.name
                + (episode != null ? "\nEpisode: " + episode : "") + (cat.isEmpty() ? "" : "\nCategory: " + cat), 15, TEXT, false));
        android.widget.EditText issue = new android.widget.EditText(this);
        issue.setHint("Briefly tell us what's wrong (e.g. buffering, no sound, won't play)");
        issue.setMinLines(3); issue.setMaxLines(5);
        issue.setFilters(new android.text.InputFilter[]{ new android.text.InputFilter.LengthFilter(1000) });
        issue.setTextColor(TEXT); issue.setHintTextColor(MUTED);
        box.addView(issue);
        AlertDialog dlg = new AlertDialog.Builder(this).setTitle("Report a problem").setView(box)
                .setNegativeButton("Cancel", null).setPositiveButton("Send to BM Support", null).create();
        dlg.setOnShowListener(x -> dlg.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
            String msg = issue.getText().toString().trim();
            if (msg.length() < 3) { issue.setError("Please type a short description"); return; }
            v.setEnabled(false);
            io.execute(() -> {
                String err = null;
                try {
                    JSONObject b = new JSONObject().put("action", "report").put("device_token", prefs.getString("token", ""))
                            .put("kind", kind).put("title", it.name).put("issue", msg)
                            .put("device", deviceLabel()).put("version", appVersion());
                    if (!cat.isEmpty()) b.put("category", cat);
                    if (episode != null) b.put("episode", episode);
                    Net.postJson(Net.SITE + "/api/public/player", b.toString());
                } catch (Exception e) {
                    String m = String.valueOf(e.getMessage());
                    int i = m.indexOf("\"error\":\"");
                    err = i >= 0 ? m.substring(i + 9, Math.max(i + 9, m.indexOf('"', i + 9))) : "Couldn't send your report. Check your internet and try again.";
                }
                final String fe = err;
                ui.post(() -> {
                    if (fe != null) { v.setEnabled(true); Toast.makeText(this, fe, Toast.LENGTH_LONG).show(); return; }
                    dlg.dismiss();
                    Toast.makeText(this, "Thanks – a support ticket has been opened. You'll find replies at bmsupport.uk/tickets", Toast.LENGTH_LONG).show();
                });
            });
        }));
        keepEntryVisible(dlg, issue);
        dlg.show();

    }

    /** Items hold a category id or name; turn ids into the name from the saved category list. */
    private String categoryName(Item it) {
        String c = it.category == null ? "" : it.category;
        if (!c.matches("\\d+")) return c;
        try {
            String action = it.kind.equals("live") ? "get_live_categories" : it.kind.equals("film") ? "get_vod_categories" : "get_series_categories";
            String kind = it.kind.equals("live") ? "live" : it.kind.equals("film") ? "film" : "series";
            java.io.File f = cacheFile(kind, action);
            if (f.exists()) {
                java.io.ByteArrayOutputStream bo = new java.io.ByteArrayOutputStream();
                try (java.io.FileInputStream in = new java.io.FileInputStream(f)) { byte[] buf = new byte[65536]; int n; while ((n = in.read(buf)) > 0) bo.write(buf, 0, n); }
                JSONArray a = new JSONArray(bo.toString("UTF-8"));
                for (int i = 0; i < a.length(); i++) { JSONObject o = a.optJSONObject(i); if (o != null && c.equals(o.optString("category_id"))) return o.optString("category_name"); }
            }
        } catch (Exception ignored) {}
        return "";
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
        screen = "settings"; back = this::showHome; drawnVersion = appVersion();
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
                prefs.edit().putInt("epg_shift", w - 12).putInt("epg_shift_offset", deviceOffsetMins()).apply(); d.dismiss(); showSettings();
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
        boxes.add(settingBox("👤", "Change login", prefs.getString("user", ""), v -> new AlertDialog.Builder(this)
                .setTitle("Change login?")
                .setMessage("Selecting this logs you out and takes you back to the login screen. You'll need to sign in again to use the app.")
                .setPositiveButton("Log out", (d, w) -> {
                    prefs.edit().remove("user").remove("pass").apply();
                    showLink();
                })
                .setNegativeButton("Cancel", null).show()));
        boxes.add(settingBox("🕘", "Clear history", "Recently watched", v -> {
            prefs.edit().remove("recent").apply();
            Toast.makeText(this, "Recently watched cleared", Toast.LENGTH_SHORT).show();
        }));
        boxes.add(settingBox("★", "Clear favourites", "All favourites", v -> new AlertDialog.Builder(this)
                .setMessage("Remove all favourites from all your BM Players?")
                .setPositiveButton("Clear", (d, w) -> { prefs.edit().remove("fav").apply(); pushFavourites(); Toast.makeText(this, "Favourites cleared", Toast.LENGTH_SHORT).show(); })
                .setNegativeButton("Cancel", null).show()));
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

    private static String catActionFor(String kind) { return kind.equals("live") ? "get_live_categories" : kind.equals("film") ? "get_vod_categories" : "get_series_categories"; }
    private static String listActionFor(String kind) { return kind.equals("live") ? "get_live_streams" : kind.equals("film") ? "get_vod_streams" : "get_series"; }
    private static String sectionName(String kind) { return kind.equals("live") ? "Live TV" : kind.equals("film") ? "Films" : "Series"; }

    private void writeCache(String kind, String key, String body) throws Exception {
        java.io.File f = cacheFile(kind, key), tmp = new java.io.File(f.getPath() + ".tmp");
        try (java.io.FileOutputStream o = new java.io.FileOutputStream(tmp)) { o.write(body.getBytes("UTF-8")); }
        if (!tmp.renameTo(f)) { f.delete(); tmp.renameTo(f); }
    }

    private boolean hasFullList(String kind) {
        java.io.File f = cacheFile(kind, listActionFor(kind));
        return f.exists() && f.length() > 0;
    }

    // ---------- playlist update queue + progress pop-up ----------
    /** Playlist downloads run one after another here; browse loads queue behind them so they read the fresh cache. */
    private final ExecutorService plIo = Executors.newSingleThreadExecutor();
    private final java.util.Map<String, TextView> tileStatus = new java.util.HashMap<>();
    private final java.util.Set<String> plQueued = new java.util.HashSet<>();
    private int plDone, plTotal;
    private String plMsg = "";
    private AlertDialog plDialog;
    private TextView plText, plPct;
    private android.widget.ProgressBar plBar;

    private boolean playlistsUpdating() { return plTotal > 0 && plDone < plTotal; }

    /** Downloads categories + full lists for the given sections; keeps the old lists until the new ones arrive. */
    private void updatePlaylists(List<String> kinds, boolean popup) {
        List<String> todo = new ArrayList<>();
        for (String k : kinds) if (plQueued.add(k)) todo.add(k);
        if (todo.isEmpty()) { if (popup && playlistsUpdating()) showPlaylistDialog(); return; }
        if (!playlistsUpdating()) { plDone = 0; plTotal = 0; }
        plTotal += todo.size() * 2;
        plMsg = "Getting ready…";
        if (popup) showPlaylistDialog();
        renderPlaylistProgress();
        for (String kind : todo) {
            ui.post(() -> { TextView s = tileStatus.get(kind); if (s != null) s.setText("Updating…"); });
            plIo.execute(() -> {
                String name = sectionName(kind);
                int steps = 0;
                try {
                    plSet("Downloading " + name + " categories…");
                    String cats = Net.get(api(catActionFor(kind)));
                    new JSONArray(cats);
                    steps++; plStepDone();
                    final String what = kind.equals("live") ? "channels" : kind.equals("film") ? "films" : "series";
                    plSet("Downloading " + name + " " + what + "…");
                    String list = Net.get(api(listActionFor(kind)), bytes -> plSet("Downloading " + name + " " + what + "…  " + String.format(java.util.Locale.UK, "%.1f MB", bytes / 1048576.0)));
                    int n = new JSONArray(list).length();
                    clearCache(kind);
                    writeCache(kind, catActionFor(kind), cats);
                    writeCache(kind, listActionFor(kind), list);
                    prefs.edit().putLong("refreshed_" + kind, System.currentTimeMillis()).apply();
                    steps++; plStepDone();
                    ui.post(() -> { TextView s = tileStatus.get(kind); if (s != null) s.setText(n + " " + what + " · updated now"); });
                } catch (Exception e) {
                    ui.post(() -> { TextView s = tileStatus.get(kind); if (s != null) s.setText("Couldn't update. Try again."); });
                } finally {
                    while (steps++ < 2) plStepDone();
                    ui.post(() -> plQueued.remove(kind));
                }
            });
        }
    }

    private void plSet(String msg) { plMsg = msg; ui.post(this::renderPlaylistProgress); }
    private void plStepDone() {
        ui.post(() -> {
            plDone++;
            if (plDone >= plTotal) {
                plMsg = "All playlists are up to date";
                renderPlaylistProgress();
                ui.postDelayed(() -> { if (!playlistsUpdating() && plDialog != null) { try { plDialog.dismiss(); } catch (Exception ignored) {} plDialog = null; } }, 900);
            } else renderPlaylistProgress();
        });
    }

    private void showPlaylistDialog() {
        if (plDialog != null && plDialog.isShowing()) return;
        LinearLayout box = column();
        box.setPadding(dp(28), dp(24), dp(28), dp(20));
        box.setBackgroundColor(CARD);
        box.addView(text("Updating your playlists", 22, TEXT, true));
        box.addView(text("Your channels, films and series are being downloaded. Lists will open as soon as this finishes.", 15, MUTED, false));
        plBar = new android.widget.ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        plBar.setMax(1000);
        plBar.setProgressTintList(android.content.res.ColorStateList.valueOf(ACCENT));
        LinearLayout.LayoutParams bl = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(14));
        bl.topMargin = dp(14);
        box.addView(plBar, bl);
        LinearLayout r = row();
        plText = text("", 15, TEXT, false);
        plPct = text("", 15, ACCENT, true);
        r.addView(plText, weight(1, ViewGroup.LayoutParams.WRAP_CONTENT));
        r.addView(plPct);
        box.addView(r);
        Button hide = button("Hide – keep updating in the background", v -> { if (plDialog != null) plDialog.dismiss(); });
        box.addView(hide);
        plDialog = new AlertDialog.Builder(this).setView(box).create();
        plDialog.setOnDismissListener(d -> plDialog = null);
        plDialog.show();
        hide.requestFocus();
        renderPlaylistProgress();
    }

    private void renderPlaylistProgress() {
        if (plBar == null || plDialog == null) return;
        int pct = plTotal == 0 ? 100 : Math.min(100, plDone * 100 / plTotal);
        plBar.setProgress(plTotal == 0 ? 1000 : Math.min(1000, plDone * 1000 / plTotal));
        plText.setText(plMsg);
        plPct.setText("  " + pct + "%");
    }

    /** Manual refresh from a tile: one section, with the progress pop-up. */
    private void refreshSection(String kind, TextView status) {
        if (status != null) tileStatus.put(kind, status);
        updatePlaylists(java.util.Collections.singletonList(kind), true);
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
        TextView status = text(plQueued.contains(kind) ? "Updating…" : refreshedLabel(kind), 13, MUTED, false);
        status.setGravity(Gravity.CENTER);
        tileStatus.put(kind, status);
        Button r = button("⟳  Refresh " + label, v -> refreshSection(kind, status));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.topMargin = dp(8);
        col.addView(r, lp);
        col.addView(status);
        return col;
    }

    /** Front screen start-up: fetch any section that has no list yet, or is due under the Automation setting. */
    private void autoUpdatePlaylists() {
        if (autoDone) return;
        autoDone = true;
        String auto = prefs.getString("auto_refresh", "daily");
        List<String> due = new ArrayList<>();
        for (String k : new String[]{"live", "film", "series"}) {
            long last = prefs.getLong("refreshed_" + k, 0);
            if (!hasFullList(k) || auto.equals("open") || (auto.equals("daily") && System.currentTimeMillis() - last > 86_400_000L)) due.add(k);
        }
        if (!due.isEmpty()) updatePlaylists(due, true);
    }
    private boolean autoDone;

    // ---------- maintenance ----------

    /** Sends the previous session's crash details to BM Support once, as a ticket. */
    private void sendLastCrash() {
        String crash = prefs.getString("last_crash", "");
        if (crash.isEmpty() || prefs.getString("token", "").isEmpty()) return;
        prefs.edit().remove("last_crash").apply();
        String issue = crash.length() > 990 ? crash.substring(0, 990) : crash;
        io.execute(() -> {
            try {
                Net.postJson(Net.SITE + "/api/public/player", new JSONObject().put("action", "report").put("device_token", prefs.getString("token", ""))
                        .put("kind", "live").put("title", "App crash report (automatic)").put("issue", issue)
                        .put("category", "Catch up / crash").put("device", deviceLabel()).put("version", appVersion()).toString());
            } catch (Exception ignored) {}
        });
    }

    private void showExpired() {
        if ("expired".equals(screen)) return;
        stopPreview();
        screen = "expired"; back = null;
        LinearLayout root = column();
        root.setGravity(Gravity.CENTER);
        android.widget.ImageView art = new android.widget.ImageView(this);
        art.setImageResource(R.drawable.expired_art);
        art.setAdjustViewBounds(true);
        art.setScaleType(android.widget.ImageView.ScaleType.FIT_CENTER);
        root.addView(art, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        TextView h = text("Your subscription has expired", 30, ACCENT, true); h.setGravity(Gravity.CENTER);
        TextView m = text("Please visit BM Support at bmsupport.uk to renew. Once renewed, open BM Player and link it again with a new code.", 18, TEXT, false); m.setGravity(Gravity.CENTER);
        root.addView(h); root.addView(m);
        Button close = button("Close", v -> {
            io.execute(() -> {
                try { Net.postJson(Net.SITE + "/api/public/player",
                        new JSONObject().put("action", "unlink").put("device_token", prefs.getString("token", "")).toString()); } catch (Exception ignored) {}
                prefs.edit().clear().apply();
                ui.post(this::finishAffinity);
            });
        });
        root.addView(close);
        setContentView(root);
        close.requestFocus();
    }

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

    private boolean isAdultCategory(String category) {
        return category != null && category.toLowerCase(java.util.Locale.UK).matches(".*(adult|xxx|18\\+|porn|for adults).*");
    }

    private boolean hideAdult(String category) {
        if (prefs.getString("pin", "").isEmpty() || adultUnlocked) return false;
        return isAdultCategory(category);
    }

    private void askPin(String title, java.util.function.Consumer<String> done) {
        android.widget.EditText e = new android.widget.EditText(this);
        e.setInputType(android.text.InputType.TYPE_CLASS_NUMBER | android.text.InputType.TYPE_NUMBER_VARIATION_PASSWORD);
        e.setHint("4 digit PIN");
        AlertDialog dlg = new AlertDialog.Builder(this).setTitle(title).setView(e)
                .setPositiveButton("OK", (d, w) -> done.accept(e.getText().toString().trim()))
                .setNegativeButton("Cancel", null).create();
        keepEntryVisible(dlg, e);
        dlg.show();

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
        AlertDialog dlg = new AlertDialog.Builder(this).setTitle("Speed test").setMessage("Testing ping…").setPositiveButton("Close", null).show();
        io.execute(() -> {
            try {
                // Ping: best of 5 small round trips
                long best = Long.MAX_VALUE;
                for (int i = 0; i < 5; i++) {
                    java.net.HttpURLConnection p = (java.net.HttpURLConnection) new java.net.URL("https://speed.cloudflare.com/__down?bytes=0&r=" + i + System.nanoTime()).openConnection();
                    p.setConnectTimeout(5000); p.setReadTimeout(5000); p.setUseCaches(false);
                    long t = System.nanoTime();
                    p.getResponseCode(); try (java.io.InputStream in = p.getInputStream()) { while (in.read() >= 0) {} }
                    long ms = (System.nanoTime() - t) / 1_000_000;
                    if (i > 0) best = Math.min(best, ms); // first call includes connection setup
                    p.disconnect();
                }
                long ping = best;
                ui.post(() -> dlg.setMessage("Ping: " + ping + " ms\n\nTesting download…"));
                java.net.HttpURLConnection c = (java.net.HttpURLConnection) new java.net.URL("https://speed.cloudflare.com/__down?bytes=50000000").openConnection();
                c.setConnectTimeout(10000); c.setReadTimeout(15000);
                long start = System.nanoTime(), bytes = 0;
                try (java.io.InputStream in = c.getInputStream()) {
                    byte[] buf = new byte[65536]; int n;
                    while ((n = in.read(buf)) > 0) { bytes += n; if (System.nanoTime() - start > 8_000_000_000L) break; }
                }
                double secs = (System.nanoTime() - start) / 1e9, mbps = bytes * 8 / secs / 1e6;
                ui.post(() -> dlg.setMessage(String.format(java.util.Locale.UK, "Ping: %d ms\nDownload: %.1f Mbps\n\nTesting upload…", ping, mbps)));
                double up;
                try {
                    java.net.HttpURLConnection u = (java.net.HttpURLConnection) new java.net.URL("https://speed.cloudflare.com/__up").openConnection();
                    u.setConnectTimeout(10000); u.setReadTimeout(20000); u.setDoOutput(true); u.setRequestMethod("POST");
                    int size = 10_000_000; u.setFixedLengthStreamingMode(size);
                    u.setRequestProperty("Content-Type", "application/octet-stream");
                    long us = System.nanoTime();
                    try (java.io.OutputStream out = u.getOutputStream()) {
                        byte[] buf = new byte[65536]; int sent = 0;
                        while (sent < size) { int k = Math.min(buf.length, size - sent); out.write(buf, 0, k); sent += k; }
                    }
                    u.getResponseCode();
                    up = size * 8 / ((System.nanoTime() - us) / 1e9) / 1e6;
                } catch (Exception ue) { up = -1; }
                double upMbps = up;
                String verdict = mbps >= 25 ? "Good for 4K." : mbps >= 10 ? "Good for HD. 4K may buffer." : "Slow – HD may buffer. Try a wired connection.";
                String upTxt = upMbps < 0 ? "couldn't test" : String.format(java.util.Locale.UK, "%.1f Mbps", upMbps);
                ui.post(() -> dlg.setMessage(String.format(java.util.Locale.UK, "Ping: %d ms\nDownload: %.1f Mbps\nUpload: %s\n\n%s", ping, mbps, upTxt, verdict)));
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
                java.io.File[] old = dir.listFiles();
                if (old != null) for (java.io.File f : old) f.delete();
                java.io.File apk = new java.io.File(dir, "BM-Player-" + System.currentTimeMillis() + ".apk");
                java.net.HttpURLConnection c = (java.net.HttpURLConnection) new java.net.URL(Net.SITE + "/api/public/player-apk?t=" + System.currentTimeMillis()).openConnection();
                c.setUseCaches(false);
                c.setRequestProperty("Cache-Control", "no-cache");
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
                if (total > 0 && done != total) throw new Exception("incomplete");
                android.content.pm.PackageInfo got = getPackageManager().getPackageArchiveInfo(apk.getAbsolutePath(), 0);
                long gotCode = got == null ? -1 : (Build.VERSION.SDK_INT >= 28 ? got.getLongVersionCode() : got.versionCode);
                long mine = Build.VERSION.SDK_INT >= 28 ? getPackageManager().getPackageInfo(getPackageName(), 0).getLongVersionCode() : getPackageManager().getPackageInfo(getPackageName(), 0).versionCode;
                if (gotCode <= mine) {
                    apk.delete();
                    ui.post(() -> { progress.dismiss(); Toast.makeText(this, "The new version isn't ready on the website yet. Try again in a few minutes.", Toast.LENGTH_LONG).show(); });
                    return;
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
        s = s.replaceAll("[^a-z0-9+]+", " ").replace("+", " plus ");
        s = s.replaceAll("([a-z])(\\d)", "$1 $2").replaceAll("(\\d)([a-z])", "$1 $2");
        s = s.replaceAll("\\b(?:uk|gb|usa|us|ire|ie|ireland|au|aus|australia|ca|canada|za|south africa|nz|int|fhd|uhd|hd|sd|4k|hevc|h265|raw|backup|vip|channel|tv)\\b", " ");
        s = s.replaceAll("\\bsports\\b", "sport").replaceAll("\\b0+(\\d)", "$1");
        s = s.replaceAll("\\bcoupang\\s+play\\b", "coupang");
        return s.replaceAll("\\s+", " ").trim();
    }
    private static final String[][] BUILT_IN_ALIASES = {
        {"sky sports pl", "sky sports premier league"}, {"sky sports me", "sky sports main event"},
        {"sky sports f1", "sky sports formula 1"}, {"bt sport 1", "tnt sports 1"}, {"bt sport 2", "tnt sports 2"},
        {"bt sport 3", "tnt sports 3"}, {"bt sport 4", "tnt sports 4"} };
    private static String alias(String n, java.util.Map<String, String> aliases) {
        String a = aliases.get(n); return a == null ? n : a;
    }
    private static java.util.Map<String, String> aliasMap(List<String[]> aliases) {
        java.util.Map<String, String> m = new java.util.HashMap<>();
        for (String[] a : aliases) { String k = normChannel(a[0]); if (!m.containsKey(k)) m.put(k, normChannel(a[1])); }
        return m;
    }
    private static int quality(String n) {
        String l = n.toLowerCase(java.util.Locale.ROOT);
        return l.contains("fhd") || l.contains("1080") ? 3 : l.matches(".*\\bhd\\b.*") ? 2 : l.contains("uhd") || l.contains("4k") ? 1 : 0;
    }
    /** Mirrors matchChannel: exact normalised (with aliases), else whole-word partial; best quality first. */
    static List<Item> matchChannel(String guide, List<Item> playlist, List<String[]> aliases) {
        java.util.Map<String, String> am = aliasMap(aliases);
        String want = alias(normChannel(guide == null ? "" : guide), am);
        List<Item> out = new ArrayList<>();
        if (want.isEmpty()) return out;
        for (Item it : playlist) if (alias(it.norm(), am).equals(want)) out.add(it);
        if (!out.isEmpty()) {
            java.util.Collections.sort(out, (x, y) -> quality(y.name) != quality(x.name) ? quality(y.name) - quality(x.name) : x.name.length() - y.name.length());
            return out;
        }
        // Every word of the guide name appears in the playlist name; fewest extra words first.
        String[] words = want.split(" ");
        final java.util.Map<Item, Integer> extra = new java.util.HashMap<>();
        for (Item it : playlist) {
            java.util.List<String> t = java.util.Arrays.asList(it.norm().split(" "));
            boolean all = true;
            for (String w : words) if (!t.contains(w)) { all = false; break; }
            if (all) { out.add(it); extra.put(it, t.size() - words.length); }
        }
        java.util.Collections.sort(out, (x, y) -> !extra.get(x).equals(extra.get(y)) ? extra.get(x) - extra.get(y)
                : quality(y.name) != quality(x.name) ? quality(y.name) - quality(x.name) : x.name.length() - y.name.length());
        return out;
    }

    private List<Item> liveChannels = null;

    /** A live channel from the provider list; tv_archive marks channels with catch up. */
    private static Item liveItem(JSONObject o) {
        Item it = new Item("live", o.optString("stream_id"), o.optString("name"), "ts", o.optString("category_id"));
        if (o.optInt("tv_archive", 0) == 1) it.archiveDays = Math.max(1, o.optInt("tv_archive_duration", 1));
        return it;
    }

    /** Xtream timeshift address: /timeshift/user/pass/minutes/YYYY-MM-DD:HH-MM/stream.ts (provider time). */
    private String catchupUrl(Item ch, long st, long en) {
        String d = prefs.getString("dns", "").replaceAll("/+$", ""), u = prefs.getString("user", ""), p = prefs.getString("pass", "");
        long mins = Math.max(1, ((en > st ? en : st + 3600) - st + 59) / 60);
        java.text.SimpleDateFormat f = new java.text.SimpleDateFormat("yyyy-MM-dd:HH-mm", java.util.Locale.UK);
        f.setTimeZone(java.util.TimeZone.getTimeZone(prefs.getString("server_tz", "Europe/London")));
        return d + "/timeshift/" + u + "/" + p + "/" + mins + "/" + f.format(new java.util.Date(st * 1000)) + "/" + ch.id + ".ts";
    }

    /** Catch up: past programmes for one channel, newest first, grouped by day; OK plays it from the start. */
    private void showCatchup(Item ch, Runnable backTo) {
        screen = "catchup"; back = backTo;
        stopPreview();
        LinearLayout root = column();
        root.addView(text("🕘 Catch up · " + ch.name, 26, TEXT, true));
        TextView status = text("Loading programmes from the last " + ch.archiveDays + (ch.archiveDays == 1 ? " day…" : " days…"), 15, MUTED, false);
        root.addView(status);
        Button retry = button("↻ Try again", v -> showCatchup(ch, backTo));
        retry.setVisibility(View.GONE);
        root.addView(retry);
        LinearLayout cols = row();
        ListView days = list(), progs = list();
        cols.addView(days, weight(1, ViewGroup.LayoutParams.MATCH_PARENT));
        cols.addView(progs, weight(2.4f, ViewGroup.LayoutParams.MATCH_PARENT));
        root.addView(cols, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        setContentView(root);
        io.execute(() -> {
            List<long[]> all = new ArrayList<>(); List<String> titles = new ArrayList<>();
            boolean failed = false;
            try {
                JSONObject response = new JSONObject(Net.get(api("get_simple_data_table") + "&stream_id=" + ch.id));
                JSONArray l = response.optJSONArray("epg_listings");
                if (l == null) throw new IllegalStateException("No programme list returned");
                long now = System.currentTimeMillis() / 1000, from = now - ch.archiveDays * 86400L;
                if (l != null) for (int i = 0; i < l.length(); i++) {
                    JSONObject e = l.optJSONObject(i);
                    if (e == null) continue;
                    String zone = prefs.getString("server_tz", "Europe/London");
                    long st = CatchupListings.time(e, false, zone), en = CatchupListings.time(e, true, zone);
                    if (!CatchupListings.available(e, st, en, now, ch.archiveDays)) continue;
                    String title = e.optString("title", "Programme");
                    try { title = new String(Base64.decode(title, Base64.DEFAULT), "UTF-8"); }
                    catch (Exception ignored) {}
                    all.add(new long[]{st, en});
                    titles.add(title);
                }
            } catch (Exception ignored) { failed = true; }
            final boolean loadFailed = failed;
            ui.post(() -> {
                if (!"catchup".equals(screen)) return;
                if (loadFailed || all.isEmpty()) {
                    status.setText(loadFailed ? "Couldn't load catch up programmes. Check your connection and try again."
                            : "No catch up programmes are available for this channel right now.");
                    retry.setVisibility(View.VISIBLE);
                    return;
                }
                Integer[] idx = new Integer[all.size()]; for (int i = 0; i < idx.length; i++) idx[i] = i;
                java.util.Arrays.sort(idx, (a, b) -> Long.compare(all.get(b)[0], all.get(a)[0]));
                java.text.SimpleDateFormat df = new java.text.SimpleDateFormat("EEE d MMM", java.util.Locale.UK);
                java.util.LinkedHashMap<String, List<Integer>> byDay = new java.util.LinkedHashMap<>();
                for (Integer i : idx) byDay.computeIfAbsent(df.format(new java.util.Date(all.get(i)[0] * 1000)), k -> new ArrayList<>()).add(i);
                List<String> dayNames = new ArrayList<>(byDay.keySet());
                status.setText("Pick a day, then a programme to watch it from the start");
                int[] chosen = {0};
                ArrayAdapter<String> dayAdapter = new ArrayAdapter<String>(this, android.R.layout.simple_list_item_1, new ArrayList<>(dayNames)) {
                    @Override public View getView(int i, View cv, ViewGroup parent) {
                        View v = styleRow(super.getView(i, cv, parent));
                        if (i == chosen[0]) {
                            GradientDrawable box = new GradientDrawable(); box.setColor(CARD); box.setCornerRadius(dp(6)); box.setStroke(dp(3), ACCENT);
                            v.setBackground(box);
                        } else v.setBackground(null);
                        return v;
                    }
                };
                days.setAdapter(dayAdapter);
                List<Integer> shown = new ArrayList<>();
                java.util.function.IntConsumer pickDay = w -> {
                    chosen[0] = w; dayAdapter.notifyDataSetChanged();
                    shown.clear(); shown.addAll(byDay.get(dayNames.get(w)));
                    List<String> rows = new ArrayList<>();
                    for (Integer i : shown) { long[] t = all.get(i); rows.add(clock(t[0]) + (t[1] > 0 ? " – " + clock(t[1]) : "") + "   " + titles.get(i)); }
                    progs.setAdapter(rowAdapter(rows));
                };
                days.setOnItemClickListener((a, v, w, id) -> { pickDay.accept(w); progs.requestFocus(); });
                days.setOnItemSelectedListener(new android.widget.AdapterView.OnItemSelectedListener() {
                    @Override public void onItemSelected(android.widget.AdapterView<?> a, View v, int w, long id) { pickDay.accept(w); }
                    @Override public void onNothingSelected(android.widget.AdapterView<?> a) {}
                });
                progs.setOnItemClickListener((a, v, w, id) -> {
                    int i = shown.get(w); long[] t = all.get(i);
                    Item c = new Item("catchup", ch.id + "@" + t[0], ch.name + " · " + titles.get(i), "ts", ch.category);
                    c.url = catchupUrl(ch, t[0], t[1]);
                    c.catchupId = ch.id; c.catchupStart = t[0]; c.catchupEnd = t[1] > t[0] ? t[1] : t[0] + 3600;
                    // Catch up recordings play through VLC automatically; BM Player's own player is the fallback when VLC is missing.
                    play(c, CatchupFallback.useVlc(Build.MANUFACTURER));
                });
                pickDay.accept(0);
                days.requestFocus();
            });
        });
    }

    // ---------- full TV guide (Sky-style grid) ----------
    private final java.util.concurrent.ExecutorService guideIo = java.util.concurrent.Executors.newFixedThreadPool(3);
    private final java.util.Map<String, List<GuideGridView.Prog>> guideCache = new java.util.LinkedHashMap<String, List<GuideGridView.Prog>>(64, 0.75f, true) {
        @Override protected boolean removeEldestEntry(java.util.Map.Entry<String, List<GuideGridView.Prog>> e) { return size() > 400; }
    };

    /** Channels down the left, time across the top; OK on a programme on now watches it, on a future one sets/removes a reminder. */
    private void showTvGuide() { showTvGuide(null); }

    /** TV guide opened on one category (Live TV's EPG button); Back returns to Live TV. */
    private void showTvGuide(String startCat) {
        screen = "tvguide"; back = startCat == null ? this::showHome : () -> browse("live");
        stopPreview();
        LinearLayout root = column();
        LinearLayout top = row();
        LinearLayout info = column();
        TextView heading = text("TV guide", 26, TEXT, true);
        TextView progTitle = text("Loading your channels…", 20, TEXT, true);
        TextView progTime = text("", 15, MUTED, false);
        TextView pvStatus = text("", 13, MUTED, false);
        info.addView(heading); info.addView(progTitle); info.addView(progTime);
        LinearLayout btns = row();
        Button catBtn = button("Category: All", v -> {});
        btns.addView(catBtn);
        btns.addView(button("Now", v -> {}));
        btns.addView(button("◀ Day", v -> {}));
        btns.addView(button("Day ▶", v -> {}));
        info.addView(btns);
        top.addView(info, weight(1.6f, ViewGroup.LayoutParams.WRAP_CONTENT));
        LinearLayout side = column();
        androidx.media3.ui.PlayerView pv = new androidx.media3.ui.PlayerView(this);
        pv.setUseController(false); pv.setBackgroundColor(Color.BLACK); pv.setFocusable(false);
        pv.setResizeMode(androidx.media3.ui.AspectRatioFrameLayout.RESIZE_MODE_FILL);
        pv.setShutterBackgroundColor(Color.BLACK);
        side.addView(pv, new LinearLayout.LayoutParams(dp(288), dp(162)));
        side.addView(pvStatus);
        top.addView(side, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        root.addView(top);
        GuideGridView grid = new GuideGridView(this);
        root.addView(grid, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        // The category list pops out from the left edge instead of a pop-up at the top.
        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setBackgroundColor(CARD);
        panel.setPadding(dp(18), dp(24), dp(18), dp(16));
        panel.addView(text("Categories", 22, TEXT, true));
        android.widget.ListView catList = new android.widget.ListView(this);
        catList.setDivider(new android.graphics.drawable.ColorDrawable(0x1FFFFFFF));
        catList.setDividerHeight(1);
        catList.setFocusable(true);
        panel.addView(catList, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        panel.addView(button("Close", v -> hidePanel()));
        setContentView(sideDrawer(root, panel));
        btns.getChildAt(1).setOnClickListener(v -> { grid.jumpNow(); grid.requestFocus(); });
        btns.getChildAt(2).setOnClickListener(v -> grid.shiftDay(-1));
        btns.getChildAt(3).setOnClickListener(v -> grid.shiftDay(1));

        final List<String[]> catRows = new ArrayList<>();
        final List<Item> shownCh = new ArrayList<>();
        final java.util.Set<String> requested = new java.util.HashSet<>();
        final int[] gen = { 0 };
        final String[] previewPending = { null };
        java.util.function.Consumer<String[]> applyCat = cat -> {
            shownCh.clear(); requested.clear(); gen[0]++;
            for (Item it : liveChannels) if (cat[0].equals("*") || cat[0].equals(it.category)) shownCh.add(it);
            catBtn.setText("Category: " + cat[1]);
            List<String> panelNames = new ArrayList<>();
            for (String[] c : catRows) panelNames.add((c[0].equals(cat[0]) ? "\u2713 " : "") + c[1]);
            catList.setAdapter(adapter(panelNames));
            List<String> names = new ArrayList<>(); List<Boolean> cu = new ArrayList<>();
            for (Item it : shownCh) { names.add(it.name); cu.add(it.archiveDays > 0); }
            grid.setChannels(names, cu);
            if (shownCh.isEmpty()) { progTitle.setText("No channels in " + cat[1]); progTime.setText(""); }
            grid.requestFocus();
        };
        catBtn.setOnClickListener(v -> {
            if (panelOpen()) { hidePanel(); return; }
            showPanel();
            catList.requestFocus();
        });
        catList.setOnItemClickListener((d, w, pos, id) -> {
            if (pos >= catRows.size()) return;
            hidePanel();
            applyCat.accept(catRows.get(pos));
        });
        grid.setListener(new GuideGridView.Listener() {
            @Override public void needEpg(int r) {
                if (r < 0 || r >= shownCh.size()) return;
                Item it = shownCh.get(r);
                List<GuideGridView.Prog> c = guideCache.get(it.id);
                if (c != null) { if (!grid.loaded(r)) grid.setProgs(r, c); return; }
                if (!requested.add(it.id)) return;
                final int g = gen[0];
                guideIo.execute(() -> {
                    List<GuideGridView.Prog> got = new ArrayList<>();
                    try {
                        JSONArray l = new JSONObject(Net.get(api("get_short_epg") + "&stream_id=" + it.id + "&limit=30")).optJSONArray("epg_listings");
                        if (l != null) for (int i = 0; i < l.length(); i++) {
                            JSONObject e = l.getJSONObject(i);
                            String t = new String(Base64.decode(e.optString("title"), Base64.DEFAULT), "UTF-8");
                            long st = e.optLong("start_timestamp", 0), en = e.optLong("stop_timestamp", 0);
                            if (st > 0) got.add(new GuideGridView.Prog(t, st, en));
                        }
                    } catch (Exception ignored) { requested.remove(it.id); }
                    ui.post(() -> {
                        guideCache.put(it.id, got);
                        if (g == gen[0] && "tvguide".equals(screen)) grid.setProgs(r, got);
                    });
                });
            }
            @Override public void onHighlight(int r, GuideGridView.Prog p) {
                if (r < 0 || r >= shownCh.size()) return;
                Item ch = shownCh.get(r);
                if (p == null) { progTitle.setText(ch.name); progTime.setText(grid.loaded(r) ? "No guide information for this time" : "Loading programmes…"); }
                else {
                    long now = System.currentTimeMillis() / 1000;
                    boolean on = p.st <= now;
                    progTitle.setText(p.title);
                    progTime.setText(ch.name + "  ·  " + clock(p.st) + (p.en > 0 ? " – " + clock(p.en) : "")
                            + (ch.archiveDays > 0 && on ? "   ·  🕘 ◀ for Catch up" : "")
                            + (on ? "   ·  On now – OK to watch" : MainActivity.this.hasReminder(ch.id, p.st) ? "   ·  ⏰ Reminder set – OK to remove" : "   ·  OK to set a reminder"));
                }
                if (previewPending[0] != null && previewPending[0].equals(ch.id)) return;
                previewPending[0] = ch.id;
                schedulePreview(ch, pv, pvStatus);
            }
            @Override public void onPick(int r, GuideGridView.Prog p) {
                if (r < 0 || r >= shownCh.size()) return;
                Item ch = shownCh.get(r);
                long now = System.currentTimeMillis() / 1000;
                if (p == null || p.st <= now) { stopPreview(); play(ch, defaultVlc()); return; }
                Runnable redraw = () -> { grid.invalidate(); onHighlight(r, p); };
                if (MainActivity.this.hasReminder(ch.id, p.st)) confirmRemoveReminder(ch, p.title, p.st, redraw);
                else confirmAddReminder(ch, p.title, p.st, redraw);

            }
            @Override public boolean hasReminder(int r, long st) { return r >= 0 && r < shownCh.size() && MainActivity.this.hasReminder(shownCh.get(r).id, st); }
            @Override public void onCatchup(int r) {
                if (r < 0 || r >= shownCh.size()) return;
                Item ch = shownCh.get(r);
                if (ch.archiveDays <= 0) { Toast.makeText(MainActivity.this, "Catch up isn't available on this channel", Toast.LENGTH_SHORT).show(); return; }
                showCatchup(ch, MainActivity.this::showTvGuide);
            }
        });
        io.execute(() -> {
            try {
                JSONArray ca = new JSONArray(cachedGet("live", "get_live_categories", ""));
                if (liveChannels == null) {
                    JSONArray a = new JSONArray(cachedGet("live", "get_live_streams", ""));
                    List<Item> l = new ArrayList<>();
                    for (int i = 0; i < a.length(); i++) { JSONObject o = a.getJSONObject(i); l.add(liveItem(o)); }
                    liveChannels = l;
                }
                List<String[]> rows = new ArrayList<>();
                rows.add(new String[]{"*", "All"});
                for (int i = 0; i < ca.length(); i++) { JSONObject o = ca.getJSONObject(i); rows.add(new String[]{o.optString("category_id"), o.optString("category_name")}); }
                ui.post(() -> {
                    if (!"tvguide".equals(screen)) return;
                    catRows.clear(); catRows.addAll(rows);
                    String[] start = rows.get(0);
                    if (startCat != null) for (String[] r : rows) if (r[0].equals(startCat)) { start = r; break; }
                    applyCat.accept(start);
                });
            } catch (Exception ex) { ui.post(() -> progTitle.setText("Couldn't load your channels – check your login in Settings")); }
        });
    }

    private ArrayAdapter<String> rowAdapter(List<String> rows) {
        return new ArrayAdapter<String>(this, android.R.layout.simple_list_item_1, new ArrayList<>(rows)) {
            @Override public View getView(int i, View cv, ViewGroup parent) { View v = styleRow(super.getView(i, cv, parent)); if (v instanceof TextView) { ((TextView) v).setSingleLine(false); } return v; }
        };
    }

    private void showSports() {
        screen = "sports"; sportsPath.clear();
        back = () -> { if (!sportsPath.isEmpty()) { sportsUp(); return; } stopSports(); retryEvent = null; showHome(); };
        stopPreview();
        LinearLayout root = column();
        LinearLayout head = row();
        head.setGravity(Gravity.CENTER_VERTICAL);
        head.addView(text("Sports guide", 26, TEXT, true), weight(1, ViewGroup.LayoutParams.WRAP_CONTENT));
        TextView status = text("Loading…", 14, MUTED, false);
        head.addView(status);
        head.addView(button("🎤 Voice search", v -> startVoice("sports")));
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
    private String pendingSportsQuery;

    /** Entering the sports guide: browse the categories by hand or say an event / team name. */
    private void askSportsMode() {
        new AlertDialog.Builder(this).setTitle("Sports guide")
                .setMessage("How would you like to find an event?")
                .setPositiveButton("📂 Search manually", (d, w) -> showSports())
                .setNegativeButton("🎤 Voice search", (d, w) -> { showSports(); startVoice("sports"); })
                .setNeutralButton("Cancel", null).show();
    }

    /** Voice result: events whose name, team, guide or sport contains every spoken word. */
    private void sportsVoice(String spoken) {
        JSONObject r = sportsData;
        if (r == null) { pendingSportsQuery = spoken; Toast.makeText(this, "Loading the sports guide…", Toast.LENGTH_SHORT).show(); return; }
        String want = normChannel(spoken).replaceAll("\\b(?:v|vs|versus|and|the|fc|afc|match|game|on|watch)\\b", " ").replaceAll("\\s+", " ").trim();
        List<String[]> aliases = new ArrayList<>();
        JSONArray al = r.optJSONArray("aliases");
        if (al != null) for (int i = 0; i < al.length(); i++) { JSONObject o = al.optJSONObject(i); if (o != null) aliases.add(new String[]{o.optString("from"), o.optString("to")}); }
        for (String[] x : BUILT_IN_ALIASES) aliases.add(x);
        List<JSONObject> hits = new ArrayList<>();
        JSONArray ev = r.optJSONArray("events");
        if (!want.isEmpty() && ev != null) {
            String[] words = want.split(" ");
            for (int i = 0; i < ev.length() && hits.size() < 60; i++) {
                JSONObject e = ev.optJSONObject(i); if (e == null) continue;
                String hay = " " + normChannel(e.optString("title") + " " + e.optString("competition") + " " + e.optString("subcategory") + " " + e.optString("sport") + " " + sportsChannelText(e)) + " ";
                hay = hay + expandTeamNicknames(hay);
                int found = 0;
                for (String w : words) if (hay.contains(" " + w)) found++;
                // Every word for short searches; longer spoken searches may miss one word ("the Chelsea game tonight").
                if (found == words.length || (words.length >= 3 && found >= words.length - 1)) hits.add(e);
            }
        }
        if (hits.isEmpty()) {
            new AlertDialog.Builder(this).setTitle("Nothing found for \"" + spoken + "\"")
                    .setMessage("Try saying a team or event name again, or browse the categories.")
                    .setPositiveButton("🎤 Try again", (d, w) -> startVoice("sports"))
                    .setNegativeButton("Browse", null).show();
            return;
        }
        java.text.SimpleDateFormat day = new java.text.SimpleDateFormat("EEE d MMM", java.util.Locale.UK);
        day.setTimeZone(java.util.TimeZone.getTimeZone("Europe/London"));
        long now = System.currentTimeMillis();
        String[] labels = new String[hits.size()];
        for (int i = 0; i < labels.length; i++) {
            JSONObject e = hits.get(i); long st = e.optLong("start");
            labels[i] = (st <= now ? "🔴 LIVE NOW  " : day.format(new java.util.Date(st)) + "  " + clock(st / 1000) + "  ") + e.optString("title") + "\n      " + e.optString("competition")
                    + (sportsChannelText(e).isEmpty() ? "" : "\n      📺 " + sportsChannelText(e).trim().replace("  ", ", "));
        }
        resultList(hits.size() + (hits.size() == 1 ? " event" : " events") + " for \"" + spoken + "\"", hits.size(),
                i -> text(labels[i], 16, TEXT, false), i -> pickSportsChannel(hits.get(i), aliases, false),
                "🎤 Search again", () -> startVoice("sports"), "Browse", null);
    }
    /** The event's TV channels, two spaces apart (shown in search results and searched too). */
    private static String sportsChannelText(JSONObject e) {
        JSONArray ch = e.optJSONArray("channels"); if (ch == null) return "";
        StringBuilder b = new StringBuilder();
        for (int i = 0; i < ch.length(); i++) { String c = ch.optString(i, "").trim(); if (!c.isEmpty()) b.append(b.length() > 0 ? "  " : "").append(c); }
        return b.toString();
    }
    /** Short names people say for clubs, so "man utd" or "spurs" still finds the fixture. */
    private static final String[][] TEAM_NICKNAMES = {
            {"manchester united", "man utd united man u"}, {"manchester city", "man city city"}, {"tottenham", "spurs"},
            {"wolverhampton", "wolves"}, {"newcastle", "toon magpies"}, {"middlesbrough", "boro"}, {"arsenal", "gunners"},
            {"west ham", "hammers"}, {"nottingham forest", "forest"}, {"brighton", "seagulls"}, {"sheffield wednesday", "wednesday owls"},
            {"sheffield united", "blades"}, {"queens park rangers", "qpr"}, {"west bromwich", "west brom baggies"}, {"paris saint germain", "psg"},
            {"bayern", "bayern munich"}, {"inter milan", "inter"}, {"internazionale", "inter"}, {"atletico", "atleti"}};
    private static String expandTeamNicknames(String hay) {
        StringBuilder b = new StringBuilder(" ");
        for (String[] n : TEAM_NICKNAMES) if (hay.contains(" " + n[0])) b.append(n[1]).append(' ');
        return b.toString();
    }
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
                        l.add(liveItem(o));
                    }
                    liveChannels = l;
                }
                String v = r.optString("version");
                ui.post(() -> {
                    if (!"sports".equals(screen)) return;
                    status.setText("Updated " + clock(System.currentTimeMillis() / 1000) + "  ");
                    if (manual || !v.equals(sportsVersion)) renderSports(r);
                    if (pendingSportsQuery != null) { String q = pendingSportsQuery; pendingSportsQuery = null; sportsVoice(q); }
                });
            } catch (Exception e) {
                ui.post(() -> status.setText(manual ? "Couldn't update – check the connection  " : status.getText()));
            }
        });
    }
    private String cachedGetFresh() throws Exception { clearCache("live"); return cachedGet("live", "get_live_streams", ""); }

    private JSONObject sportsData; private final List<String> sportsPath = new ArrayList<>();
    private static List<String> eventPath(JSONObject e) {
        List<String> p = new ArrayList<>();
        String sp = e.optString("sport"), sub = e.optString("subcategory", ""), g = e.optString("competition", sp);
        p.add(sp); if (!sub.isEmpty()) p.add(sub); if (!g.isEmpty()) p.add(g);
        return p;
    }

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
            List<String> path = eventPath(e);
            int d = sportsPath.size();
            if (path.size() < d || !path.subList(0, d).equals(sportsPath)) continue;
            if (path.size() == d) { events.add(e); continue; }
            String key = path.get(d);
            groups.put(key, groups.containsKey(key) ? groups.get(key) + 1 : 1);
            if (e.optLong("start") <= now) liveGroups.add(key);
        }
        List<String> rows = new ArrayList<>();
        final List<Object> targets = new ArrayList<>();
        if (!sportsPath.isEmpty()) { rows.add("◀ Back"); targets.add("<back>"); }
        if (events.isEmpty()) {
            // Categories follow the website's own order; anything unknown keeps its place after them.
            final List<String> siteOrder = new ArrayList<>();
            JSONArray so = r.optJSONArray("order");
            if (so != null) for (int i = 0; i < so.length(); i++) siteOrder.add(so.optString(i));
            List<java.util.Map.Entry<String, Integer>> sortedGroups = new ArrayList<>(groups.entrySet());
            java.util.Collections.sort(sortedGroups, (a, b) -> {
                int x = siteOrder.indexOf(a.getKey()), y = siteOrder.indexOf(b.getKey());
                return Integer.compare(x < 0 ? Integer.MAX_VALUE : x, y < 0 ? Integer.MAX_VALUE : y);
            });
            for (java.util.Map.Entry<String, Integer> g : sortedGroups) {
                rows.add((liveGroups.contains(g.getKey()) ? "🔴 " : "") + g.getKey() + "   (" + g.getValue() + (g.getValue() == 1 ? " event)" : " events)") + "  ›");
                targets.add(g.getKey());
            }
        } else for (JSONObject e : events) {
            long start = e.optLong("start");
            JSONArray ch = e.optJSONArray("channels");
            int n = ch == null ? 0 : ch.length();
            rows.add((start <= now ? "🔴 LIVE NOW  " : day.format(new java.util.Date(start)) + "  " + clock(start / 1000) + "  ") + e.optString("title")
                    + "\n      📺 " + n + (n == 1 ? " channel" : " channels") + " – press OK to pick one" + "\n");
            targets.add(e);
        }
        if (targets.isEmpty() || (targets.size() == 1 && !sportsPath.isEmpty())) { rows.add("No upcoming events here right now"); targets.add(null); }
        if (sportsHeading != null) sportsHeading.setText(sportsPath.isEmpty() ? "Pick a sport" : String.join(" › ", sportsPath) + (events.isEmpty() ? (sportsPath.size() == 1 ? " › pick a category" : " › pick a guide") : " › pick an event"));
        int keep = sportsList.getSelectedItemPosition();
        sportsList.setAdapter(adapter(rows));
        if (keep > 0 && keep < rows.size()) sportsList.setSelection(keep);
        sportsList.requestFocus();
        sportsList.setOnItemClickListener((p, v, pos, id) -> {
            Object t = targets.get(pos);
            if (t == null) return;
            if ("<back>".equals(t)) { sportsUp(); return; }
            if (t instanceof String) { sportsPath.add((String) t); renderSports(sportsData); sportsList.setSelection(0); return; }
            pickSportsChannel((JSONObject) t, aliases, false);
        });
    }
    private TextView sportsHeading;
    private void sportsUp() {
        if (!sportsPath.isEmpty()) sportsPath.remove(sportsPath.size() - 1);
        if (sportsData != null) renderSports(sportsData);
    }

    private JSONObject retryEvent; private List<String[]> retryAliases;

    private String drawnVersion;

    /** Redraws Home/Settings when the installed version differs from what is on screen (e.g. after an update). */
    private void refreshVersionScreens() {
        if (drawnVersion == null || drawnVersion.equals(appVersion())) return;
        if ("home".equals(screen)) showHome(); else if ("settings".equals(screen)) showSettings();
    }

    private static int deviceOffsetMins() {
        return java.util.TimeZone.getDefault().getOffset(System.currentTimeMillis()) / 60000;
    }

    /** Clock change: a manual guide shift was set for the old summer/winter time, so clear it. */
    private void resetShiftAfterClockChange() {
        int shift = prefs.getInt("epg_shift", 0);
        if (shift == 0) return;
        int now = deviceOffsetMins();
        if (!prefs.contains("epg_shift_offset")) { prefs.edit().putInt("epg_shift_offset", now).apply(); return; }
        if (prefs.getInt("epg_shift_offset", now) != now) {
            prefs.edit().putInt("epg_shift", 0).putInt("epg_shift_offset", now).apply();
            Toast.makeText(this, "The clocks changed, so the TV guide time shift was reset to 0", Toast.LENGTH_LONG).show();
        }
    }

    @Override protected void onResume() {
        resetShiftAfterClockChange();
        super.onResume();
        clearNowPlaying();
        refreshVersionScreens();
        if (watchedAdapter != null) watchedAdapter.notifyDataSetChanged();
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
                    for (int i = 0; i < a.length(); i++) { JSONObject o = a.getJSONObject(i); l.add(liveItem(o)); }
                    liveChannels = l;
                    ui.post(() -> pickSportsChannel(e, aliases, retry));
                } catch (Exception ex) { ui.post(() -> Toast.makeText(this, "Couldn't load your channels – check your login in Settings", Toast.LENGTH_LONG).show()); }
            });
            return;
        }
        JSONArray ch = e.optJSONArray("channels");
        Toast.makeText(this, "Finding channels…", Toast.LENGTH_SHORT).show();
        List<Item> pl = liveChannels;
        io.execute(() -> {
            List<String> labels = new ArrayList<>();
            List<Item> targets = new ArrayList<>();
            try {
                java.util.Set<String> seen = new java.util.HashSet<>();
                String where = (e.optString("sport") + " " + e.optString("subcategory") + " " + e.optString("competition")).toLowerCase(java.util.Locale.ROOT);
                if (where.contains("ifollow") || where.contains("scot")) {
                    for (String team : e.optString("title").split("\\s+(?:v|vs|vs\\.|v\\.)\\s+|\\s+-\\s+")) {
                        List<Item> m = teamChannels(team, pl);
                        if (team.trim().isEmpty()) continue;
                        labels.add("━━  " + team.trim() + "  ━━"); targets.add(null);
                        if (m.isEmpty()) { labels.add("      ✕ No " + team.trim() + " channel in your list"); targets.add(null); }
                        for (Item it : m) { labels.add("      ▶ Watch " + it.name); targets.add(it); seen.add(it.id); }
                    }
                    if (ch != null && ch.length() > 0) { labels.add("━━  Other channels  ━━"); targets.add(null); }
                }
                if (ch != null) for (int j = 0; j < ch.length(); j++) {
                    String g = ch.optString(j);
                    List<Item> m = matchChannel(g, pl, aliases);
                    if (m.isEmpty()) { labels.add("✕ " + g + "  —  not in your list"); targets.add(null); }
                    for (Item it : m) if (seen.add(it.id)) { labels.add("▶ Watch " + it.name + "   (" + g + ")"); targets.add(it); }
                }
            } catch (Exception ex) { labels.clear(); targets.clear(); }
            ui.post(() -> { try { showSportsChannels(e, aliases, retry, ch, labels, targets); }
                catch (Exception ex) { Toast.makeText(this, "Couldn't open the channel list", Toast.LENGTH_LONG).show(); } });
        });
    }

    /** Club channels for one team (iFollow / Scottish club feeds): every word of the team name, iFollow-style first. */
    static List<Item> teamChannels(String team, List<Item> playlist) {
        String want = normChannel(team).replaceAll("\\b(?:fc|afc|the)\\b", " ").replaceAll("\\s+", " ").trim();
        List<Item> out = new ArrayList<>();
        if (want.length() < 3) return out;
        String[] words = want.split(" ");
        for (Item it : playlist) {
            java.util.List<String> t = java.util.Arrays.asList(it.norm().split(" "));
            boolean all = true;
            for (String w : words) if (!t.contains(w)) { all = false; break; }
            if (all) out.add(it);
            if (out.size() >= 15) break;
        }
        java.util.Collections.sort(out, (x, y) -> {
            int a = x.name.toLowerCase().contains("follow") ? 0 : 1, b = y.name.toLowerCase().contains("follow") ? 0 : 1;
            return a != b ? a - b : x.name.length() - y.name.length();
        });
        return out;
    }

    private void showSportsChannels(JSONObject e, List<String[]> aliases, boolean retry, JSONArray ch, List<String> labels, List<Item> targets) {
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
            if (it == null && labels.get(w).startsWith("━━")) return;
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
        List<String> keep = new ArrayList<>(sportsPath);
        showSports();
        sportsPath.addAll(keep);
        if (sportsData != null) renderSports(sportsData);
    }

    private void searchChannels(JSONObject e, List<String[]> aliases, String start) {
        android.widget.EditText q = new android.widget.EditText(this);
        q.setSingleLine(true); q.setText(start); q.setSelectAllOnFocus(true);
        AlertDialog dlg = new AlertDialog.Builder(this).setTitle("Search channels").setView(q)
                .setPositiveButton("Search", (d, w) -> {
                    String want = normChannel(q.getText().toString());
                    List<Item> hits = new ArrayList<>();
                    if (!want.isEmpty() && liveChannels != null) for (Item it : liveChannels) {
                        if (it.norm().contains(want)) hits.add(it);
                        if (hits.size() >= 60) break;
                    }
                    if (hits.isEmpty()) { Toast.makeText(this, "No channels found", Toast.LENGTH_SHORT).show(); searchChannels(e, aliases, q.getText().toString()); return; }
                    String[] names = new String[hits.size()];
                    for (int i = 0; i < names.length; i++) names[i] = "▶ " + hits.get(i).name;
                    new AlertDialog.Builder(this).setTitle(hits.size() + " channels")
                            .setItems(names, (d2, i) -> { retryEvent = e; retryAliases = aliases; play(hits.get(i), defaultVlc()); })
                            .setNegativeButton("Back", (d2, i) -> pickSportsChannel(e, aliases, false)).show();
                })
                .setNegativeButton("Back", (d, w) -> pickSportsChannel(e, aliases, false)).create();
        keepEntryVisible(dlg, q);
        dlg.show();

    }

    private int dp(int v) { return Math.round(v * getResources().getDisplayMetrics().density); }

    // ---------- side panel: pops out from the left edge of the screen ----------
    private FrameLayout drawerWrap;
    private View drawerScrim;
    private LinearLayout drawerPanel;
    private boolean drawerShown;

    /** Puts a screen in a frame with a panel that slides in from the left edge, hidden to start. */
    private FrameLayout sideDrawer(LinearLayout content, LinearLayout panel) {
        int w = dp(300);
        FrameLayout frame = new FrameLayout(this);
        frame.setBackgroundColor(BG);
        drawerWrap = new FrameLayout(this);
        drawerWrap.addView(content, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        frame.addView(drawerWrap, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        drawerScrim = new View(this);
        drawerScrim.setBackgroundColor(0x99000000);
        drawerScrim.setClickable(true);
        drawerScrim.setOnClickListener(v -> hidePanel());
        drawerScrim.setVisibility(View.INVISIBLE);
        frame.addView(drawerScrim, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        drawerPanel = panel;
        panel.setVisibility(View.INVISIBLE);
        panel.setTranslationX(-w);
        frame.addView(panel, new FrameLayout.LayoutParams(w, ViewGroup.LayoutParams.MATCH_PARENT));
        drawerShown = false;
        return frame;
    }

    /** Slides the panel in from the left and stops the screen behind it taking focus. */
    private void showPanel() {
        if (drawerPanel == null || drawerShown) return;
        drawerShown = true;
        drawerPanel.setVisibility(View.VISIBLE);
        drawerPanel.setTranslationX(-dp(300));
        drawerPanel.animate().translationX(0f).setDuration(220).start();
        if (drawerScrim != null) {
            drawerScrim.setVisibility(View.VISIBLE);
            drawerScrim.setAlpha(0f);
            drawerScrim.animate().alpha(1f).setDuration(200).start();
        }
        if (drawerWrap != null) drawerWrap.setDescendantFocusability(ViewGroup.FOCUS_BLOCK_DESCENDANTS);
    }

    /** Slides the panel back out to the left and gives focus back to the screen behind it. */
    private void hidePanel() {
        if (drawerPanel == null || !drawerShown) return;
        drawerShown = false;
        int w = dp(300);
        if (drawerScrim != null) drawerScrim.animate().alpha(0f).setDuration(180)
                .withEndAction(() -> drawerScrim.setVisibility(View.INVISIBLE)).start();
        if (drawerWrap != null) drawerWrap.setDescendantFocusability(ViewGroup.FOCUS_BEFORE_DESCENDANTS);
        drawerPanel.animate().translationX(-w).setDuration(180)
                .withEndAction(() -> drawerPanel.setVisibility(View.INVISIBLE)).start();
    }

    /** True only while the panel is on the current screen (a replaced screen detaches it). */
    private boolean panelOpen() {
        return drawerShown && drawerPanel != null && drawerPanel.getParent() != null
                && drawerPanel.getVisibility() == View.VISIBLE;
    }

    private LinearLayout column() {
        LinearLayout l = new LinearLayout(this);
        l.setOrientation(LinearLayout.VERTICAL);
        l.setBackgroundColor(BG);
        l.setPadding(dp(32), dp(24), dp(32), dp(24));
        return l;
    }

    /** Front screen backdrop: the family-watching-TV illustration, dimmed so text stays readable. */
    private FrameLayout withHomeBackground(LinearLayout content) {
        FrameLayout frame = new FrameLayout(this);
        frame.setBackgroundColor(BG);
        ImageView bg = new ImageView(this);
        bg.setImageResource(R.drawable.home_background);
        bg.setScaleType(ImageView.ScaleType.CENTER_CROP);
        frame.addView(bg, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        View scrim = new View(this);
        scrim.setBackground(new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,
                new int[]{0xE60B1220, 0x8C0B1220, 0xE60B1220}));
        frame.addView(scrim, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        content.setBackgroundColor(Color.TRANSPARENT);
        android.widget.ScrollView sc = new android.widget.ScrollView(this);
        sc.setFillViewport(true);
        sc.addView(content, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        frame.addView(sc, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        return frame;
    }

    /** Fixed-content screens scroll when a short phone screen can't fit them. */
    private android.widget.ScrollView scrollable(LinearLayout content) {
        android.widget.ScrollView sc = new android.widget.ScrollView(this);
        sc.setFillViewport(true);
        sc.setBackgroundColor(BG);
        sc.addView(content, new android.widget.ScrollView.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        return sc;
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
        // Every button keeps a gap around it, so pills in a row never sit flush together.
        LinearLayout.LayoutParams gap = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        gap.setMargins(dp(6), dp(4), dp(6), dp(4));
        b.setLayoutParams(gap);
        return b;
    }

    /**
     * Header search pill: wrap-sized with a clear gap on each side, so the three search pills
     * never sit flush against one another.
     */
    private Button headerPill(String label, View.OnClickListener l) {
        Button b = button(label, l);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.setMargins(dp(12), 0, dp(12), 0);
        b.setLayoutParams(lp);
        return b;
    }

    /**
     * Home-row button: the label always stays on one line. Tighter side padding plus text that
     * shrinks (16sp down to 10sp) means a long name like "Recently watched" never wraps onto a
     * second line while its neighbours sit on one.
     */
    private Button smallButton(String label, View.OnClickListener l) {
        Button b = button(label, l);
        b.setPadding(dp(8), dp(12), dp(8), dp(12));
        b.setSingleLine(true);
        b.setEllipsize(null);
        androidx.core.widget.TextViewCompat.setAutoSizeTextTypeUniformWithConfiguration(b,
                dp(10), dp(16), dp(1), android.util.TypedValue.COMPLEX_UNIT_PX);
        return b;
    }

    /**
     * Width share for a home-row button: each one gets room in proportion to how wide its label
     * actually is, so the long ones are not squeezed into the same box as "Settings".
     */
    private LinearLayout.LayoutParams smallWeight(String label) {
        android.graphics.Paint p = new android.graphics.Paint();
        p.setTextSize(16 * getResources().getDisplayMetrics().scaledDensity);
        LinearLayout.LayoutParams lp = weight(Math.max(1f, p.measureText(label)), ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.setMargins(dp(4), dp(6), dp(4), dp(6));
        return lp;
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

    static void sortItems(List<Item> l, String key) {
        java.util.Comparator<Item> c;
        switch (key) {
            case "added": c = (a, b) -> Long.compare(b.added, a.added); break;
            case "az": c = (a, b) -> a.name.compareToIgnoreCase(b.name); break;
            case "za": c = (a, b) -> b.name.compareToIgnoreCase(a.name); break;
            case "rating": c = (a, b) -> Double.compare(b.rating, a.rating); break;
            default: c = (a, b) -> Integer.compare(a.pos, b.pos);
        }
        java.util.Collections.sort(l, c);
    }

    private android.widget.GridView posterGrid() {
        android.widget.GridView g = new android.widget.GridView(this);
        g.setBackgroundColor(CARD);
        // Nothing is drawn over the posters: the selected card paints its own ring around the picture.
        g.setSelector(new android.graphics.drawable.ColorDrawable(Color.TRANSPARENT));
        g.setColumnWidth(dp(130));
        g.setNumColumns(android.widget.GridView.AUTO_FIT);
        g.setStretchMode(android.widget.GridView.STRETCH_COLUMN_WIDTH);
        g.setHorizontalSpacing(dp(8)); g.setVerticalSpacing(dp(10));
        g.setPadding(dp(8), dp(8), dp(8), dp(8));
        g.setDrawSelectorOnTop(false);
        return g;
    }

    private final android.util.LruCache<String, android.graphics.Bitmap> posterCache = new android.util.LruCache<String, android.graphics.Bitmap>(24 * 1024 * 1024) {
        @Override protected int sizeOf(String k, android.graphics.Bitmap b) { return b.getByteCount(); }
    };
    private final java.util.concurrent.ExecutorService posterIo = java.util.concurrent.Executors.newFixedThreadPool(4);

    private BaseAdapter posterAdapter(List<Item> l) {
        ratingAdapter = new BaseAdapter() {
            @Override public int getCount() { return l.size(); }
            @Override public Object getItem(int i) { return l.get(i); }
            @Override public long getItemId(int i) { return i; }
            @Override public View getView(int i, View cv, ViewGroup parent) {
                LinearLayout card; android.widget.ImageView img; TextView t;
                if (cv == null) {
                    card = column(); card.setPadding(dp(5), dp(5), dp(5), dp(5));
                    card.setBackground(posterCardBg());
                    card.setDuplicateParentStateEnabled(false);
                    img = new android.widget.ImageView(MainActivity.this);
                    img.setScaleType(android.widget.ImageView.ScaleType.CENTER_CROP);
                    img.setBackgroundColor(Color.rgb(20, 28, 48));
                    card.addView(img, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(180)));
                    t = text("", 13, TEXT, false); t.setMaxLines(2); t.setGravity(Gravity.CENTER);
                    card.addView(t);
                    LinearLayout progress = new LinearLayout(MainActivity.this);
                    progress.setOrientation(LinearLayout.VERTICAL);
                    card.addView(progress);
                    card.setTag(new Object[]{img, t, progress});
                } else { card = (LinearLayout) cv; Object[] h = (Object[]) card.getTag(); img = (android.widget.ImageView) h[0]; t = (TextView) h[1]; }
                Item it = l.get(i);
                LinearLayout progress = (LinearLayout) ((Object[]) card.getTag())[2];
                progress.removeAllViews();
                // Series progress belongs on each episode, not the show's poster.
                if (!"series".equals(it.kind)) progress.addView(watchedBar(it));
                t.setMaxLines(2); t.setText(it.name);
                progress.addView(text(ratingText(it), 12, MUTED, false)); requestRating(it);
                loadPoster(img, it.poster);
                return card;
            }
        };
        return ratingAdapter;
    }

    private StateListDrawable posterCardBg() {
        GradientDrawable on = new GradientDrawable(); on.setColor(BG); on.setCornerRadius(dp(8)); on.setStroke(dp(4), ACCENT);
        GradientDrawable off = new GradientDrawable(); off.setColor(BG); off.setCornerRadius(dp(8));
        StateListDrawable st = new StateListDrawable();
        st.addState(new int[]{android.R.attr.state_selected}, on);
        st.addState(new int[]{android.R.attr.state_focused}, on);
        st.addState(new int[]{android.R.attr.state_pressed}, on);
        st.addState(new int[]{}, off);
        return st;
    }

    /** Waiting picture views per poster address, so one address is only downloaded once at a time. */
    private final java.util.Map<String, List<android.widget.ImageView>> posterWaiting = new java.util.HashMap<>();
    private final java.util.Map<String, Long> posterFailed = new java.util.HashMap<>();

    private java.io.File posterFile(String url) {
        java.io.File d = new java.io.File(getCacheDir(), "posters");
        d.mkdirs();
        return new java.io.File(d, Integer.toHexString(url.hashCode()) + "_" + url.length() + ".img");
    }

    private void loadPoster(android.widget.ImageView img, String url) {
        if (url == null || url.isEmpty() || !url.startsWith("http")) { img.setTag(null); img.setImageDrawable(null); return; }
        // Same poster already on screen (the grid redraws a card when it is highlighted) – leave it alone.
        if (url.equals(img.getTag()) && img.getDrawable() != null) return;
        img.setTag(url);
        android.graphics.Bitmap c = posterCache.get(url);
        if (c != null) { img.setImageBitmap(c); return; }
        img.setImageDrawable(null);
        Long failed = posterFailed.get(url);
        if (failed != null && System.currentTimeMillis() - failed < 60_000) return;
        List<android.widget.ImageView> waiting = posterWaiting.get(url);
        if (waiting != null) { if (!waiting.contains(img)) waiting.add(img); return; }
        waiting = new ArrayList<>(); waiting.add(img);
        posterWaiting.put(url, waiting);
        final int target = dp(180);
        posterIo.execute(() -> {
            android.graphics.Bitmap b = null;
            try {
                java.io.File f = posterFile(url);
                byte[] data = null;
                if (f.exists() && f.length() > 0) {
                    try (java.io.FileInputStream in = new java.io.FileInputStream(f); java.io.ByteArrayOutputStream bo = new java.io.ByteArrayOutputStream()) {
                        byte[] buf = new byte[16384]; int n; while ((n = in.read(buf)) > 0) bo.write(buf, 0, n); data = bo.toByteArray();
                    } catch (Exception ignored) { data = null; }
                }
                if (data == null) {
                    java.net.HttpURLConnection h = (java.net.HttpURLConnection) new java.net.URL(url).openConnection();
                    h.setConnectTimeout(8000); h.setReadTimeout(10000); h.setInstanceFollowRedirects(true);
                    h.setRequestProperty("User-Agent", "VLC/3.0.20 LibVLC/3.0.20");
                    try (java.io.InputStream in = h.getInputStream(); java.io.ByteArrayOutputStream bo = new java.io.ByteArrayOutputStream()) {
                        byte[] buf = new byte[16384]; int n; while ((n = in.read(buf)) > 0) bo.write(buf, 0, n); data = bo.toByteArray();
                    }
                }
                android.graphics.BitmapFactory.Options o = new android.graphics.BitmapFactory.Options();
                o.inJustDecodeBounds = true; android.graphics.BitmapFactory.decodeByteArray(data, 0, data.length, o);
                int s = 1; while (o.outHeight / (s * 2) >= target) s *= 2;
                o = new android.graphics.BitmapFactory.Options(); o.inSampleSize = s; o.inPreferredConfig = android.graphics.Bitmap.Config.RGB_565;
                b = android.graphics.BitmapFactory.decodeByteArray(data, 0, data.length, o);
                if (b != null && !(f.exists() && f.length() > 0)) {
                    try (java.io.FileOutputStream out = new java.io.FileOutputStream(f)) { out.write(data); } catch (Exception ignored) {}
                }
            } catch (Exception ignored) {}
            final android.graphics.Bitmap done = b;
            ui.post(() -> {
                List<android.widget.ImageView> views = posterWaiting.remove(url);
                if (done == null) { posterFailed.put(url, System.currentTimeMillis()); return; }
                posterFailed.remove(url);
                posterCache.put(url, done);
                if (views != null) for (android.widget.ImageView v : views) if (url.equals(v.getTag())) v.setImageBitmap(done);
            });
        });
    }

    /**
     * Search/voice results: a real list that moves one row per remote press, draws a border on the
     * highlighted row and opens it with OK (or a tap).
     */
    private AlertDialog resultList(String title, int count, java.util.function.IntFunction<View> row, java.util.function.IntConsumer pick,
                                   String posLabel, Runnable pos, String negLabel, Runnable neg) {
        ListView lv = list();
        GradientDrawable ring = new GradientDrawable(); ring.setColor(Color.TRANSPARENT); ring.setCornerRadius(dp(8)); ring.setStroke(dp(3), ACCENT);
        StateListDrawable sel = new StateListDrawable();
        sel.addState(new int[]{android.R.attr.state_focused}, ring);
        sel.addState(new int[]{android.R.attr.state_pressed}, ring);
        sel.addState(new int[]{android.R.attr.state_selected}, ring);
        sel.addState(new int[]{}, new android.graphics.drawable.ColorDrawable(Color.TRANSPARENT));
        lv.setSelector(sel);
        lv.setDrawSelectorOnTop(true);
        lv.setItemsCanFocus(false);
        lv.setFocusable(true);
        lv.setDividerHeight(0);
        lv.setAdapter(new BaseAdapter() {
            @Override public int getCount() { return count; }
            @Override public Object getItem(int i) { return i; }
            @Override public long getItemId(int i) { return i; }
            @Override public View getView(int i, View cv, ViewGroup parent) {
                View v = row.apply(i);
                v.setPadding(dp(14), dp(12), dp(14), dp(12));
                v.setFocusable(false); v.setClickable(false);
                return v;
            }
        });
        AlertDialog.Builder b = new AlertDialog.Builder(this).setTitle(title).setView(lv);
        if (posLabel != null) b.setPositiveButton(posLabel, (d, w) -> { if (pos != null) pos.run(); });
        if (negLabel != null) b.setNegativeButton(negLabel, (d, w) -> { if (neg != null) neg.run(); });
        AlertDialog dlg = b.create();
        lv.setOnItemClickListener((p, v, i, id) -> { dlg.dismiss(); pick.accept(i); });
        dlg.setOnShowListener(d -> { lv.requestFocus(); lv.setSelection(0); });
        dlg.show();
        return dlg;
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
