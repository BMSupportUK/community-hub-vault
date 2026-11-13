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
import android.view.WindowManager;
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
    /** True once the account number has been accepted this run; the members-only 📣 icon waits for it. */
    static boolean isUnlocked() { return unlocked; }
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
        return n == 0 ? "BM ☆ Not rated" : String.format(java.util.Locale.UK, "BM ★ %.1f · %d vote%s", r.optDouble("average"), n, n == 1 ? "" : "s");
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
        String epNum = "", epTitle = "";
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
        StreamClaim.host = this;
        StreamClaim.onMainTaken = () -> {
            stopPreview(); stopMulti();
            if (!isFinishing()) new AlertDialog.Builder(this).setTitle("Playback moved")
                    .setMessage("Another device on your login chose to watch, so it stopped here.").setPositiveButton("OK", null).show();
        };
        PlayerActivity.loadHeavy(this);
        prefs = getSharedPreferences("bmplayer", MODE_PRIVATE);
        if (Build.VERSION.SDK_INT >= 33) getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::goBack);
        start();
        sendLastCrash();
        startReminderCheck();
        handleReminderIntent(getIntent()); handleWatchIntent(getIntent());
    }

    // ---------- multi-screen (Multi Room = 2, Triple Room = 3) ----------
    private final List<androidx.media3.exoplayer.ExoPlayer> multiPlayers = new ArrayList<>();
    private final java.util.Set<Integer> multiPicked = new java.util.HashSet<>();
    // Channel on each multi-screen pane, so the website lists every screen's channel, not just one.
    private final String[] multiNames = new String[3];
    private void stopMulti() {
        multiPicked.clear();
        boolean had = false;
        for (int i = 0; i < multiNames.length; i++) { if (multiNames[i] != null) had = true; multiNames[i] = null; }
        if (had) clearNowPlaying();
        for (androidx.media3.exoplayer.ExoPlayer p : multiPlayers) p.release();
        multiPlayers.clear();
        updateKeepScreenOn();
    }

    /** Something playing in this screen (preview box or a multi-screen pane) keeps the phone screen awake. */
    void updateKeepScreenOn() {
        boolean playing = previewPlaying;
        for (androidx.media3.exoplayer.ExoPlayer p : multiPlayers) {
            if (p.getPlaybackState() == androidx.media3.common.Player.STATE_READY && p.getPlayWhenReady()) { playing = true; break; }
        }
        if (playing) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }

    /** Asks how many screens to open, so one channel can fill the whole screen. */
    private void chooseMultiScreens(int max) {
        // One screen is just the normal TV guide, so Multi-screen only offers 2 or 3.
        if (max < 3) { showMultiScreen(2); return; }
        String[] names = {"2 screens – side by side", "3 screens – one big, two small"};
        new AlertDialog.Builder(this).setTitle("Multi-screen – how many?")
                .setItems(names, (d, w) -> showMultiScreen(w + 2)).setNegativeButton("Cancel", null).show();
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
            pv.setErrorMessageProvider(e -> android.util.Pair.create(0, SafeError.PLAYBACK));
            pv.setUseController(false); pv.setFocusable(false);
            pv.setShutterBackgroundColor(Color.BLACK);
            androidx.media3.exoplayer.ExoPlayer pl = PlayerActivity.build(this);
            pl.setVolume(i == 0 ? 1f : 0f);
            pv.setPlayer(pl);
            multiPlayers.add(pl);
            pl.addListener(new androidx.media3.common.Player.Listener() {
                @Override public void onPlaybackStateChanged(int s) { updateKeepScreenOn(); }
            });
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
            // A tap (phones never move focus on touch) or OK also moves the sound to this screen.
            f.setOnClickListener(v -> {
                for (int k = 0; k < multiPlayers.size(); k++) multiPlayers.get(k).setVolume(k == n ? 1f : 0f);
                pickMultiChannel(n, labels[n]);
            });
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

    private List<String[]> multiCats;
    private final java.util.Map<String, String> multiNow = new java.util.concurrent.ConcurrentHashMap<>();
    // Every row built for a channel (ListView also builds throwaway rows to measure the list), so the listing reaches the one on screen.
    private final java.util.Map<String, java.util.Set<TextView>> multiViews = new java.util.HashMap<>();
    // Newest rows first: rows scrolled past wait, so the channels on screen fill in straight away.
    private final java.util.concurrent.ExecutorService multiIo = new java.util.concurrent.ThreadPoolExecutor(6, 6, 30, java.util.concurrent.TimeUnit.SECONDS,
            new java.util.concurrent.LinkedBlockingDeque<Runnable>() { @Override public boolean offer(Runnable r) { return offerFirst(r); } });
    private final java.util.Set<String> multiAsked = java.util.Collections.newSetFromMap(new java.util.concurrent.ConcurrentHashMap<>());

    /** Multi-screen picker: category, then channels with what's on now – no full guide grid, so it opens fast. */
    private void pickMultiChannel(int n, TextView label) {
        if (liveChannels == null || multiCats == null) {
            final AlertDialog wait = findingDialog();
            io.execute(() -> {
                try {
                    if (liveChannels == null) {
                        JSONArray a = new JSONArray(cachedGet("live", "get_live_streams", ""));
                        List<Item> l = new ArrayList<>();
                        for (int i = 0; i < a.length(); i++) { JSONObject o = a.getJSONObject(i); l.add(liveItem(o)); }
                        liveChannels = l;
                    }
                    JSONArray ca = orderedCategories("live", new JSONArray(cachedGet("live", "get_live_categories", "")));
                    List<String[]> rows = new ArrayList<>();
                    rows.add(new String[]{"*", "All channels"});
                    for (int i = 0; i < ca.length(); i++) { JSONObject o = ca.getJSONObject(i); String id = o.optString("category_id"); if (!hideAdult(id)) rows.add(new String[]{id, o.optString("category_name")}); }
                    multiCats = rows;
                    ui.post(() -> { try { wait.dismiss(); } catch (Exception ignored) {} pickMultiChannel(n, label); });
                } catch (Exception ex) { ui.post(() -> { try { wait.dismiss(); } catch (Exception ignored) {} Toast.makeText(this, "Couldn't load your channels", Toast.LENGTH_LONG).show(); }); }
            });
            return;
        }
        final List<String[]> cats = multiCats;
        resultList("Screen " + (n + 1) + " – pick a category", cats.size(), i -> text(cats.get(i)[1], 18, TEXT, false), i -> {
            String cat = cats.get(i)[0];
            List<Item> chs = new ArrayList<>();
            for (Item it : liveChannels) if (!hideAdult(it.category) && ("*".equals(cat) || cat.equals(it.category))) chs.add(it);
            if (chs.isEmpty()) { Toast.makeText(this, "No channels in " + cats.get(i)[1], Toast.LENGTH_SHORT).show(); return; }
            resultList(cats.get(i)[1], chs.size(), r -> multiRow(chs.get(r)), r -> {
                Item it = chs.get(r);
                if (n >= multiPlayers.size()) return;
                multiPicked.add(n);
                int want = multiPicked.size();
                label.setText("Checking connections…");
                Runnable go = () -> {
                    if (n >= multiPlayers.size()) return;
                    label.setText("");
                    multiNames[n] = it.name;
                    reportMultiPlaying();
                    PlayerActivity.playWithFallback(multiPlayers.get(n), streamUrls(it),
                            () -> ui.post(() -> label.setText(it.name + "\nCouldn't play – press OK to pick another")));
                };
                String names = multiTitle(n, it.name);
                StreamClaim.check(this, "live", names, false, want, (busy, who) -> {
                    if (!busy) { go.run(); return; }
                    multiPicked.remove(n);
                    label.setText("Screens maxed – press OK to try again");
                    new AlertDialog.Builder(this).setTitle("Number of screens is already maxed")
                            .setMessage(who)
                            .setPositiveButton("Watch here instead", (d, w) -> StreamClaim.check(this, "live", names, true, want, (b2, x) -> { multiPicked.add(n); go.run(); }))
                            .setNegativeButton("Cancel", null).show();
                });
            }, null, null, "Back", () -> pickMultiChannel(n, label));
        }, null, null, "Cancel", null);
    }

    /** "BBC One · Sky Sports 1": every pane's channel, with pane n about to show name. */
    private String multiTitle(int n, String name) {
        StringBuilder b = new StringBuilder();
        for (int i = 0; i < multiNames.length; i++) {
            String v = i == n ? name : multiNames[i];
            if (v == null || v.isEmpty()) continue;
            if (b.length() > 0) b.append(" · ");
            b.append(v);
        }
        String t = b.toString();
        return t.length() > 200 ? t.substring(0, 200) : t;
    }

    /** Poll reports all multi-screen channels so other rooms see both names. */
    private void reportMultiPlaying() {
        long since = prefs.getLong("np_since", 0);
        prefs.edit().putString("np_kind", "live").putString("np_title", multiTitle(-1, null)).putString("np_cat", "")
                .putString("np_player", "BM Player").putLong("np_since", since > 0 ? since : System.currentTimeMillis())
                .putBoolean("np_preview", false).apply();
        io.execute(this::pollOnce);
    }

    /** Channel name with "Now: title" underneath, filled in quietly as rows come into view. */
    private View multiRow(Item it) {
        TextView t = text(it.name + "\n" + multiNowLine(it.id), 17, TEXT, false);
        t.setMaxLines(2); t.setEllipsize(android.text.TextUtils.TruncateAt.END);
        t.setTag(it.id);
        java.util.Set<TextView> rows = multiViews.get(it.id);
        if (rows == null) { rows = java.util.Collections.newSetFromMap(new java.util.WeakHashMap<>()); multiViews.put(it.id, rows); }
        rows.add(t);
        if (!multiNow.containsKey(it.id) && multiAsked.add(it.id)) multiIo.execute(() -> {
            String line = "";
            try {
                long now = System.currentTimeMillis() / 1000;
                List<GuideGridView.Prog> ps = GuideListings.parse(new JSONObject(Net.get(api("get_short_epg") + "&stream_id=" + it.id + "&limit=2")).optJSONArray("epg_listings"), now);
                for (GuideGridView.Prog p : ps) if (p.st <= now && p.en > now) { line = p.title + "  " + clock(p.st) + "–" + clock(p.en); break; }
            } catch (Exception ignored) {}
            multiNow.put(it.id, line);
            final String l2 = line;
            ui.post(() -> {
                java.util.Set<TextView> vs = multiViews.get(it.id);
                if (vs != null) for (TextView v : new ArrayList<>(vs)) if (v != null && it.id.equals(v.getTag())) v.setText(it.name + "\n" + (l2.isEmpty() ? "No listing" : "Now: " + l2));
            });
        });
        return t;
    }
    private String multiNowLine(String id) { String l = multiNow.get(id); return l == null ? "Loading what's on…" : l.isEmpty() ? "No listing" : "Now: " + l; }

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
    @Override protected void onNewIntent(Intent i) { super.onNewIntent(i); setIntent(i); handleReminderIntent(i); handleWatchIntent(i); refreshVersionScreens(); }

    /** "Watch on my box" from the website: open that film or series (by provider id, else exact title, else a title search). */
    private void handleWatchIntent(Intent i) {
        String kind = i == null ? null : i.getStringExtra("watch_kind");
        if (kind == null) return;
        String id = i.getStringExtra("watch_id"), title = i.getStringExtra("watch_title");
        i.removeExtra("watch_kind");
        if (!isUnlocked()) { Toast.makeText(this, "Unlock BM Player to watch " + title, Toast.LENGTH_LONG).show(); return; }
        Toast.makeText(this, "Opening " + title + "…", Toast.LENGTH_SHORT).show();
        io.execute(() -> {
            Item hit = null;
            try {
                List<Item> all = parseItems(kind, new JSONArray(cachedGet(kind, listActionFor(kind), "")), null);
                hit = WatchRequest.find(all, id, title);
            } catch (Exception ignored) {}
            final Item f = hit;
            ui.post(() -> { if (isFinishing()) return; if (f != null) open(f); else runSearch(kind, title == null ? "" : title); });
        });
    }

    @Override public void onUserInteraction() { super.onUserInteraction(); PlayerApplication.interaction(this); }
    boolean showsAnnouncementIcon() { return signedInScreen() && !"sports".equals(screen) && !"sports_channels".equals(screen); }
    /** Announcements (icon and bottom bar) only once signed in and past today's 2FA code. */
    boolean signedInScreen() {
        return PlayerApplication.pinPassed && screen != null && !"pin".equals(screen) && !"link".equals(screen)
                && !"unlock".equals(screen) && !"expired".equals(screen) && !"maintenance".equals(screen);
    }
    @Override public void onContentChanged() {
        super.onContentChanged();
        if (getApplication() instanceof PlayerApplication) ((PlayerApplication) getApplication()).refreshMajorIcon();
    }
    @Override public boolean dispatchKeyEvent(KeyEvent e) {
        if ("sports".equals(screen) && e.getKeyCode() == KeyEvent.KEYCODE_DPAD_RIGHT && sportsList != null && sportsList.hasFocus()) {
            if (e.getAction() == KeyEvent.ACTION_DOWN && sportsChannelList != null) sportsChannelList.requestFocus();
            return true;
        }
        if ("sports".equals(screen) && e.getKeyCode() == KeyEvent.KEYCODE_DPAD_LEFT && sportsChannelList != null && sportsChannelList.hasFocus()) {
            if (e.getAction() == KeyEvent.ACTION_DOWN && sportsList != null) {
                sportsList.requestFocus();
                sportsList.post(() -> revealSportsCard(sportsList));
            }
            return true;
        }
        return PlayerApplication.closeAnnouncementOnBack(this, e) || super.dispatchKeyEvent(e);
    }
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
        if (hasLogin()) {
            // Every open shows the family link check; an already-confirmed link adds the Go to home button straight away.
            // Back from the background (or Android rebuilt the screen) without a full exit: straight home, no link screen.
            if (PlayerApplication.pinPassed && rememberedUnlock()) { unlocked = true; showHome(); return; }
            rememberedUnlock();
            showLinkCheck();
            if (linkVerified) linkConfirmed();
        } else showLink();
    }

    /** Never crash when a delayed task fires after the screen closed and its queue shut down. */
    private boolean safeRun(ExecutorService ex, Runnable r) {
        if (ex.isShutdown() || isDestroyed()) return false;
        try { ex.execute(r); return true; } catch (java.util.concurrent.RejectedExecutionException e) { return false; }
    }

    private boolean hasLogin() {
        // A login copied from another box can't be unlocked here, so it doesn't count.
        return !prefs.getString("user", "").isEmpty() && !prefs.getString("dns", "").isEmpty() && !SecureLogin.password(prefs).isEmpty();
    }

    private void startPolling() {
        stopPolling();
        pollTask = new Runnable() {
            @Override public void run() {
                // A backgrounded app (Home pressed, not closed) stops checking in so it drops off Live connections,
                // except while external VLC is playing something it handed off.
                boolean vlcPlaying = prefs.getLong("np_since", 0) > 0 && "VLC".equals(prefs.getString("np_player", ""));
                // Self-heal: a preview that is playing must always report itself, even if a resume cleared it.
                if (preview != null && previewItem != null && preview.getPlaybackState() == androidx.media3.common.Player.STATE_READY
                        && prefs.getLong("np_since", 0) == 0) { previewCounted = true; setNowPlaying(previewItem, false, true); }
                if (PlayerApplication.onScreen() || vlcPlaying || !hasLogin()) {
                    if (!safeRun(io, MainActivity.this::pollOnce)) return;
                }
                ui.postDelayed(this, maintenance ? Checkin.delay(15000) : hasLogin() ? Checkin.delay(60000) : 5000);
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
                .put("login", prefs.getString("user", "")).put("version", appVersion()).put("sig", appSignature());
        long since = prefs.getLong("np_since", 0);
        if (since > 0) b.put("watching", new JSONObject().put("kind", prefs.getString("np_kind", "live"))
                .put("title", prefs.getString("np_title", "")).put("category", prefs.getString("np_cat", ""))
                .put("player", prefs.getString("np_player", "BM Player")).put("since", since)
                .put("preview", prefs.getBoolean("np_preview", false)));
        return b;
    }

    private void setNowPlaying(Item it, boolean vlc) { setNowPlaying(it, vlc, false); }

    /** Preview playback is flagged so the website shows it on Live connections but never counts it in viewing hours. */
    private void setNowPlaying(Item it, boolean vlc, boolean preview) {
        long since = System.currentTimeMillis();
        prefs.edit().putString("np_kind", it.kind).putString("np_title", it.name == null ? "" : it.name)
                .putString("np_cat", "").putString("np_player", vlc ? "VLC" : "BM Player").putLong("np_since", since)
                .putBoolean("np_preview", preview).apply();
        io.execute(() -> {
            String cat = ""; try { cat = categoryName(it); } catch (Exception ignored) {}
            if (prefs.getLong("np_since", 0) == since) prefs.edit().putString("np_cat", cat == null ? "" : cat).apply();
            pollOnce();
        });
    }

    private void clearNowPlaying() {
        if (prefs.getLong("np_since", 0) == 0) return;
        prefs.edit().putLong("np_since", 0).putBoolean("np_preview", false).apply();
        io.execute(this::pollOnce);
    }

    /** stopPreview only clears the now-playing note while that note still belongs to the preview. */
    static boolean previewStopClearsNowPlaying(boolean previewCounted, boolean nowPlayingIsPreview) {
        return previewCounted && nowPlayingIsPreview;
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
            Checkin.setSlow(r.optInt("slow", 1));
            JSONObject mt = r.optJSONObject("maintenance");
            boolean down = mt != null && mt.optBoolean("enabled");
            boolean wasDown = maintenance;
            maintenance = down;
            if (down) { String msg = mt.optString("message"); ui.post(() -> showMaintenance(msg)); return; }
            if (wasDown) ui.post(() -> { screen = ""; if (hasLogin()) showHome(); else showLink(); });
            boolean verifiedBefore = linkVerified;
            linkVerified = r.optBoolean("linked", false) || r.optJSONObject("credentials") != null;
            boolean had = hasLogin();
            SharedPreferences.Editor ed = prefs.edit().putString("dns", r.optString("dns", ""));
            JSONObject c = r.optJSONObject("credentials");
            // A login sent from the website (link code or the owner's device list) is the account holder's own
            // action, so it counts as the sign-in: no account number needed until log out or cleared data.
            if (c != null) { ed.putString("user", c.optString("username")).putString("pass", SecureLogin.seal(c.optString("password"))).putString("unlocked_for", prefs.getString("token", "")); unlocked = true; }
            ed.apply();
            boolean now = hasLogin();
            // Older releases saved credentials without a sign-in marker. Only restore after the
            // website authenticates this token and confirms it still belongs to a linked account.
            boolean restored = !unlocked && !rememberedUnlock()
                    && LinkedSignIn.canRestore(prefs.getString("token", ""), r.optBoolean("linked", false), now);
            if (restored) { unlocked = true; rememberUnlock(); }
            boolean needsAccount = !unlocked && now && !r.optBoolean("linked", false);
            if (c != null || had != now || restored || needsAccount || (!verifiedBefore && linkVerified)) ui.post(() -> {
                if (c != null) Toast.makeText(this, "Login received from BM Support", Toast.LENGTH_LONG).show();
                if (now && "linkcheck".equals(screen) && linkVerified) linkConfirmed();
                // Freshly linked with the code: show the family "device is linked" screen and its Go to home button too.
                else if (now && "link".equals(screen)) { showLinkCheck(); linkConfirmed(); }
                else if ("linkok".equals(screen) && now) { /* stay until Go to home screen is pressed */ }
                else if (now) showHome(); else showLink();
            });
        } catch (Exception ex) {
            if (String.valueOf(ex.getMessage()).contains("401")) {
                // Removed from the website (or unused for 60 days): sign out completely.
                prefs.edit().remove("token").remove("user").remove("pass").remove("unlocked_for").apply();
                linkVerified = false;
                unlocked = false;
                PlayerApplication.pinPassed = false;
                ui.post(this::start);
            } else if (!unlocked && hasLogin()) {
                // Stay on the family picture: say it's still checking and let the next check-in (or the 10s Go to home button) carry on.
                ui.post(() -> {
                    if ("linkcheck".equals(screen) || "linkok".equals(screen)) { if ("linkcheck".equals(screen) && linkCheckMsg != null) linkCheckMsg.setText("\u23F3 Still checking your linked device… please wait"); }
                    else showLinkCheck();
                });
            }
        }
    }

    /** Approved once per link: the box stays open until it is unlinked, signed out or its data is cleared. */
    private void rememberUnlock() { prefs.edit().putString("unlocked_for", prefs.getString("token", "")).apply(); }
    private boolean rememberedUnlock() {
        String t = prefs.getString("token", "");
        if (!t.isEmpty() && t.equals(prefs.getString("unlocked_for", ""))) { unlocked = true; return true; }
        return false;
    }

    /** Display the device code for its owner to enter on the website. */
    private void showLink() {
        unlocked = false; prefs.edit().remove("unlocked_for").apply();
        screen = "link"; back = null;
        LinearLayout root = new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL);
        root.addView(text("Welcome to BM Player", 26, TEXT, true));
        if (prefs.getString("dns", "").isEmpty() && !prefs.getString("user", "").isEmpty()) {
            root.addView(text("Login received — waiting for the server address from BM Support.", 16, MUTED, false));
            setContentView(familyFrame(root)); return;
        }
        root.addView(text("Sign in at bmsupport.uk and open Link Device. Enter this code and choose your app login.", 16, MUTED, false));
        TextView code = text("Getting your code…", 36, TEXT, true);
        root.addView(code);
        TextView status = text("Waiting for you to link this device…", 14, MUTED, false);
        root.addView(status);
        Runnable refresh = () -> {
            code.setText("Getting your code…");
            io.execute(() -> {
                try {
                    JSONObject r = new JSONObject(Net.postJson(Net.SITE + "/api/public/player", new JSONObject().put("action", "code")
                            .put("device_token", prefs.getString("token", "")).toString()));
                    String value = r.getString("code");
                    ui.post(() -> { code.setText(value); status.setText("Waiting for you to link this device…"); });
                } catch (Exception ex) {
                    ui.post(() -> { code.setText("—"); status.setText("Couldn't get a code. Check the internet and try New code."); });
                }
            });
        };
        root.addView(button("New code", v -> refresh.run()));
        root.addView(text("No website account? Create one at bmsupport.uk/signup", 14, MUTED, false));
        setContentView(familyFrame(root));
        refresh.run();
    }

    // ---------- home ----------

    private void showUnlock() {
        stopPreview(); stopMulti();
        screen = "unlock"; back = null;
        // Two columns: words + box on the left, BM's own number pad on the right. The phone's keyboard
        // is never opened here, so nothing can ever cover the box (see NumberPad).
        LinearLayout root = column();
        root.setGravity(Gravity.TOP);
        root.setPadding(dp(32), dp(16), dp(32), dp(16));
        LinearLayout cols = row();
        cols.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout left = new LinearLayout(this); left.setOrientation(LinearLayout.VERTICAL);
        left.addView(logo());
        left.addView(text("Enter your account number", 26, TEXT, true));
        left.addView(text("Type the 6-digit account number from your subscription box. You only need to do this again if you log out or clear the app's data.", 16, MUTED, false));
        EditText in = new EditText(this);
        in.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_VARIATION_PASSWORD);
        in.setFilters(new InputFilter[]{ new InputFilter.LengthFilter(6) });
        in.setTextSize(36); in.setTextColor(ACCENT); in.setGravity(Gravity.CENTER);
        in.setLetterSpacing(0.3f); in.setHint("••••••"); in.setHintTextColor(MUTED);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(dp(300), ViewGroup.LayoutParams.WRAP_CONTENT);
        in.setLayoutParams(lp);
        left.addView(in);
        TextView status = text("", 16, MUTED, false);
        Button go = button("Unlock", v -> {
            String n = in.getText().toString().trim();
            if (!n.matches("\\d{6}")) { status.setText("Enter all 6 digits."); return; }
            status.setText("Checking…");
            io.execute(() -> {
                try {
                    Net.postJson(Net.SITE + "/api/public/player", new JSONObject().put("action", "unlock")
                            .put("device_token", prefs.getString("token", "")).put("account_number", n).toString());
                    ui.post(() -> { unlocked = true; rememberUnlock(); ((PlayerApplication) getApplication()).refreshMajor(); hideKeyboard(in); getWindow().setSoftInputMode(android.view.WindowManager.LayoutParams.SOFT_INPUT_ADJUST_PAN | android.view.WindowManager.LayoutParams.SOFT_INPUT_STATE_HIDDEN); showHome(); syncFavourites(null); ProgressSync.pull(this, true, () -> { if ("home".equals(screen)) showHome(); }); });
                } catch (Exception ex) {
                    String m = String.valueOf(ex.getMessage()), msg = "Couldn't check. Check the internet and try again.";
                    int i = m.indexOf('{');
                    if (i >= 0) try { msg = new JSONObject(m.substring(i)).optString("error", msg); } catch (Exception ignored) {}
                    final String shown = SafeError.forScreen(msg, "Couldn't check. Check the internet and try again.");
                    ui.post(() -> { status.setText(shown); in.setText(""); });
                }
            });
        });
        left.addView(go);
        left.addView(status);
        // Customers without a website account get a QR: scan it and type the account number to approve.
        android.widget.ImageView qrView = new android.widget.ImageView(this);
        qrView.setVisibility(View.GONE);
        TextView qrText = text("No website account? Scan this with your phone and enter your account number.", 15, MUTED, false);
        qrText.setVisibility(View.GONE);
        left.addView(qrText);
        left.addView(qrView, new LinearLayout.LayoutParams(dp(170), dp(170)));
        unlockQr = qrView; unlockQrText = qrText; unlockQrUrl = "";
        LinearLayout pad = NumberPad.build(this, in, 6, CARD, ACCENT, TEXT, go::performClick);
        cols.addView(left, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1.1f));
        LinearLayout.LayoutParams padLp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        padLp.leftMargin = dp(24);
        cols.addView(pad, padLp);
        root.addView(cols);
        // No system keyboard on this screen, ever.
        getWindow().setSoftInputMode(android.view.WindowManager.LayoutParams.SOFT_INPUT_ADJUST_PAN | android.view.WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_HIDDEN);
        hideKeyboard(in);
        android.widget.ScrollView sc = scrollable(root);
        setContentView(sc);
        NumberPad.firstKey(pad).requestFocus();
        pollRemoteUnlock(go, status);
    }

    /** After the opening video: ask the customer's 4-digit PIN before the main menu, once per app open. */
    private void checkPin() {
        // Never a plain logo "Loading…" screen: keep (or show) the family linked-device picture while this quick check runs.
        boolean onFamily = ("linkcheck".equals(screen) || "linkok".equals(screen)) && linkCheckMsg != null;
        screen = "pin"; back = null;
        if (onFamily) {
            linkCheckMsg.setText("\u2705 Your device is linked");
            for (int i = linkCheckPanel.getChildCount() - 1; i >= 0; i--) if (linkCheckPanel.getChildAt(i) instanceof Button) linkCheckPanel.removeViewAt(i);
        } else {
            LinearLayout p = column(); p.setGravity(Gravity.CENTER_HORIZONTAL);
            p.addView(logo());
            p.addView(text("Welcome to BM Player", 24, TEXT, true));
            p.addView(text("\u2705 Your device is linked", 18, MUTED, false));
            setContentView(familyFrame(p));
        }
        io.execute(() -> {
            boolean required; boolean setup = false;
            try {
                JSONObject r = new JSONObject(Net.postJson(Net.SITE + "/api/public/player", new JSONObject().put("action", "pin_status")
                        .put("device_token", prefs.getString("token", "")).toString()));
                required = r.optBoolean("required", false);
                setup = r.optBoolean("needs_setup", false);
                pinDigits = r.optInt("digits", 4) == 6 ? 6 : 4;
                pinFallback = r.optBoolean("pin_fallback", false);
                totpSetup = r.optBoolean("totp_setup", false);
                prefs.edit().putBoolean("pin_required", required).apply();
            } catch (Exception e) { required = prefs.getBoolean("pin_required", false); }
            final boolean need = required, create = setup;
            ui.post(() -> {
                if (!"pin".equals(screen) || isFinishing()) return;
                if (totpSetup) showTotpSetup();
                else if (!need) { PlayerApplication.pinPassed = true; showHome(); } else { pinDigits = 6; showPin(false, null); }
            });
        });
    }

    /** 4 = PIN; 6 = authenticator-app code (asked once a day, server decides). */
    private int pinDigits = 4;
    private boolean pinFallback = false;
    /** Server says this account has no authenticator yet: show the first-visit 2FA setup after the PIN. */
    private boolean totpSetup = false;

    private void afterPin() { if (totpSetup) showTotpSetup(); else showHome(); }

    /** First visit: QR to scan into an authenticator app, buttons to get the app, then one 6-digit code to finish. */
    /** First visit: family welcome picture with one button into the 2FA setup screen. */
    private void showTotpSetup() {
        stopPreview(); stopMulti();
        screen = "pin"; back = null;
        LinearLayout p = new LinearLayout(this); p.setOrientation(LinearLayout.VERTICAL);
        p.addView(logo());
        p.addView(text("STEP 2 OF 2  \u2022  Turn on 2FA", 14, ACCENT, true));
        p.addView(text("Device linked \u2713", 28, TEXT, true));
        p.addView(text("Now keep your account safe. Set up 2-step verification once with an authenticator app on your phone \u2014 it only takes a minute.", 16, MUTED, false));
        Button go = button("Set up 2FA  \u203A", v -> loadTotpSetup());
        p.addView(go);
        p.addView(text("\uD83D\uDD12 You'll scan a QR code with Google Authenticator or Microsoft Authenticator.", 14, MUTED, false));
        setContentView(familyFrame(p));
        go.requestFocus();
    }

    private TextView linkCheckMsg; private LinearLayout linkCheckPanel;
    /** Opening check: family picture with "Checking your linked device…"; a Go to home button appears once the website confirms. */
    private void showLinkCheck() {
        stopPreview(); stopMulti();
        screen = "linkcheck"; back = null;
        LinearLayout p = column(); p.setGravity(Gravity.CENTER_HORIZONTAL);
        p.addView(logo());
        p.addView(text("Welcome to BM Player", 24, TEXT, true));
        linkCheckMsg = text("\u23F3 Checking your linked device… please wait", 18, MUTED, false);
        p.addView(linkCheckMsg);
        linkCheckPanel = p;
        setContentView(familyFrame(p));
        // Ask the website straight away instead of waiting for the next timed check-in.
        safeRun(io, this::pollOnce);
        // Never strand the customer: after 10s with a saved login, offer the button anyway; an unlinked box is still signed out by the background check.
        ui.postDelayed(() -> { if ("linkcheck".equals(screen) && hasLogin()) linkConfirmed(); }, 10000);
    }
    private static boolean welcomed = false;
    /** Speaks the ElevenLabs welcome (made on the website, so no voice key is in the app) once per app start. */
    private void speakWelcome(Runnable done) {
        final boolean[] fired = {false};
        Runnable once = () -> { if (fired[0]) return; fired[0] = true; done.run(); };
        if (welcomed) { once.run(); return; }
        welcomed = true;
        ui.postDelayed(once, 25000); // never strand the customer if the voice stalls
        safeRun(io, () -> {
            try {
                JSONObject r = new JSONObject(Net.postJson(Net.SITE + "/api/public/player", new JSONObject().put("action", "welcome_voice")
                        .put("device_token", prefs.getString("token", "")).toString()));
                if (!"audio/mpeg".equals(r.optString("mime"))) { ui.post(once); return; }
                byte[] bytes = Base64.decode(r.optString("audio", ""), Base64.DEFAULT);
                if (bytes.length < 1000) { ui.post(once); return; }
                java.io.File f = new java.io.File(getCacheDir(), "welcome.mp3");
                try (java.io.FileOutputStream o = new java.io.FileOutputStream(f)) { o.write(bytes); }
                ui.post(() -> {
                    try {
                        android.media.MediaPlayer mp = new android.media.MediaPlayer();
                        mp.setDataSource(f.getAbsolutePath());
                        mp.setOnCompletionListener(x -> { x.release(); once.run(); });
                        mp.setOnErrorListener((x, w, e) -> { x.release(); once.run(); return true; });
                        mp.prepare();
                        mp.start();
                    } catch (Exception ignored) { once.run(); }
                });
            } catch (Exception ignored) { ui.post(once); }
        });
    }
    private void linkConfirmed() {
        if (linkCheckMsg == null || linkCheckPanel == null) { showHome(); return; }
        if ("linkok".equals(screen)) return;
        linkCheckMsg.setText("\u2705 Your device is linked");
        screen = "linkok";
        // The welcome plays in full before the button appears, so nobody skips past it.
        speakWelcome(() -> {
            if (!"linkok".equals(screen) || linkCheckPanel == null) return;
            Button go = button("Go to home screen", v -> { PlayerApplication.pinPassed = true; showHome(); });
            linkCheckPanel.addView(go);
            go.requestFocus();
        });
    }

    /** Family-watching-TV picture behind a frosted panel on the right (2FA welcome and daily code screens). */
    private View familyFrame(LinearLayout panel) {
        android.widget.FrameLayout f = new android.widget.FrameLayout(this);
        f.setBackgroundColor(BG);
        android.widget.ImageView bg = new android.widget.ImageView(this);
        bg.setImageResource(R.drawable.family_tv); bg.setScaleType(android.widget.ImageView.ScaleType.CENTER_CROP);
        f.addView(bg, new android.widget.FrameLayout.LayoutParams(-1, -1));
        View shade = new View(this);
        shade.setBackground(new android.graphics.drawable.GradientDrawable(android.graphics.drawable.GradientDrawable.Orientation.LEFT_RIGHT, new int[]{0x00000000, 0x660B1220, 0xE60B1220}));
        f.addView(shade, new android.widget.FrameLayout.LayoutParams(-1, -1));
        android.graphics.drawable.GradientDrawable card = new android.graphics.drawable.GradientDrawable();
        card.setColor(0xD916213A); card.setCornerRadius(dp(20)); card.setStroke(dp(1), 0x33FFFFFF);
        panel.setBackground(card);
        panel.setPadding(dp(22), dp(12), dp(22), dp(12));
        android.widget.ScrollView sc = new android.widget.ScrollView(this);
        sc.setFillViewport(true);
        LinearLayout holder = new LinearLayout(this); holder.setGravity(Gravity.CENTER_VERTICAL);
        holder.setPadding(dp(12), dp(8), dp(12), dp(8));
        holder.addView(panel, new LinearLayout.LayoutParams(-1, -2));
        sc.addView(holder, new android.widget.ScrollView.LayoutParams(-1, -1));
        int w = Math.max(dp(360), (int) (getResources().getDisplayMetrics().widthPixels * 0.44f));
        f.addView(sc, new android.widget.FrameLayout.LayoutParams(w, -1, Gravity.END));
        return f;
    }

    private void loadTotpSetup() {
        stopPreview(); stopMulti();
        screen = "pin"; back = null;
        LinearLayout wait = column(); wait.setGravity(Gravity.CENTER);
        wait.addView(logo()); wait.addView(text("Loading 2FA set up…", 18, MUTED, false));
        setContentView(wait);
        io.execute(() -> {
            JSONObject r = null; String err = null;
            try { r = new JSONObject(Net.postJson(Net.SITE + "/api/public/player", new JSONObject().put("action", "totp_start").put("device_token", prefs.getString("token", "")).toString())); }
            catch (Exception ex) { err = String.valueOf(ex.getMessage()); }
            final JSONObject fr = r; final String fe = err;
            ui.post(() -> {
                if (!"pin".equals(screen) || isFinishing()) return;
                if (fr == null) {
                    if (fe != null && (fe.contains("409") || fe.contains("already set up"))) { totpSetup = false; PlayerApplication.pinPassed = true; showHome(); return; }
                    LinearLayout box = column(); box.setGravity(Gravity.CENTER); box.addView(logo());
                    box.addView(text("Couldn't load 2FA set up. Check the internet and try again.", 18, MUTED, false));
                    box.addView(button("Try again", v -> loadTotpSetup()));
                    setContentView(box); return;
                }
                buildTotpSetup(fr.optString("otpauth"), fr.optString("secret"), fr.optJSONObject("apps"));
            });
        });
    }

    private void buildTotpSetup(String otpauth, String secret, JSONObject apps) {
        LinearLayout root = column(); root.setGravity(Gravity.TOP);
        root.setPadding(dp(32), dp(16), dp(32), dp(16));
        LinearLayout cols = row(); cols.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout left = new LinearLayout(this); left.setOrientation(LinearLayout.VERTICAL);
        left.addView(logo());
        left.addView(text("Set up 2FA", 26, TEXT, true));
        left.addView(text("1. Scan this QR code with an authenticator app on your phone.\n2. Type the 6-digit code it shows.\nBM Player will ask for a code once a day. 10 backup codes are then saved in Security settings on bmsupport.uk.", 16, MUTED, false));
        android.widget.ImageView q = new android.widget.ImageView(this);
        q.setImageBitmap(qr(otpauth, dp(180)));
        left.addView(q, new LinearLayout.LayoutParams(dp(180), dp(180)));
        left.addView(text("Or type this key: " + secret, 13, MUTED, false));
        left.addView(text("No authenticator app? Get one:", 15, TEXT, true));
        LinearLayout storeRow = row();
        String apple = apps == null ? "" : apps.optString("apple"), playUrl = apps == null ? "" : apps.optString("android");
        storeRow.addView(button("iPhone (App Store)", v -> showStoreQr("Google Authenticator for iPhone", apple)));
        storeRow.addView(button("Android (Play Store)", v -> showStoreQr("Google Authenticator for Android", playUrl)));
        left.addView(storeRow);
        EditText in = new EditText(this);
        in.setInputType(InputType.TYPE_CLASS_NUMBER);
        in.setFilters(new InputFilter[]{ new InputFilter.LengthFilter(6) });
        in.setTextSize(32); in.setTextColor(ACCENT); in.setGravity(Gravity.CENTER);
        in.setLetterSpacing(0.3f); in.setHint("••••••"); in.setHintTextColor(MUTED);
        in.setLayoutParams(new LinearLayout.LayoutParams(dp(240), ViewGroup.LayoutParams.WRAP_CONTENT));
        // The box the customer reads is the CodeBox below; this field only holds what the keypad types.
        in.setVisibility(View.GONE);
        left.addView(in);
        left.addView(CodeBox.build(this, in, 6, CARD, ACCENT, TEXT, MUTED));
        TextView status = text("", 16, MUTED, false);
        Button go = button("Turn on 2FA", v -> {
            String n = in.getText().toString().trim();
            if (!n.matches("\\d{6}")) { status.setText("Enter all 6 digits."); return; }
            status.setText("Checking…");
            io.execute(() -> {
                String err = null;
                try { Net.postJson(Net.SITE + "/api/public/player", new JSONObject().put("action", "totp_confirm").put("device_token", prefs.getString("token", "")).put("code", n).toString()); }
                catch (Exception ex) {
                    String m = String.valueOf(ex.getMessage());
                    err = "Couldn't check. Check the internet and try again.";
                    int i = m.indexOf('{');
                    if (i >= 0) try { err = new JSONObject(m.substring(i)).optString("error", err); } catch (Exception ignored) {}
                    err = SafeError.forScreen(err, "Couldn't check. Check the internet and try again.");
                }
                final String fe = err;
                ui.post(() -> {
                    if (!"pin".equals(screen)) return;
                    if (fe == null) { totpSetup = false; PlayerApplication.pinPassed = true; hideKeyboard(in); android.widget.Toast.makeText(this, "2FA is on. Your 10 backup codes are in Security settings on bmsupport.uk.", android.widget.Toast.LENGTH_LONG).show(); showHome(); }
                    else { status.setText(fe); in.setText(""); }
                });
            });
        });
        left.addView(go); left.addView(status);
        LinearLayout pad = NumberPad.build(this, in, 6, CARD, ACCENT, TEXT, go::performClick);
        cols.addView(left, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1.1f));
        LinearLayout.LayoutParams padLp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        padLp.leftMargin = dp(24);
        cols.addView(pad, padLp);
        root.addView(cols);
        hideKeyboard(in);
        setContentView(scrollable(root));
        NumberPad.firstKey(pad).requestFocus();
    }

    /** Pop-up QR code a phone can scan to download the authenticator app. */
    private void showStoreQr(String title, String url) {
        if (url == null || !(url.startsWith("https://apps.apple.com/") || url.startsWith("https://play.google.com/"))) return;
        android.widget.ImageView q = new android.widget.ImageView(this);
        q.setImageBitmap(qr(url, dp(240)));
        q.setPadding(dp(16), dp(16), dp(16), dp(16));
        new android.app.AlertDialog.Builder(this).setTitle(title).setMessage("Scan with your phone's camera to download it.")
                .setView(q).setPositiveButton("Close", null).show();
    }

    /** create=true: first open, the customer chooses a PIN (typed twice; `first` holds the first entry). */
    private void showPin(boolean create, String first) {
        stopPreview(); stopMulti();
        screen = "pin"; back = null;
        LinearLayout root = column();
        root.setGravity(Gravity.TOP);
        root.setPadding(dp(32), dp(16), dp(32), dp(16));
        LinearLayout cols = row();
        cols.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout left = new LinearLayout(this); left.setOrientation(LinearLayout.VERTICAL);
        // PIN is retired: 6 = authenticator code, 8 = one-use backup code from Security settings on bmsupport.uk.
        final int nd = pinDigits == 8 ? 8 : 6; final boolean totp = nd == 6;
        left.addView(text(totp ? "Welcome back" : "Enter a backup code", 22, TEXT, true));
        left.addView(text(totp ? "Enter today's 6-digit code from your authenticator app."
                : "Type an 8-digit backup code from Security settings on bmsupport.uk. Each works once.", 16, MUTED, false));
        EditText in = new EditText(this);
        in.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_VARIATION_PASSWORD);
        in.setFilters(new InputFilter[]{ new InputFilter.LengthFilter(nd) });
        in.setTextSize(36); in.setTextColor(ACCENT); in.setGravity(Gravity.CENTER);
        in.setLetterSpacing(0.3f); in.setHint(totp ? "••••••" : "••••••••"); in.setHintTextColor(MUTED);
        in.setLayoutParams(new LinearLayout.LayoutParams(dp(220), ViewGroup.LayoutParams.WRAP_CONTENT));
        // The box the customer reads is the CodeBox below; this field only holds what the keypad types.
        in.setVisibility(View.GONE);
        left.addView(in);
        left.addView(CodeBox.build(this, in, nd, CARD, ACCENT, TEXT, MUTED));
        TextView status = text("", 16, MUTED, false);
        Button go = button(create && first == null ? "Next" : create ? "Save PIN" : "Open BM Player", v -> {
            String n = in.getText().toString().trim();
            if (!n.matches("\\d{" + nd + "}")) { status.setText("Enter all " + nd + " digits."); return; }
            if (create && first == null) { hideKeyboard(in); showPin(true, n); return; }
            if (create && !n.equals(first)) { showPin(true, null); android.widget.Toast.makeText(this, "The PINs didn't match. Try again.", android.widget.Toast.LENGTH_LONG).show(); return; }
            status.setText(create ? "Saving…" : "Checking…");
            io.execute(() -> {
                String err = null; boolean wasReset = false;
                try {
                    String resp = Net.postJson(Net.SITE + "/api/public/player", new JSONObject().put("action", create ? "pin_create" : "pin_check")
                            .put("device_token", prefs.getString("token", "")).put("pin", n).toString());
                    try { wasReset = new JSONObject(resp).optBoolean("reset", false); } catch (Exception ignored) {}
                } catch (Exception ex) {
                    String m = String.valueOf(ex.getMessage());
                    err = "Couldn't check. Check the internet and try again.";
                    int i = m.indexOf('{');
                    if (i >= 0) try { err = new JSONObject(m.substring(i)).optString("error", err); } catch (Exception ignored) {}
                    err = SafeError.forScreen(err, "Couldn't check. Check the internet and try again.");
                }
                final String fe = err; final boolean reset = wasReset;
                ui.post(() -> {
                    if (!"pin".equals(screen)) return;
                    // Reset code from the 2FA help chat: 2FA is cleared, so go straight to setting it up again.
                    if (fe == null && reset) { hideKeyboard(in); pinDigits = 6; checkPin(); return; }
                    if (fe == null) { if (create) { prefs.edit().putBoolean("pin_required", true).apply(); totpSetup = true; } PlayerApplication.pinPassed = !totpSetup; hideKeyboard(in); afterPin(); }
                    else if (create) { showPin(true, null); android.widget.Toast.makeText(this, fe, android.widget.Toast.LENGTH_LONG).show(); }
                    else { status.setText(fe); in.setText(""); }
                });
            });
        });
        // The keypad OK submits; no separate open button on screen.
        go.setVisibility(View.GONE);
        left.addView(go);
        left.addView(status);
        LinearLayout helpRow = row();
        String altLabel = totp ? "🔑  Backup code" : "📱  Authenticator";
        helpRow.addView(smallButton(altLabel, v -> { pinDigits = totp ? 8 : 6; showPin(false, null); }), iconWeight());
        final TextView helpStatus = status;
        String lostLabel = "✉  Email reset";
        helpRow.addView(smallButton(lostLabel, v -> {
            helpStatus.setText("Sending…");
            io.execute(() -> {
                String msg = "Check your email for a link to the 2FA help chat. It gives you an 8-digit reset code to type here as a backup code.";
                try { Net.postJson(Net.SITE + "/api/public/player", new JSONObject().put("action", "totp_reset_request").put("device_token", prefs.getString("token", "")).toString()); }
                catch (Exception ex) {
                    String m = String.valueOf(ex.getMessage()); msg = "Couldn't send the email. Try again.";
                    int i = m.indexOf('{');
                    if (i >= 0) try { msg = new JSONObject(m.substring(i)).optString("error", msg); } catch (Exception ignored) {}
                    msg = SafeError.forScreen(msg, "Couldn't send the email. Try again.");
                }
                final String fm = msg; ui.post(() -> helpStatus.setText(fm));
            });
        }), iconWeight());
        left.addView(helpRow);
        LinearLayout pad = NumberPad.build(this, in, nd, CARD, ACCENT, TEXT, go::performClick);
        LinearLayout.LayoutParams padLp = new LinearLayout.LayoutParams(-1, -2);
        padLp.topMargin = dp(8); padLp.bottomMargin = dp(8);
        left.addView(pad, left.indexOfChild(go), padLp);
        getWindow().setSoftInputMode(android.view.WindowManager.LayoutParams.SOFT_INPUT_ADJUST_PAN | android.view.WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_HIDDEN);
        hideKeyboard(in);
        setContentView(familyFrame(left));
        NumberPad.firstKey(pad).requestFocus();
    }

    private android.widget.ImageView unlockQr; private TextView unlockQrText; private String unlockQrUrl = "";

    /** The customer can press their account number on bmsupport.uk to unlock this screen. */
    private void pollRemoteUnlock(Button go, TextView status) {
        ui.postDelayed(() -> {
            if (!"unlock".equals(screen) || unlocked || isFinishing()) return;
            io.execute(() -> {
                boolean ok = false; String qrUrl = "";
                try {
                    JSONObject r = new JSONObject(Net.postJson(Net.SITE + "/api/public/player", new JSONObject().put("action", "unlock_status")
                            .put("device_token", prefs.getString("token", "")).toString()));
                    ok = r.optBoolean("unlocked", false); qrUrl = r.optString("qr_url", "");
                } catch (Exception ignored) {}
                final boolean done = ok; final String url = qrUrl;
                ui.post(() -> {
                    if (!"unlock".equals(screen) || unlocked) return;
                    if (unlockQr != null && url.startsWith("https://bmsupport.uk/") && !url.equals(unlockQrUrl)) {
                        unlockQrUrl = url; unlockQr.setImageBitmap(qr(url, dp(170)));
                        unlockQr.setVisibility(View.VISIBLE); unlockQrText.setVisibility(View.VISIBLE);
                    }
                    if (done) { unlocked = true; rememberUnlock(); ((PlayerApplication) getApplication()).refreshMajor(); showHome(); syncFavourites(null); ProgressSync.pull(this, true, () -> { if ("home".equals(screen)) showHome(); }); }
                    else pollRemoteUnlock(go, status);
                });
            });
        }, 3000);
    }

    private void showHome() {
        stopPreview(); stopMulti(); // never keep a channel playing behind the main menu
        if (!unlocked && !rememberedUnlock()) { showUnlock(); return; }
        if (!PlayerApplication.pinPassed) { checkPin(); return; }
        screen = "home"; back = null; drawnVersion = appVersion();
        // Update check waits until the app is fully in (linked, unlocked, past the link screen), once per app start.
        if (!updateChecked) { updateChecked = true; checkForUpdate(false); }
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
        top.setPadding(0, 0, dp(PlayerApplication.MAJOR_ICON_SLOT_DP), 0); // the 📣 icon has its own corner
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
        small.addView(smallButton("🏆 Sports guide", v -> askSportsMode()), smallWeight("🏆 Sports guide"));
        small.addView(smallButton("★ Favourites", v -> showSaved("fav", "Favourites")), smallWeight("★ Favourites"));
        small.addView(smallButton("⟲ Recently watched", v -> showSaved("recent", "Recently watched")), smallWeight("⟲ Recently watched"));
        small.addView(smallButton("⚙ Settings", v -> showSettings()), smallWeight("⚙ Settings"));
        // Multi Room / Triple Room: show Multi-screen at once from the last account-info number so it never vanishes while (or if) the check is slow.
        int knownCons = prefs.getInt("max_cons", 0);
        if (knownCons >= 2) addMultiButton(small, knownCons);
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
                // The provider account info (same number as Settings > Account information) wins; the website package and the last saved number are only fallbacks.
                int saved = prefs.getInt("max_cons", 0);
                int provider = 0; try { provider = (int) Double.parseDouble(info.optString("max_connections", "0").trim()); } catch (Exception ignored) {}
                if (provider >= 2) { int pc = provider; prefs.edit().putInt("max_cons", pc).apply(); ui.post(() -> addMultiButton(small, pc)); }
                String[] rooms = roomsInfo();
                int pkg = 0; try { pkg = rooms[1].isEmpty() ? 0 : Integer.parseInt(rooms[1]); } catch (Exception ignored) {}
                int cons = provider >= 1 ? provider : pkg >= 1 && pkg <= 3 ? pkg : saved >= 1 ? saved : 1;
                line += " · " + cons + (cons == 1 ? " connection" : " connections");
                if (cons >= 2) line += rooms[0];
                String l = line;
                prefs.edit().putInt("max_cons", cons).apply();
                String base = line.substring(0, line.length() - (cons >= 2 ? rooms[0].length() : 0));
                ui.post(() -> {
                    account.setText(l);
                    if (cons >= 2) liveRooms(account, base);
                    if (cons >= 2) addMultiButton(small, cons);
                });
            } catch (Exception ignored) {}
        });
    }

    private void addMultiButton(LinearLayout small, int cons) {
        if (small.findViewWithTag("multi") != null) return;
        int n = Math.min(cons, 3);
        String ml = "🖥 Multi-screen (" + n + ")";
        Button mb = smallButton(ml, v -> chooseMultiScreens(Math.min(3, Math.max(2, prefs.getInt("max_cons", n)))));
        mb.setTag("multi");
        small.addView(mb, Math.min(1, small.getChildCount()), smallWeight(ml));
    }

    /** Multi Room / Triple Room: other boxes on this login that are watching now (blank if none or offline). */
    /** [who's watching line, package connections (Single 1, Multi Room 2, Triple Room 3) or ""]. */
    /** "Also watching on your login" refreshes every 5s while this home screen is showing. */
    private void liveRooms(TextView account, String base) {
        ui.postDelayed(() -> {
            if (!"home".equals(screen) || !account.isAttachedToWindow()) return;
            safeRun(io, () -> {
                String[] r = roomsInfo();
                ui.post(() -> { if ("home".equals(screen) && account.isAttachedToWindow()) { account.setText(base + r[0]); liveRooms(account, base); } });
            });
        }, 5000);
    }

    private String[] roomsInfo() {
        try {
            JSONObject res = new JSONObject(Net.postJson(Net.SITE + "/api/public/player", new JSONObject()
                    .put("action", "rooms").put("device_token", prefs.getString("token", "")).put("login", prefs.getString("user", "")).toString()));
            int c = res.optInt("connections", 0);
            String pkg = c >= 1 && c <= 3 ? String.valueOf(c) : "";
            org.json.JSONArray rooms = res.optJSONArray("rooms");
            if (rooms == null || rooms.length() == 0) return new String[]{"", pkg};
            StringBuilder b = new StringBuilder("\nAlso watching on your login: ");
            for (int i = 0; i < rooms.length() && i < 5; i++) {
                JSONObject r = rooms.optJSONObject(i); if (r == null) continue;
                String t = r.isNull("title") ? "" : r.optString("title", "");
                if (i > 0) b.append(" · ");
                int sc = r.optInt("screens", 1);
                b.append(r.optString("name", "BM Player")).append(sc > 1 ? " (" + sc + " screens)" : "").append(t.isEmpty() ? "" : " – " + t);
            }
            return new String[]{b.toString(), pkg};
        } catch (Throwable e) { return new String[]{"", ""}; }
    }

    // ---------- browse ----------

    private String api(String action) throws Exception {
        String u = URLEncoder.encode(prefs.getString("user", ""), "UTF-8");
        String p = URLEncoder.encode(SecureLogin.password(prefs), "UTF-8");
        return prefs.getString("dns", "") + "/player_api.php?username=" + u + "&password=" + p + (action.isEmpty() ? "" : "&action=" + action);
    }

    private String streamUrl(Item it) { return streamUrls(it)[0]; }

    /** Addresses to try in order. Live tries MPEG-TS first (what most panels serve), then HLS. */
    private String[] streamUrls(Item it) {
        if (it.url != null && !it.url.isEmpty()) return new String[]{it.url};
        String d = prefs.getString("dns", "").replaceAll("/+$", ""), u = prefs.getString("user", ""), p = SecureLogin.password(prefs);
        switch (it.kind) {
            case "live": {
                String base = d + "/live/" + u + "/" + p + "/" + it.id;
                String f = prefs.getString("format", "auto");
                if (f.equals("ts")) return new String[]{base + ".ts"};
                if (f.equals("hls")) return new String[]{base + ".m3u8"};
                // Old learned ts/m3u8 swaps are ignored: always the playlist's own order.
                return new String[]{base + ".ts", base + ".m3u8", d + "/" + u + "/" + p + "/" + it.id};
            }
            case "film": return new String[]{d + "/movie/" + u + "/" + p + "/" + it.id + "." + (it.ext.isEmpty() ? "mp4" : it.ext)};
            default: return new String[]{d + "/series/" + u + "/" + p + "/" + it.id + "." + (it.ext.isEmpty() ? "mp4" : it.ext)};
        }
    }

    // ---------- live channel preview ----------

    private androidx.media3.exoplayer.ExoPlayer preview;
    private Runnable previewTask;
    private androidx.media3.ui.PlayerView previewView;
    private androidx.media3.common.Player.Listener previewListener, previewFallback;

    /** Hands the playing preview to full screen (no reconnect); false when it can't be carried over. */
    private boolean carryPreview(Item it) {
        boolean ready = preview != null && preview.getPlaybackState() == androidx.media3.common.Player.STATE_READY;
        if (!PreviewHandoff.canCarry(it.kind, previewItem == null ? null : previewItem.id, it.id, ready)) return false;
        androidx.media3.exoplayer.ExoPlayer p = preview;
        if (previewListener != null) p.removeListener(previewListener);
        if (previewFallback != null) p.removeListener(previewFallback);
        if (previewView != null) previewView.setPlayer(null);
        preview = null; previewListener = null; previewFallback = null;
        PreviewHandoff.offer(p, it.id);
        return true;
    }

    private boolean claimPass, previewClaimed;
    /** Another device on this login is watching: offer to move playback here. */
    private void askTakeover(Item it, String who, Runnable go) {
        int max = Math.max(1, prefs.getInt("max_cons", 1));
        new AlertDialog.Builder(this).setTitle("Your login is already watching")
                .setMessage(who + " Your login only allows " + max + (max == 1 ? " connection" : " connections") + ", so both can't play at once.")
                .setPositiveButton("Watch here instead", (d, w) -> StreamClaim.check(this, it.kind, it.name, true, (b, x) -> go.run()))
                .setNegativeButton("Cancel", null).show();
    }
    private void stopPreview() {
        if (previewTask != null) ui.removeCallbacks(previewTask);
        previewTask = null;
        if (preview != null) { preview.release(); preview = null; }
        if (previewPoster != null) previewPoster.setVisibility(View.VISIBLE);
        // A preview that was actually playing counts as Live TV viewing; stop counting when it ends.
        // Only clear the note while it still belongs to the preview: real playback (or VLC) started
        // from a preview replaces it first (np_preview=false), and onPause runs stopPreview after
        // that — wiping it there would leave Live connections blind for the whole watch.
        if (previewStopClearsNowPlaying(previewCounted, prefs.getBoolean("np_preview", false))) clearNowPlaying();
        previewCounted = false;
        previewStopped();
    }
    private boolean previewCounted;

    private Button boxCatPill; // TV box Live TV: category pill after the day jumps
    private Button previewMenuButton; // phone Live TV: the button under the selected category
    private boolean previewPlaying;

    /**
     * Phone Live TV: once a preview kicks in, the preview box and the button beneath the category
     * details both bring up that channel's play menu instead of previewing again.
     */
    void previewStarted() {
        previewPlaying = true;
        updateKeepScreenOn();
        if (previewMenuButton != null) previewMenuButton.setText("▶ Play menu");
    }

    void previewStopped() {
        previewPlaying = false;
        updateKeepScreenOn();
        if (previewMenuButton != null) previewMenuButton.setText("▶ Preview channel");
    }

    /** Starts the small preview a moment after the highlight settles, so scrolling stays smooth. */
    private Item previewItem;
    private View previewPoster;
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
        play(cur, defaultVlc()); // full screen carries the playing preview over
    }


    private void schedulePreview(Item it, androidx.media3.ui.PlayerView view, TextView status) {
        stopPreview();
        previewItem = it;
        if (previewPoster != null) previewPoster.setVisibility(View.GONE);
        status.setText("Loading preview…");
        previewTask = () -> {
            if (!previewClaimed) {
                Runnable again = previewTask;
                StreamClaim.check(this, it.kind, it.name, false, (busy, who) -> {
                    if (previewTask != again) return;
                    if (!busy) { previewClaimed = true; again.run(); return; }
                    status.setText("Your login is watching on another device");
                    askTakeover(it, who, () -> { if (previewTask == again) { previewClaimed = true; again.run(); } });
                });
                return;
            }
            previewClaimed = false;
            preview = PlayerActivity.build(this, false, it.name + " " + categoryName(it));
            previewView = view;
            view.setPlayer(preview);
            preview.addListener(previewListener = new androidx.media3.common.Player.Listener() {
                @Override public void onPlaybackStateChanged(int s) {
                    if (s == androidx.media3.common.Player.STATE_READY) {
                        status.setText("Press OK twice for full screen");
                        if (!previewCounted) { previewCounted = true; setNowPlaying(it, false, true); }
                        previewStarted();
                    } else if (s == androidx.media3.common.Player.STATE_ENDED && preview != null) {
                        // Live preview dropped by the provider: reopen it instead of sitting frozen.
                        preview.seekToDefaultPosition(); preview.prepare(); preview.play();
                    }
                }
            });
            previewFallback = PlayerActivity.playWithFallback(preview, streamUrls(it),
                    () -> status.setText("Preview unavailable – press OK to play full screen"));
        };
        ui.postDelayed(previewTask, 700);
    }

    @Override protected void onPause() { super.onPause(); saveGuide(); stopPreview(); if ("multi".equals(screen)) { stopMulti(); showHome(); } }

    private String liveCatId = "*";

    private void browse(String kind) {
        // Phones: Live TV is the guide screen (preview, View EPG pop-up). TV boxes keep the original
        // categories | channels | preview + Now/Up next layout, with the 📅 EPG pill for the full guide.
        if (kind.equals("live")) { showTvGuide(liveCatId, true); return; }
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
        int maxCons = Math.min(3, prefs.getInt("max_cons", 1));
        if (kind.equals("live") && maxCons >= 2) head.addView(headerPill("🖥 Multi-screen (" + maxCons + ")", v -> chooseMultiScreens(maxCons)));
        // Films/Series: the Category pill sits at the top beside the searches (no category column).
        final Button catPill = kind.equals("live") ? null : headerPill("☰ Category: All", v -> {});
        if (catPill != null) head.addView(catPill);
        head.addView(headerPill("🔍 Search " + (kind.equals("live") ? "TV" : kind.equals("film") ? "Movies" : "Series"), v -> showSearch(kind, "")));
        head.addView(headerPill("🎤 Voice search", v -> startVoice(kind)));
        // Films/Series: Sort is an icon pill straight after Voice search (no sort row).
        final Runnable[] openSort = new Runnable[1];
        if (!kind.equals("live")) { Button sp = headerPill("⇅", v -> { if (openSort[0] != null) openSort[0].run(); }); sp.setContentDescription("Sort"); head.addView(sp); }
        head.setPadding(0, 0, dp(PlayerApplication.MAJOR_ICON_SLOT_DP), 0);

        root.addView(head);
        TextView epg = text(kind.equals("live") ? "Pick a category" : "", 15, MUTED, false);
        root.addView(epg);
        // Films/Series details panel: the highlighted title's backdrop, rating · year · length · genre, cast, director and plot.
        // Films/Series: posters fill the screen; pressing one opens its details (review, cast, plot) with the play options.
        final MediaHero hero = null;
        stopPreview();
        LinearLayout panes = row();
        ListView cats = list();
        final boolean posters = !kind.equals("live");
        final AbsListView items = posters ? posterGrid() : list();
        final List<Item> shown = new ArrayList<>();
        final String[] sortKey = { prefs.getString("sort_" + kind, "added") };
        final Runnable[] applySort = new Runnable[1];
        if (posters) {
            String[][] opts = {{"default", "Default"}, {"added", "Recently added"}, {"az", "A–Z"}, {"za", "Z–A"}, {"rating", "Top rated"}};
            openSort[0] = () -> {
                String[] labels = new String[opts.length]; int sel = 0;
                for (int i = 0; i < opts.length; i++) { labels[i] = opts[i][1]; if (opts[i][0].equals(sortKey[0])) sel = i; }
                new android.app.AlertDialog.Builder(this).setTitle("Sort by").setSingleChoiceItems(labels, sel, (d, w) -> {
                    sortKey[0] = opts[w][0]; prefs.edit().putString("sort_" + kind, opts[w][0]).apply();
                    if (applySort[0] != null) applySort[0].run();
                    d.dismiss();
                }).show();
            };
        }
        final TextView gridTitle = text("", 17, TEXT, true);
        if (posters) {
            // Poster grid runs the full width under its category name; categories come from the top pill.
            LinearLayout gcol = column();
            gcol.addView(gridTitle);
            gcol.addView(items, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
            panes.addView(gcol, weight(1, ViewGroup.LayoutParams.MATCH_PARENT));
        } else {
            panes.addView(cats, weight(1, ViewGroup.LayoutParams.MATCH_PARENT));
            panes.addView(items, weight(1.3f, ViewGroup.LayoutParams.MATCH_PARENT));
        }
        androidx.media3.ui.PlayerView pv = null;
        TextView pvStatus = null, pvEpg = null;
        if (kind.equals("live")) {
            LinearLayout side = column();
            side.setPadding(16, 0, 0, 0);
            side.addView(text("Preview", 18, TEXT, true));
            pv = new androidx.media3.ui.PlayerView(this);
            pv.setErrorMessageProvider(e -> android.util.Pair.create(0, SafeError.PLAYBACK));
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
            android.widget.FrameLayout pvFrame = new android.widget.FrameLayout(this);
            pvFrame.addView(pv, new android.widget.FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            android.widget.FrameLayout poster = new android.widget.FrameLayout(this);
            android.widget.ImageView posterImg = new android.widget.ImageView(this);
            posterImg.setImageResource(R.drawable.preview_family);
            posterImg.setScaleType(android.widget.ImageView.ScaleType.CENTER_CROP);
            poster.addView(posterImg, new android.widget.FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            pvFrame.addView(poster, new android.widget.FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            previewPoster = poster; previewItem = null;
            side.addView(pvFrame, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(200)));
            pvFrame.addOnLayoutChangeListener((v, l, t, r, b2, ol, ot, or, ob) -> {
                int h = (r - l) * 9 / 16;
                if (side.getHeight() > 0) h = Math.min(h, side.getHeight() * 2 / 5);
                if (h > 0 && Math.abs(v.getHeight() - h) > 2) { ViewGroup.LayoutParams lp = v.getLayoutParams(); lp.height = h; v.post(() -> v.setLayoutParams(lp)); }
            });
            pvStatus = text("Press OK on a channel to preview it · press OK twice on the preview for full screen", 14, MUTED, false);
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
            for (Item it : currentList) if (q.isEmpty() || LiveSearch.matches(it.name, q)) out.add(it);
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
                    if (posters && catPill != null) catPill.requestFocus(); // Films/Series open on the Category pill
                    else if (focusItems) items.requestFocus();
                });
                if (!kind.equals("live")) {
                    epg.setText(c[1] + " · " + list.size() + " titles");
                    gridTitle.setText(c[1].equals("All") ? (kind.equals("film") ? "All movies" : "All series") : c[1]);
                    if (catPill != null) catPill.setText("☰ Category: " + c[1]);
                    if (hero != null) hero.show(shown.isEmpty() ? null : shown.get(0));
                }

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
                JSONArray a = orderedCategories(kind, new JSONArray(cachedGet(kind, catAction, "")));
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
                    cats.setSelection(0);
                    showCat.accept(0, posters);
                    if (!posters) cats.requestFocus();
                    if (catPill != null) catPill.setOnClickListener(v -> new AlertDialog.Builder(this).setTitle("Category")
                            .setItems(names.toArray(new String[0]), (d, w) -> showCat.accept(w, true)).show());
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
            // Live TV: the first OK/tap on a channel previews it; OK again on the previewing channel opens its menu.
            if (previewView != null && (previewItem == null || !it.id.equals(previewItem.id))) {
                loadEpg(it, epg, previewEpg); schedulePreview(it, previewView, previewStatus); return;
            }
            open(it);
        });
        if (posters) items.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            @Override public void onItemSelected(AdapterView<?> p, View v, int pos, long id) {
                if (items.isInTouchMode() || v == null) return;
                // Keep the whole highlighted card (ring included) on screen: scroll by exactly what is hidden.
                items.post(() -> {
                    int pad = dp(8), top = v.getTop() - pad, bottom = v.getBottom() + pad, h = items.getHeight();
                    if (bottom > h) items.smoothScrollBy(bottom - h, 160);
                    else if (top < 0) items.smoothScrollBy(top, 160);
                });
            }
            @Override public void onNothingSelected(AdapterView<?> p) {}
        });
        if (kind.equals("live")) items.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            @Override public void onItemSelected(AdapterView<?> p, View v, int pos, long id) {
                Item it = (Item) items.getItemAtPosition(pos);
                if (items.hasFocus() && !restoring[0]) livePos[0] = pos;
                loadEpg(it, epg, previewEpg);
            }
            @Override public void onNothingSelected(AdapterView<?> p) {}
        });
    }

    private boolean isPhone() { return getResources().getConfiguration().smallestScreenWidthDp < 600; }

    private final java.util.Map<String, JSONObject> heroInfo = new java.util.HashMap<>();

    /** Films/Series top panel: backdrop on the right, details on the left; details load once per title (cached). */
    private final class MediaHero {
        final android.widget.FrameLayout view = new android.widget.FrameLayout(MainActivity.this);
        final android.widget.ImageView backdrop = new android.widget.ImageView(MainActivity.this);
        final TextView title = text("", 22, TEXT, true), meta = text("", 14, MUTED, false), people = text("", 14, TEXT, false), plot = text("", 14, TEXT, false);
        String showing = "";
        Runnable pending;
        MediaHero() {
            backdrop.setScaleType(android.widget.ImageView.ScaleType.CENTER_CROP); backdrop.setAlpha(0.35f);
            android.widget.FrameLayout.LayoutParams blp = new android.widget.FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
            view.addView(backdrop, blp);
            LinearLayout col = column(); col.setPadding(dp(4), dp(4), dp(4), dp(4));
            title.setSingleLine(true); title.setEllipsize(android.text.TextUtils.TruncateAt.END);
            meta.setSingleLine(true); people.setMaxLines(2); people.setEllipsize(android.text.TextUtils.TruncateAt.END);
            plot.setMaxLines(isPhone() ? 4 : 6); plot.setEllipsize(android.text.TextUtils.TruncateAt.END);
            col.addView(title); col.addView(meta); col.addView(people); col.addView(plot);
            meta.setEllipsize(android.text.TextUtils.TruncateAt.END);
            col.setPadding(dp(10), dp(8), dp(10), dp(10));
            view.setMinimumHeight(dp(isPhone() ? 110 : 150));
            view.addView(col, new android.widget.FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        }
        void show(Item it) {
            if (it == null) { title.setText(""); meta.setText(""); people.setText(""); plot.setText(""); backdrop.setImageDrawable(null); showing = ""; return; }
            String key = it.kind + ":" + it.id;
            if (key.equals(showing)) return;
            showing = key;
            title.setText(it.name); meta.setText(ratingText(it)); people.setText(""); plot.setText("");
            loadPoster(backdrop, it.poster);
            if (pending != null) ui.removeCallbacks(pending);
            JSONObject cached = heroInfo.get(key);
            if (cached != null) { fill(it, cached); return; }
            pending = () -> posterIo.execute(() -> {
                try {
                    String url = it.kind.equals("series") ? api("get_series_info") + "&series_id=" + it.id : api("get_vod_info") + "&vod_id=" + it.id;
                    JSONObject info = new JSONObject(Net.get(url)).optJSONObject("info");
                    if (info == null) return;
                    heroInfo.put(key, info);
                    ui.post(() -> { if (key.equals(showing)) fill(it, info); });
                } catch (Exception ignored) {}
            });
            ui.postDelayed(pending, 300);
        }
        void fill(Item it, JSONObject i) {
            List<String> m = new ArrayList<>();
            String rating = i.optString("rating", ""); if (!rating.isEmpty() && !rating.equals("0")) m.add("★ " + rating);
            String date = i.optString("releasedate", i.optString("releaseDate", "")); if (date.length() >= 4) m.add(date.substring(0, 4));
            String dur = i.optString("duration", ""); if (!dur.isEmpty() && !dur.startsWith("00:00")) m.add(dur.replaceFirst("^0?(\\d+):(\\d+):\\d+$", "$1h $2m"));
            String genre = i.optString("genre", ""); if (!genre.isEmpty()) m.add(genre);
            m.add(ratingText(it));
            meta.setText(android.text.TextUtils.join("  ·  ", m));
            String cast = i.optString("cast", i.optString("actors", "")), dir = i.optString("director", "");
            people.setText((cast.isEmpty() ? "" : "Cast: " + cast) + (dir.isEmpty() ? "" : (cast.isEmpty() ? "" : "\n") + "Director: " + dir));
            plot.setText(i.optString("plot", i.optString("description", "")));
            JSONArray bd = i.optJSONArray("backdrop_path");
            if (bd != null && bd.length() > 0 && !bd.optString(0).isEmpty()) loadPoster(backdrop, bd.optString(0));
        }
    }

    private Item itemFrom(String kind, JSONObject o, String category, int pos) {
        String sid = kind.equals("series") ? o.optString("series_id") : o.optString("stream_id");
        Item it = new Item(kind, sid, o.optString("name"), o.optString("container_extension"), category == null ? o.optString("category_id") : category);
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
    private JSONArray fixtureListings(Item it) {
        return FixtureGuide.listings(it.name, () -> new JSONObject(Net.postJson(Net.SITE + "/api/public/player",
                new JSONObject().put("action", "guide").put("device_token", prefs.getString("token", "")).put("channel", it.name).toString())));
    }
    private void loadEpg(Item it, TextView out, TextView box) {
        if (box != null) box.setText("TV guide for " + it.name + "…");
        io.execute(() -> {
            try {
                JSONArray l = fixtureListings(it);
                if (l == null) l = new JSONObject(Net.get(api("get_short_epg") + "&stream_id=" + it.id + "&limit=6")).optJSONArray("epg_listings");
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
            String[] o2 = {"▶ Continue watching · " + time + " (" + WatchProgress.percent(pos, dur) + "%)", "Play from beginning", fav};
            if ("film".equals(it.kind)) o2 = java.util.Arrays.copyOf(o2, o2.length + 1);
            if ("film".equals(it.kind)) o2[o2.length - 1] = "☆ Vote";
            final boolean cast2 = platform().equals("phone");
            if (cast2) { o2 = java.util.Arrays.copyOf(o2, o2.length + 1); o2[o2.length - 1] = "📺 Cast to TV"; }
            final int cast2At = o2.length - 1;
            new AlertDialog.Builder(this).setCustomTitle(filmDetails(it)).setItems(o2, (d, w) -> {
                if (cast2 && w == cast2At) castToTv(it);
                else if (w == 0) startPlayback(it, defaultVlc(), pos);
                else if (w == 1) startPlayback(it, defaultVlc(), 0);
                else if (w == 2) toggleSaved("fav", it);
                else showVote(it);
            }).show();
            return;
        }
        String[] opts = "film".equals(it.kind) ? new String[]{"Play", fav, "☆ Vote"} : new String[]{"Play", fav};
        final boolean cast = platform().equals("phone");
        if (cast) { opts = java.util.Arrays.copyOf(opts, opts.length + 1); opts[opts.length - 1] = "📺 Cast to TV"; }
        final int castAt = opts.length - 1;
        new AlertDialog.Builder(this).setCustomTitle(filmDetails(it)).setItems(opts, (d, w) -> {
            if (cast && w == castAt) castToTv(it);
            else if (w == 0) play(it, defaultVlc());
            else if (w == 1) toggleSaved("fav", it);
            else showVote(it);
        }).show();
    }

    /** Film details shown above the play options: backdrop, rating · year · length · genre, cast, director, plot. */
    private View filmDetails(Item it) {
        MediaHero h = new MediaHero(); h.show(it);
        h.view.setPadding(dp(8), dp(8), dp(8), dp(4));
        return h.view;
    }

    /** Phone: find DLNA smart TVs on the same Wi-Fi and send this item's stream to the chosen one. */
    void castToTv(Item it) {
        AlertDialog wait = new AlertDialog.Builder(this).setTitle("Cast to TV")
                .setMessage("Looking for TVs on your Wi-Fi…").setNegativeButton("Cancel", null).show();
        new Thread(() -> {
            android.net.wifi.WifiManager wm = (android.net.wifi.WifiManager) getApplicationContext().getSystemService(WIFI_SERVICE);
            android.net.wifi.WifiManager.MulticastLock lock = wm == null ? null : wm.createMulticastLock("bm-cast");
            if (lock != null) { lock.setReferenceCounted(false); lock.acquire(); }
            List<DlnaCast.Tv> tvs;
            try { tvs = DlnaCast.discover(); } finally { if (lock != null) lock.release(); }
            final List<DlnaCast.Tv> found = tvs;
            ui.post(() -> {
                if (!wait.isShowing()) return;
                wait.dismiss();
                if (found.isEmpty()) {
                    new AlertDialog.Builder(this).setTitle("Cast to TV")
                            .setMessage("No TVs found. Make sure the TV is switched on, on the same Wi-Fi, and has screen sharing / DLNA turned on.")
                            .setPositiveButton("Try again", (d, w) -> castToTv(it)).setNegativeButton("Close", null).show();
                    return;
                }
                String[] names = new String[found.size()];
                for (int i = 0; i < names.length; i++) names[i] = found.get(i).name;
                new AlertDialog.Builder(this).setTitle("Pick a TV").setItems(names, (d, w) -> sendToTv(found.get(w), it))
                        .setNegativeButton("Cancel", null).show();
            });
        }).start();
    }

    private void sendToTv(DlnaCast.Tv tv, Item it) {
        if (previewPlaying) stopPreview();
        Toast.makeText(this, "Sending to " + tv.name + "…", Toast.LENGTH_SHORT).show();
        String url = streamUrl(it);
        new Thread(() -> {
            try {
                DlnaCast.cast(tv, url, it.name);
                ui.post(() -> new AlertDialog.Builder(this).setTitle("Casting to " + tv.name)
                        .setMessage(it.name + " is playing on your TV.")
                        .setPositiveButton("Stop casting", (d, w) -> new Thread(() -> { try { DlnaCast.stop(tv); } catch (Exception ignored) {} }).start())
                        .setNegativeButton("Close", null).show());
            } catch (Exception e) {
                ui.post(() -> new AlertDialog.Builder(this).setTitle("Cast to TV")
                        .setMessage(tv.name + " couldn't play this. Some TVs don't support this kind of stream.")
                        .setPositiveButton("OK", null).show());
            }
        }).start();
    }

    private void showSeries(Item show) {
        back = () -> browse("series");
        // Layout: full-screen backdrop, details top-left (title, rating · year · seasons · genre, cast, plot),
        // then one row per season ("Season N" + a sideways row of episode picture cards with a "1 / 12" counter).
        android.widget.FrameLayout frame = new android.widget.FrameLayout(this);
        frame.setBackgroundColor(BG);
        android.widget.ImageView backdrop = new android.widget.ImageView(this);
        backdrop.setScaleType(android.widget.ImageView.ScaleType.CENTER_CROP); backdrop.setAlpha(0.45f);
        frame.addView(backdrop, new android.widget.FrameLayout.LayoutParams(-1, -1));
        loadPoster(backdrop, show.poster);
        View shade = new View(this);
        shade.setBackground(new GradientDrawable(GradientDrawable.Orientation.LEFT_RIGHT, new int[]{BG, Color.argb(170, Color.red(BG), Color.green(BG), Color.blue(BG)), Color.TRANSPARENT}));
        frame.addView(shade, new android.widget.FrameLayout.LayoutParams(-1, -1));
        android.widget.ScrollView scroll = new android.widget.ScrollView(this);
        scroll.setFillViewport(true);
        LinearLayout root = column(); root.setPadding(dp(28), dp(18), dp(28), dp(18));
        scroll.addView(root);
        frame.addView(scroll, new android.widget.FrameLayout.LayoutParams(-1, -1));
        int w = (int) (getResources().getDisplayMetrics().widthPixels * 0.55f);
        TextView title = text(show.name, 30, TEXT, true); title.setSingleLine(true); title.setEllipsize(android.text.TextUtils.TruncateAt.END);
        root.addView(title, new LinearLayout.LayoutParams(w, -2));
        TextView meta = text("", 15, TEXT, false); root.addView(meta, new LinearLayout.LayoutParams(w, -2));
        seriesRatingItem = show; seriesRatingLabel = text(ratingText(show), 13, MUTED, false); root.addView(seriesRatingLabel); requestRating(show);
        TextView cast = text("", 14, TEXT, false); cast.setMaxLines(1); cast.setEllipsize(android.text.TextUtils.TruncateAt.END);
        root.addView(cast, new LinearLayout.LayoutParams(w, -2));
        TextView plot = text("", 14, TEXT, false); plot.setMaxLines(3); plot.setEllipsize(android.text.TextUtils.TruncateAt.END);
        root.addView(plot, new LinearLayout.LayoutParams(w, -2));
        LinearLayout btns = row();
        Button firstAction = button(isSaved("fav", show) ? "★ Remove favourite" : "☆ Add favourite", v -> toggleSaved("fav", show));
        btns.addView(firstAction);
        btns.addView(button("☆ Vote", v -> showVote(show)));
        btns.addView(button("⚠ Report a problem", v -> showReport(show)));
        root.addView(btns);
        TextView info = text("Loading episodes…", 15, MUTED, false);
        root.addView(info);
        LinearLayout seasonsBox = column();
        LinearLayout.LayoutParams slp = new LinearLayout.LayoutParams(-1, -2); slp.topMargin = dp(10);
        root.addView(seasonsBox, slp);
        setContentView(frame);
        firstAction.requestFocus();
        scroll.post(() -> scroll.scrollTo(0, 0));
        io.execute(() -> {
            try {
                JSONObject r = new JSONObject(Net.get(api("get_series_info") + "&series_id=" + show.id));
                JSONObject m = r.optJSONObject("info");
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
                            String name = "E" + e.optString("episode_num") + ". " + e.optString("title");
                            Item ep = new Item("episode", e.optString("id"), name, e.optString("container_extension"), show.category);
                            ep.seriesId = show.id;
                            ep.epNum = e.optString("episode_num", "").trim();
                            ep.epTitle = e.optString("title", "").trim();
                            JSONObject ei = e.optJSONObject("info");
                            if (ei != null) ep.poster = ei.optString("movie_image");
                            l.add(ep);
                        }
                        bySeason.put(num, l);
                    }
                }
                String cover = m == null ? "" : m.optString("cover");
                JSONArray bd = m == null ? null : m.optJSONArray("backdrop_path");
                String back2 = bd != null && bd.length() > 0 ? bd.optString(0) : "";
                List<String> parts = new ArrayList<>();
                if (m != null) {
                    String rt = m.optString("rating", ""); if (!rt.isEmpty() && !rt.equals("0")) parts.add("★ " + rt);
                    String d = m.optString("releaseDate", m.optString("releasedate", "")); if (d.length() >= 4) parts.add(d.substring(0, 4));
                }
                parts.add(bySeason.size() + (bySeason.size() == 1 ? " season" : " seasons"));
                if (m != null && !m.optString("genre").isEmpty()) parts.add(m.optString("genre"));
                String castTxt = m == null ? "" : m.optString("cast", "");
                String story = m == null ? "" : m.optString("plot");
                ui.post(() -> {
                    if (!back2.isEmpty()) loadPoster(backdrop, back2);
                    else if ((show.poster == null || show.poster.isEmpty()) && !cover.isEmpty()) loadPoster(backdrop, cover);
                    meta.setText(android.text.TextUtils.join("  •  ", parts));
                    cast.setText(castTxt.isEmpty() ? "" : "Cast: " + castTxt);
                    plot.setText(story);
                    info.setVisibility(bySeason.isEmpty() ? View.VISIBLE : View.GONE);
                    if (bySeason.isEmpty()) info.setText("No episodes for this series.");
                    for (java.util.Map.Entry<Integer, List<Item>> en : bySeason.entrySet()) {
                        seasonsBox.addView(seasonRow(show, en.getKey(), en.getValue()));
                    }
                });
            } catch (Exception ex) { ui.post(() -> info.setText("Couldn't load episodes.")); }
        });
    }

    /** One season: heading, "n / total" counter, sideways row of episode picture cards (OK plays). */
    private View seasonRow(Item show, int season, List<Item> eps) {
        LinearLayout box = column();
        LinearLayout head = row(); head.setGravity(Gravity.CENTER_VERTICAL);
        head.addView(text("Season " + season, 19, TEXT, true));
        head.addView(new View(this), new LinearLayout.LayoutParams(0, 1, 1));
        TextView count = text("1 / " + eps.size(), 14, TEXT, false);
        head.addView(count);
        box.addView(head);
        android.widget.HorizontalScrollView hs = new android.widget.HorizontalScrollView(this);
        hs.setHorizontalScrollBarEnabled(false); hs.setClipToPadding(false);
        LinearLayout strip = row(); strip.setPadding(dp(4), dp(6), dp(4), dp(10));
        hs.addView(strip);
        int cw = dp(200), ch = dp(112);
        for (int i = 0; i < eps.size(); i++) {
            Item ep = eps.get(i); final int idx = i;
            LinearLayout card = column(); card.setPadding(dp(4), dp(4), dp(4), dp(4));
            card.setBackground(posterCardBg()); card.setFocusable(true); card.setClickable(true);
            android.widget.ImageView img = new android.widget.ImageView(this);
            img.setScaleType(android.widget.ImageView.ScaleType.FIT_CENTER); img.setBackgroundColor(Color.rgb(20, 28, 48));
            card.addView(img, new LinearLayout.LayoutParams(-1, ch));
            loadPoster(img, ep.poster == null || ep.poster.isEmpty() ? show.poster : ep.poster);
            boolean numbered = ep.epNum != null && !ep.epNum.isEmpty();
            if (numbered) {
                TextView no = text("Episode " + ep.epNum, 11, MUTED, true);
                no.setSingleLine(true); no.setPadding(dp(4), dp(4), dp(4), 0);
                card.addView(no);
            }
            String epTitle = EpisodeName.clean(ep.epTitle, show.name);
            if (epTitle.isEmpty()) epTitle = numbered ? "" : (ep.epTitle == null || ep.epTitle.isEmpty() ? ep.name : ep.epTitle);
            TextView t = text(epTitle, 13, TEXT, false);
            t.setMaxLines(2); t.setEllipsize(android.text.TextUtils.TruncateAt.END);
            t.setPadding(dp(4), numbered ? 0 : dp(4), dp(4), 0);
            card.addView(t);
            LinearLayout wb = watchedBar(ep);
            if (wb != null) card.addView(wb);
            card.setOnFocusChangeListener((v, has) -> {
                if (!has) return;
                count.setText((idx + 1) + " / " + eps.size());
                int[] pos = new int[2]; v.getLocationOnScreen(pos);
                int sh = getResources().getDisplayMetrics().heightPixels;
                // Keep the whole season row (heading included) on screen while moving up/down.
                View sc = box; while (sc != null && !(sc instanceof android.widget.ScrollView)) sc = (View) sc.getParent();
                if (sc != null) { android.widget.ScrollView s2 = (android.widget.ScrollView) sc; int y = box.getTop() + ((View) box.getParent()).getTop() - dp(12);
                    if (pos[1] + v.getHeight() > sh - dp(12) || pos[1] < dp(12)) s2.smoothScrollTo(0, Math.max(0, y)); }
            });
            card.setOnClickListener(v -> {
                Item named = new Item(ep.kind, ep.id, show.name + " – " + ep.name, ep.ext, ep.category);
                named.poster = show.poster; named.seriesId = show.id;
                play(named, false);
            });
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(cw, -2); lp.rightMargin = dp(12);
            strip.addView(card, lp);
        }
        box.addView(hs);
        return box;
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
        if (!vlc && !claimPass) {
            StreamClaim.check(this, it.kind, it.name, false, (busy, who) -> {
                if (!busy) { claimPass = true; beginPlayback(it, false, position, subtitles); return; }
                askTakeover(it, who, () -> { claimPass = true; beginPlayback(it, false, position, subtitles); });
            });
            return;
        }
        claimPass = false;
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
            if (!"off".equals(SoundBoost.current(this))) Toast.makeText(this, "Sound booster doesn't work in VLC – use VLC's own volume.", Toast.LENGTH_LONG).show();
            vlcCatchup = "catchup".equals(it.kind) ? it : null; vlcStarted = android.os.SystemClock.elapsedRealtime();
            // Live: VLC gets the channel's next address and software decoding on each retry, then BM Player takes over.
            if ("live".equals(it.kind)) {
                if (vlcLive != it) { vlcLive = it; vlcLiveTry = 0; }
                // VLC rejects the provider's raw .ts live address ("location couldn't be played"), so it starts on HLS.
                String[] urls = vlcLiveOrder(streamUrls(it));
                i.setDataAndTypeAndNormalize(Uri.parse(urls[Math.min(vlcLiveTry, urls.length - 1)]), "video/*");
                if (vlcLiveTry > 0) i.putExtra("disable_hardware", true);
                i.removeExtra("position"); i.removeExtra("from_start");
            } else vlcLive = null;
            // Close the preview's provider connection first and give the panel a moment to drop it:
            // with a 1-connection login, VLC opening while the preview still holds the stream gets refused.
            boolean hadPreview = preview != null;
            stopPreview(); stopMulti();
            ui.postDelayed(() -> {
                try { startActivityForResult(i, VLC_REQUEST); }
                catch (Exception e) {
                    new AlertDialog.Builder(this).setTitle("VLC isn't installed")
                            .setMessage("Install VLC from your app store (or Downloader) to use it as the player. Playing in BM Player instead.")
                            .setPositiveButton("OK", (d, w) -> beginPlayback(it, false, position, subtitles)).show();
                }
            }, hadPreview ? 1500 : 0);
            return;
        }
        Intent intent = new Intent(this, PlayerActivity.class).putExtra("url", url)
                .putExtra("content_kind", it.kind).putExtra("content_id", it.id).putExtra("content_name", it.name)
                .putExtra("report_kind", savedKind(it)).putExtra("report_category", categoryName(it))
                .putExtra("report_device", deviceLabel()).putExtra("report_version", appVersion());
        intent.putExtra("recovery_name", it.name + " " + categoryName(it));
        if ("live".equals(it.kind) && retryEvent != null && liveChannels != null) {
            List<String> labels = new ArrayList<>(); List<Item> targets = new ArrayList<>();
            buildSportsRows(retryEvent, retryAliases == null ? new ArrayList<>() : retryAliases, liveChannels, labels, targets);
            JSONArray alternatives = new JSONArray();
            for (Item candidate : targets) if (candidate != null && !candidate.id.equals(it.id)) {
                try { alternatives.put(new JSONObject().put("id", candidate.id).put("name", candidate.name)
                    .put("recovery_name", candidate.name + " " + categoryName(candidate)).put("urls", new JSONArray(java.util.Arrays.asList(streamUrls(candidate))))); } catch (Exception ignored) {}
            }
            intent.putExtra("event_name", retryEvent.optString("title")).putExtra("event_alternatives", alternatives.toString());
        }
        if ("live".equals(it.kind)) intent.putExtra("urls", streamUrls(it));
        if ("live".equals(it.kind)) intent.putExtra("swap_options", swapOptions(it));
        if ("live".equals(it.kind) && liveChannels != null && StreamRecovery.isHdName(it.name)) {
            for (Item o : liveChannels) {
                if (o != it && !o.id.equals(it.id) && o.norm().equals(it.norm()) && !StreamRecovery.isHdName(o.name)) {
                    intent.putExtra("sd_urls", streamUrls(o)).putExtra("sd_name", o.name); break;
                }
            }
        }
        if ("catchup".equals(it.kind) && it.catchupEnd > it.catchupStart) {
            // Providers often close timeshift streams early; the player reconnects from where it stopped.
            intent.putExtra("catchup_prefix", prefs.getString("dns", "").replaceAll("/+$", "") + "/timeshift/" + prefs.getString("user", "") + "/" + SecureLogin.password(prefs) + "/")
                    .putExtra("catchup_id", it.catchupId).putExtra("catchup_start", it.catchupStart).putExtra("catchup_end", it.catchupEnd)
                    .putExtra("catchup_tz", prefs.getString("server_tz", "Europe/London"));
        }
        if (WatchProgress.eligible(it.kind)) {
            intent.putExtra("subtitles", 2);
            intent.putExtra("progress_key", watchKey(it.kind, it.id)).putExtra("resume_ms", position);
            if (!it.seriesId.isEmpty()) intent.putExtra("series_key", watchKey("series", it.seriesId));
        }
        // Free the preview's decoder and provider connection before the full-screen player opens:
        // UHD channels need the device's only 4K decoder, and a still-held preview makes full screen fail.
        // The playing preview of this same channel goes full screen as it is: no reconnect, no second load.
        if (carryPreview(it)) { intent.putExtra("carried", true); stopPreview(); stopMulti(); startActivity(intent); return; }
        boolean hadPreview = preview != null;
        stopPreview(); stopMulti();
        if (hadPreview) ui.postDelayed(() -> startActivity(intent), 600); else startActivity(intent);
    }

    private static final int VLC_REQUEST = 4242;
    private Item vlcLive; private int vlcLiveTry;
    static String[] vlcLiveOrder(String[] urls) {
        java.util.List<String> out = new java.util.ArrayList<>();
        for (String u : urls) if (u.endsWith(".m3u8")) out.add(u);
        for (String u : urls) if (!u.endsWith(".m3u8")) out.add(u);
        return out.toArray(new String[0]);
    }
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
        // Fullscreen/edge-to-edge windows on modern phones ignore pan and resize, so measure the keypad
        // ourselves and shrink the pop-up to exactly the space above it, then scroll the box into view.
        if (Build.VERSION.SDK_INT >= 30) {
            View decor = w.getDecorView();
            decor.setOnApplyWindowInsetsListener((v, ins) -> {
                int ime = ins.getInsets(android.view.WindowInsets.Type.ime()).bottom;
                int screenH = getResources().getDisplayMetrics().heightPixels;
                int room = screenH - ime - dp(24);
                android.view.WindowManager.LayoutParams a = w.getAttributes();
                int want = ime > 0 && room > dp(80) ? room : android.view.ViewGroup.LayoutParams.WRAP_CONTENT;
                if (a.height != want) w.setLayout(a.width, want);
                if (ime > 0 && in != null) v.post(() -> {
                    android.graphics.Rect r = new android.graphics.Rect();
                    in.getDrawingRect(r);
                    in.requestRectangleOnScreen(r, true);
                });
                return v.onApplyWindowInsets(ins);
            });
            decor.requestApplyInsets();
        }
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
            // Fullscreen windows are never resized for the keypad on any version, so always lift.
            int lift = keypadLift(ime, nav);
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
            else if ("live".equals(kind)) runLiveVoiceSearch(want);
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
                for (Item it : all) if (it.name != null && (kind.equals("live") ? LiveSearch.matches(it.name, want) : it.name.toLowerCase(java.util.Locale.UK).contains(w))) hits.add(it);
                java.util.Map<String, String> searchCategories = new java.util.HashMap<>();
                if (kind.equals("live")) {
                    JSONArray cats = new JSONArray(cachedGet("live", "get_live_categories", ""));
                    for (int i = 0; i < cats.length(); i++) {
                        JSONObject cat = cats.optJSONObject(i);
                        if (cat != null) searchCategories.put(cat.optString("category_id"), cat.optString("category_name"));
                    }
                }
                ui.post(() -> {
                    if (hits.isEmpty()) { Toast.makeText(this, "Nothing found for \"" + want + "\"", Toast.LENGTH_LONG).show(); showSearch(kind, ""); return; }
                    String[] names = new String[hits.size()];
                    for (int i = 0; i < names.length; i++) names[i] = hits.get(i).name;
                    resultList(hits.size() + " results for \"" + want + "\"", hits.size(), i -> {
                                LinearLayout row = column();
                                if (kind.equals("live")) {
                                    ChannelNameView name = new ChannelNameView(this);
                                    name.setText(names[i]); name.setTextSize(16); name.setTextColor(TEXT);
                                    row.addView(name);
                                } else row.addView(text(names[i], 16, TEXT, false));
                                if (kind.equals("live")) {
                                    String category = hits.get(i).category;
                                    String label = searchCategories.get(category);
                                    if (label == null || label.isEmpty()) label = category != null && !category.matches("\\d+") ? category : "Uncategorised";
                                    row.addView(text(label, 13, MUTED, false));
                                }
                                // Films show how much has been watched; series show it per episode on their own page.
                                if (kind.equals("film")) row.addView(watchedBar(hits.get(i)));
                                return row;
                            }, i -> { Item it = hits.get(i); if (kind.equals("series")) showSeries(it); else open(it); },
                            null, null, "New search", () -> showSearch(kind, ""));
                });
            } catch (Exception ex) { ui.post(() -> Toast.makeText(this, "Couldn't search – try refreshing your playlist", Toast.LENGTH_LONG).show()); }
        });
    }
    private int liveVoiceRequest;
    private void runLiveVoiceSearch(String spoken) {
        int request = ++liveVoiceRequest;
        AlertDialog wait = new AlertDialog.Builder(this).setMessage("Searching categories and TV channels…")
                .setNegativeButton("Cancel", (d, w) -> liveVoiceRequest++).create();
        wait.setOnCancelListener(d -> liveVoiceRequest++); wait.show();
        io.execute(() -> {
            try {
                JSONArray channels = new JSONArray(cachedGet("live", "get_live_streams", ""));
                JSONArray categories = new JSONArray(cachedGet("live", "get_live_categories", ""));
                List<LiveVoiceSearch.Row> rows = LiveVoiceSearch.results(categories, channels, spoken);
                ui.post(() -> {
                    dismissQuietly(wait);
                    if (request != liveVoiceRequest || isFinishing()) return;
                    resultList("Voice results for \"" + spoken + "\"", rows.size(), i -> {
                        LiveVoiceSearch.Row hit = rows.get(i);
                        LinearLayout row = column();
                        ChannelNameView name = new ChannelNameView(this);
                        name.setText(hit.title); name.setTextSize(hit.selectable() ? 16 : 14); name.setTextColor(hit.selectable() ? TEXT : MUTED);
                        row.addView(name);
                        if (!hit.subtitle.isEmpty()) row.addView(text(hit.subtitle, 13, MUTED, false));
                        return row;
                    }, i -> {
                        LiveVoiceSearch.Row hit = rows.get(i);
                        if (hit.value == null) return;
                        if (hit.group.equals("Categories")) showTvGuide(hit.value.optString("category_id"), true);
                        else if (hit.group.equals("TV channels")) open(liveItem(hit.value));
                    }, "🎤 Search again", () -> startVoice("live"), "Close", null, i -> rows.get(i).selectable());
                });
            } catch (Exception ex) { ui.post(() -> { dismissQuietly(wait); if (request == liveVoiceRequest) Toast.makeText(this, "Couldn’t search — try refreshing your playlist", Toast.LENGTH_LONG).show(); }); }
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
                else if ("live".equals(kind)) runLiveVoiceSearch(r.get(0));
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
        if (req == VLC_REQUEST && vlcLive != null) {
            Item lv = vlcLive;
            long pos = data == null ? -1 : data.getLongExtra("extra_position", -1);
            if (!CatchupFallback.vlcFailed(res, android.os.SystemClock.elapsedRealtime() - vlcStarted, pos)) { vlcLive = null; return; }
            if (++vlcLiveTry < Math.min(3, streamUrls(lv).length)) { beginPlayback(lv, true, 0, false); return; }
            vlcLive = null;
            Toast.makeText(this, "VLC couldn't play this channel (VLC code " + res + "), playing it in BM Player instead", Toast.LENGTH_LONG).show();
            beginPlayback(lv, false, 0, false);
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
        boolean done = WatchProgress.finished(position, duration);
        String label = done ? "\u2713 Watched" : WatchProgress.percent(position, duration) + "% watched";
        if ("series".equals(it.kind) && duration > 0) label = "Last episode · " + label;
        box.addView(text(label, 12, done ? Color.rgb(83, 212, 163) : MUTED, done));
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
                final String fe = err == null ? null : SafeError.forScreen(err, "Couldn't send your report. Check your internet and try again.");
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

    /** External VLC is gone from the app: BM Player plays everything, with its built-in backup engine. */
    private boolean defaultVlc() { return false; }

    /** SHA-256 of the app's signing certificate, so the website can refuse altered copies. */
    private String appSignature() {
        try {
            android.content.pm.Signature[] sigs;
            if (android.os.Build.VERSION.SDK_INT >= 28) {
                android.content.pm.PackageInfo pi = getPackageManager().getPackageInfo(getPackageName(), PackageManager.GET_SIGNING_CERTIFICATES);
                sigs = pi.signingInfo.getApkContentsSigners();
            } else {
                sigs = getPackageManager().getPackageInfo(getPackageName(), PackageManager.GET_SIGNATURES).signatures;
            }
            byte[] d = java.security.MessageDigest.getInstance("SHA-256").digest(sigs[0].toByteArray());
            StringBuilder sb = new StringBuilder();
            for (byte x : d) sb.append(String.format("%02x", x));
            return sb.toString();
        } catch (Exception e) { return ""; }
    }

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

        String[] playerL = {"BM Player (built-in, with backup engine)"}, playerV = {"internal"};
        String[] fmtL = {"Auto", "MPEG-TS (.ts)", "HLS (.m3u8)"}, fmtV = {"auto", "ts", "hls"};
        String[] bufL = StreamRecovery.BUFFER_LABELS, bufV = StreamRecovery.BUFFER_IDS;
        String[] decL = {"Hardware", "Software"}, decV = {"hardware", "software"};
        String[] uaL = {"Standard", "BM Player", "IPTV Smarters"}, uaV = {PlayerActivity.UA, "BMPlayer/" + appVersion(), "IPTVSmartersPlayer"};

        List<View> boxes = new ArrayList<>();
        for (String kind : new String[]{"live", "film", "series"}) {
            boxes.add(settingBox("⇅", sectionName(kind) + " categories", "Rearrange categories", v -> editCategoryOrder(kind)));
        }
        boxes.add(settingBox("📡", "Stream format", label("format", "auto", fmtL, fmtV),
                v -> choose("Live stream format", "format", "auto", fmtL, fmtV)));
        boxes.add(settingBox("🛡", "Anti-Freeze: On", "Always on: unfreezes stuck pictures, reconnects drops, keeps live TV at now",
                v -> new AlertDialog.Builder(this).setTitle("Anti-Freeze: On")
                        .setMessage("BM Player watches every channel, film and episode while you watch. If the picture freezes, the stream drops or live TV falls behind, it quietly fixes it. It can't fix a slow internet connection or a problem at the provider.")
                        .setPositiveButton("OK", null).show()));
        boxes.add(settingBox("⏳", "Buffer size", label("buffer", StreamRecovery.DEFAULT_BUFFER, bufL, bufV),
                v -> choose("Buffer size", "buffer", StreamRecovery.DEFAULT_BUFFER, bufL, bufV)));
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
        boxes.add(settingBox("🔊", "Sound booster", SoundBoost.label(this), v ->
                new AlertDialog.Builder(this).setTitle("Sound booster")
                        .setSingleChoiceItems(SoundBoost.LABELS, SoundBoost.index(SoundBoost.current(this)), (d, w) -> {
                            SoundBoost.set(this, SoundBoost.IDS[w]); d.dismiss();
                            if (w == SoundBoost.IDS.length - 1) Toast.makeText(this, SoundBoost.HIGH_NOTE, Toast.LENGTH_LONG).show();
                            showSettings();
                        })
                        .setMessage(null).setNegativeButton("Cancel", null).show()));
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

    private JSONArray orderedCategories(String kind, JSONArray categories) throws Exception {
        List<String[]> ids = new ArrayList<>();
        java.util.Map<String, JSONObject> values = new java.util.HashMap<>();
        for (int i = 0; i < categories.length(); i++) {
            JSONObject o = categories.getJSONObject(i);
            String id = o.optString("category_id");
            ids.add(new String[]{id, o.optString("category_name")}); values.put(id, o);
        }
        JSONArray result = new JSONArray();
        for (String[] row : CategoryOrder.apply(ids, prefs.getString(CategoryOrder.key(prefs, kind), "[]"))) result.put(values.get(row[0]));
        return result;
    }

    private void editCategoryOrder(String kind) {
        Toast.makeText(this, "Loading categories…", Toast.LENGTH_SHORT).show();
        io.execute(() -> {
            try {
                JSONArray categories = new JSONArray(cachedGet(kind, catActionFor(kind), ""));
                List<String[]> original = new ArrayList<>();
                for (int i = 0; i < categories.length(); i++) {
                    JSONObject o = categories.getJSONObject(i);
                    if (!hideAdult(o.optString("category_name"))) original.add(new String[]{o.optString("category_id"), o.optString("category_name")});
                }
                ui.post(() -> {
                    if (!"settings".equals(screen)) return;
                    List<String[]> rows = CategoryOrder.apply(original, prefs.getString(CategoryOrder.key(prefs, kind), "[]"));
                    int[] selected = {0};
                    LinearLayout content = column();
                    ListView list = list();
                    content.addView(list, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(platform().equals("phone") ? 120 : 240)));
                    Runnable redraw = () -> {
                        List<String> names = new ArrayList<>();
                        for (int i = 0; i < rows.size(); i++) names.add((i + 1) + ". " + rows.get(i)[1]);
                        list.setAdapter(rowAdapter(names)); list.setChoiceMode(ListView.CHOICE_MODE_SINGLE);
                        if (!rows.isEmpty()) { list.setItemChecked(selected[0], true); list.setSelection(selected[0]); }
                    };
                    list.setOnItemClickListener((a,v,p,id) -> { selected[0] = p; list.setItemChecked(p, true); });
                    list.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
                        @Override public void onItemSelected(AdapterView<?> a, View v, int p, long id) { selected[0] = p; }
                        @Override public void onNothingSelected(AdapterView<?> a) {}
                    });
                    LinearLayout tools = row();
                    for (int delta : new int[]{-1, 1}) tools.addView(button(delta < 0 ? "↑ Move up" : "↓ Move down", v -> {
                        int target = selected[0] + delta;
                        if (target < 0 || target >= rows.size()) return;
                        java.util.Collections.swap(rows, selected[0], target); selected[0] = target; redraw.run();
                    }), weight(1, ViewGroup.LayoutParams.WRAP_CONTENT));
                    content.addView(tools);
                    content.addView(button("↺ Reset order", v -> { rows.clear(); rows.addAll(original); selected[0] = 0; redraw.run(); }));
                    redraw.run();
                    new AlertDialog.Builder(this).setTitle(sectionName(kind) + " category order").setView(content)
                        .setPositiveButton("Save", (d,w) -> { CategoryOrder.save(prefs, kind, rows); Toast.makeText(this, "Category order saved", Toast.LENGTH_SHORT).show(); })
                        .setNegativeButton("Cancel", null).show();
                });
            } catch (Exception e) { ui.post(() -> Toast.makeText(this, "Couldn't load categories. Try Refresh.", Toast.LENGTH_LONG).show()); }
        });
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
        if (!linkVerified || !hasLogin() || !unlocked || !PlayerApplication.pinPassed || maintenance) return;
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

    /** Every startup refreshes all sections, regardless of previous refresh dates. */
    private void autoUpdatePlaylists() {
        List<String> due = startupPlaylists.claim(linkVerified && hasLogin() && unlocked && PlayerApplication.pinPassed && !maintenance);
        if (!due.isEmpty()) updatePlaylists(due, true);
    }
    private final StartupPlaylists startupPlaylists = new StartupPlaylists();
    private volatile boolean linkVerified;

    // ---------- maintenance ----------

    /** Crashes Java can't catch (native decoder crash, out of memory, frozen app): Android keeps the reason; report each once. */
    private String lastSystemExit() {
        if (Build.VERSION.SDK_INT < 30) return "";
        try {
            android.app.ActivityManager am = (android.app.ActivityManager) getSystemService(ACTIVITY_SERVICE);
            java.util.List<android.app.ApplicationExitInfo> list = am.getHistoricalProcessExitReasons(null, 0, 1);
            if (list.isEmpty()) return "";
            android.app.ApplicationExitInfo e = list.get(0);
            int r = e.getReason();
            boolean bad = r == android.app.ApplicationExitInfo.REASON_CRASH_NATIVE || r == android.app.ApplicationExitInfo.REASON_CRASH
                    || r == android.app.ApplicationExitInfo.REASON_LOW_MEMORY || r == android.app.ApplicationExitInfo.REASON_ANR
                    || r == android.app.ApplicationExitInfo.REASON_EXCESSIVE_RESOURCE_USAGE || r == android.app.ApplicationExitInfo.REASON_SIGNALED;
            if (!bad || e.getTimestamp() <= prefs.getLong("exit_reported", 0)) return "";
            prefs.edit().putLong("exit_reported", e.getTimestamp()).apply();
            String trace = "";
            try (java.io.InputStream in = e.getTraceInputStream()) {
                if (in != null) { java.io.ByteArrayOutputStream bo = new java.io.ByteArrayOutputStream(); byte[] b = new byte[8192]; int n; while ((n = in.read(b)) > 0 && bo.size() < 400000) bo.write(b, 0, n); trace = bo.toString().replaceAll("[^\\x20-\\x7E\\n]", ""); int m = trace.indexOf("\"main\""); if (m >= 0) { trace = trace.substring(m); int end = trace.indexOf("\n\n"); if (end > 0) trace = trace.substring(0, end);
                    // Keep only the frames that say where BM Player itself was stuck (framework lines first fill the space).
                    StringBuilder k = new StringBuilder("\"main\" "); int shown = 0;
                    for (String line : trace.split("\n")) { String t = line.trim(); if (!t.startsWith("at ")) continue;
                        if (shown < 2 || t.contains("uk.bmsupport") || t.contains("media3") || t.contains("android.view.") || t.contains("android.media")) { k.append(t.substring(3).replace("java:", "")).append(" | "); shown++; } }
                    trace = k.toString(); } }
            } catch (Exception ignored) {}
            String[] names = {"unknown","exit self","signaled","low memory","crash","native crash","ANR","init failure","permission change","excessive resources","user requested","user stopped","dependency died","other","freezer","package state","package updated"};
            String name = r < names.length ? names[r] : String.valueOf(r);
            return "App closed by Android (" + name + ", status " + e.getStatus() + ", memory " + (e.getPss() / 1024) + " MB) on " + Build.MANUFACTURER + " " + Build.MODEL + " Android " + Build.VERSION.RELEASE + ".\n" + (trace.startsWith("\"main\"") ? trace : e.getDescription() + "\n" + trace);
        } catch (Exception ex) { return ""; }
    }

    /** Sends the previous session's crash details to BM Support once, as a ticket. */
    private void sendLastCrash() {
        String crash = prefs.getString("last_crash", "");
        if (crash.isEmpty()) crash = lastSystemExit();
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
                // Same number the home screen and Multi-screen use.
                try { int mc = (int) Double.parseDouble(info.optString("max_connections", "0").trim()); if (mc >= 1) prefs.edit().putInt("max_cons", mc).apply(); } catch (Exception ignored) {}
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

    /** The automatic update check runs once per app start, only after the home screen is reached. */
    private boolean updateChecked;

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

    // Patterns are compiled once: compiling them per channel froze slow TV boxes (ANR) when searching 8,000+ channels.
    private static final java.util.regex.Pattern N_PUNCT = java.util.regex.Pattern.compile("[^a-z0-9+]+"),
            N_LD = java.util.regex.Pattern.compile("([a-z])(\\d)"), N_DL = java.util.regex.Pattern.compile("(\\d)([a-z])"),
            N_TAGS = java.util.regex.Pattern.compile("\\b(?:uk|gb|usa|us|ire|ie|ireland|au|aus|australia|ca|canada|za|south africa|nz|int|fhd|uhd|hd|sd|4k|hevc|h265|raw|backup|vip|channel|tv)\\b"),
            N_SPORTS = java.util.regex.Pattern.compile("\\bsports\\b"), N_ZERO = java.util.regex.Pattern.compile("\\b0+(\\d)"),
            N_COUPANG = java.util.regex.Pattern.compile("\\bcoupang\\s+play\\b"), N_SPACE = java.util.regex.Pattern.compile("\\s+");
    /** Mirrors src/lib/player-channel-match.ts normChannel. */
    /** Swap channel list: same Sports Guide event first, then other versions (UHD/HD/SD…) of this channel. */
    private String swapOptions(Item it) {
        List<ChannelSwap.Option> event = new ArrayList<>(), variants = new ArrayList<>();
        try {
            if (retryEvent != null && liveChannels != null) {
                List<String> labels = new ArrayList<>(); List<Item> targets = new ArrayList<>();
                buildSportsRows(retryEvent, retryAliases == null ? new ArrayList<>() : retryAliases, liveChannels, labels, targets);
                for (Item c : targets) if (c != null) event.add(new ChannelSwap.Option(c.id, c.name, c.name + " " + categoryName(c), streamUrls(c), true));
            }
            if (liveChannels != null && !it.norm().isEmpty())
                for (Item o : liveChannels) if (o != null && o.norm().equals(it.norm())) variants.add(new ChannelSwap.Option(o.id, o.name, o.name + " " + categoryName(o), streamUrls(o), false));
            JSONArray out = new JSONArray();
            for (ChannelSwap.Option o : ChannelSwap.build(it.id, event, variants, sportsDown))
                out.put(new JSONObject().put("id", o.id).put("name", o.name).put("recovery_name", o.recoveryName).put("down", o.down)
                    .put("label", ChannelSwap.label(o)).put("urls", new JSONArray(java.util.Arrays.asList(o.urls))));
            return out.toString();
        } catch (Exception e) { return "[]"; }
    }

    static String normChannel(String name) {
        String s = name.toLowerCase(java.util.Locale.ROOT);
        s = N_PUNCT.matcher(s).replaceAll(" ").replace("+", " plus ");
        s = N_DL.matcher(N_LD.matcher(s).replaceAll("$1 $2")).replaceAll("$1 $2");
        s = N_TAGS.matcher(s).replaceAll(" ");
        s = N_ZERO.matcher(N_SPORTS.matcher(s).replaceAll("sport")).replaceAll("$1");
        s = N_COUPANG.matcher(s).replaceAll("coupang");
        return N_SPACE.matcher(s).replaceAll(" ").trim();
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
    /** Website "Channel linking" country rule: the playlist name must carry that tag, e.g. "US | Paramount+ 3". */
    static boolean channelInCountry(String name, String country) {
        if (country == null || country.isEmpty()) return true;
        return java.util.regex.Pattern.compile("(^|[^A-Z0-9])" + java.util.regex.Pattern.quote(country.toUpperCase(java.util.Locale.ROOT)) + "([^A-Z0-9]|$)")
                .matcher(name == null ? "" : name.toUpperCase(java.util.Locale.ROOT)).find();
    }
    private static final java.util.regex.Pattern DAILY_NUM = java.util.regex.Pattern.compile("^\\s*0*(\\d{1,4})\\s*\\|");
    private static final java.util.regex.Pattern BOXING_FEED = java.util.regex.Pattern.compile("^boxing\\s+(\\d+)\\b");
    static List<Item> matchChannel(String guide, List<Item> playlist, List<String[]> aliases) {
        java.util.Map<String, String> am = aliasMap(aliases);
        String want = alias(normChannel(guide == null ? "" : guide), am);
        List<Item> out = new ArrayList<>();
        if (want.isEmpty()) return out;
        // Programme/replay names are mutable metadata, not feed identity.
        java.util.regex.Matcher boxing = BOXING_FEED.matcher(normChannel((guide == null ? "" : guide).split("\\|", 2)[0]));
        if (boxing.find()) {
            int number = Integer.parseInt(boxing.group(1));
            for (Item it : playlist) {
                java.util.regex.Matcher feed = BOXING_FEED.matcher(normChannel((it.name == null ? "" : it.name).split("\\|", 2)[0]));
                if (feed.find() && Integer.parseInt(feed.group(1)) == number) out.add(it);
            }
            return out;
        }
        // Daily Sports: guide says "Channel 07"; the feed's name is "07 | 12:00 Trackside Live!" (changes daily).
        if (want.matches("\\d+")) {
            int n = Integer.parseInt(want);
            for (Item it : playlist) { java.util.regex.Matcher m = DAILY_NUM.matcher(it.name == null ? "" : it.name); if (m.find() && Integer.parseInt(m.group(1)) == n) out.add(it); }
            return out;
        }
        for (Item it : playlist) if (alias(it.norm(), am).equals(want)) out.add(it);
        if (!out.isEmpty()) {
            java.util.Collections.sort(out, (x, y) -> quality(y.name) != quality(x.name) ? quality(y.name) - quality(x.name) : x.name.length() - y.name.length());
            return out;
        }
        // Every word of the guide name appears in the playlist name; fewest extra words first.
        String[] words = want.split(" ");
        boolean guideHasNumber = false;
        for (String w : words) if (w.matches("\\d+")) { guideHasNumber = true; break; }
        final java.util.Map<Item, Integer> extra = new java.util.HashMap<>();
        for (Item it : playlist) {
            java.util.List<String> t = java.util.Arrays.asList(it.norm().split(" "));
            boolean all = true;
            if (!guideHasNumber) for (String w : t) if (w.matches("\\d+")) { all = false; break; }
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
        String d = prefs.getString("dns", "").replaceAll("/+$", ""), u = prefs.getString("user", ""), p = SecureLogin.password(prefs);
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
                    play(c, false);
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
    private final java.util.Map<String, Long> guideFetchedAt = new java.util.HashMap<>();
    private final java.util.Set<String> guideFullFetched = new java.util.HashSet<>();
    private final java.util.Map<String, Long> guideCoveredTo = new java.util.HashMap<>();
    private String guideScope = null;
    private java.io.File guideFile() {
        String scope = prefs.getString("dns", "").replaceAll("/+$", "") + "\n" + prefs.getString("user", "");
        return new java.io.File(new java.io.File(getCacheDir(), "guide"), Integer.toHexString(scope.hashCode()) + ".json");
    }
    /** Saved listings show straight away; with no fetch time they still refresh quietly when the row is seen. */
    private void restoreGuide() {
        String scope = guideFile().getName();
        if (scope.equals(guideScope)) return;
        guideScope = scope;
        guideCache.clear(); guideFetchedAt.clear(); guideFullFetched.clear(); guideCoveredTo.clear();
        try {
            java.io.File f = guideFile();
            if (!f.exists()) return;
            String text = new String(java.nio.file.Files.readAllBytes(f.toPath()), "UTF-8");
            guideCache.putAll(GuideStore.decode(text, System.currentTimeMillis() / 1000));
        } catch (Exception ignored) {}
    }
    private void saveGuide() {
        if (guideScope == null || guideCache.isEmpty()) return;
        final String text = GuideStore.encode(new java.util.LinkedHashMap<>(guideCache), System.currentTimeMillis() / 1000);
        final java.io.File f = guideFile();
        if (!f.getName().equals(guideScope) || text.isEmpty()) return;
        guideIo.execute(() -> { try { f.getParentFile().mkdirs(); java.nio.file.Files.write(f.toPath(), text.getBytes("UTF-8")); } catch (Exception ignored) {} });
    }
    private long guideWindowSecs() { return getResources().getConfiguration().smallestScreenWidthDp < 600 ? 10800 : 7200; }

    /** Channels down the left, time across the top; OK on a programme on now watches it, on a future one sets/removes a reminder. */
    private void showTvGuide() { showTvGuide(null); }

    /** TV guide opened on one category (Live TV's EPG button); Back returns to Live TV. */
    private void showTvGuide(String startCat) { showTvGuide(startCat, false); }

    private void showTvGuide(String startCat, boolean live) {
        screen = "tvguide"; back = this::showHome;
        stopPreview();
        restoreGuide();
        LinearLayout root = column();
        LinearLayout head = row();
        // Phones reserve the guide for View EPG; TV boxes keep their always-visible grid.
        final boolean phoneLive = live && "phone".equals(platform());
        final boolean boxLive = live && !phoneLive;
        if (live && !boxLive) { head.setGravity(Gravity.CENTER_VERTICAL);
            head.addView(text("Live TV", 26, TEXT, true));
            head.addView(new View(this), new LinearLayout.LayoutParams(0, 1, 1));
            head.addView(headerPill("🔍 Search TV", v -> showSearch("live", "")));
            head.addView(headerPill("🎤 Voice search", v -> startVoice("live")));
            head.setPadding(0, 0, dp(PlayerApplication.MAJOR_ICON_SLOT_DP), 0);
            root.addView(head);
        }
        LinearLayout top = row();
        LinearLayout info = column();
        TextView heading = text(live ? ("phone".equals(platform()) ? "Current programme" : "Pick a programme") : "TV guide", live ? 16 : 26, live ? MUTED : TEXT, !live);
        TextView progTitle = text("Loading your channels…", 20, TEXT, true);
        TextView progTime = text("", 15, MUTED, false);
        TextView pvStatus = text("", 13, MUTED, false);
        info.addView(heading); info.addView(progTitle); info.addView(progTime);
        TextView selectedCategory = text("Category: All", 15, MUTED, false);
        // Phones: "Preview channel" loads the selected channel into the preview box; once it kicks in,
        // the box and the button both bring up that channel's play menu.
        final Runnable[] previewSelected = { null };
        if (phoneLive) {
            info.addView(selectedCategory);
            previewMenuButton = button("▶ Preview channel", v -> {
                if (previewPlaying && previewItem != null) open(previewItem);
                else if (previewSelected[0] != null) previewSelected[0].run();
            });
            info.addView(previewMenuButton);
        }
        LinearLayout btns = row();
        Button catBtn = button(live ? "☰ Categories: All" : "Category: All", v -> {});
        btns.addView(catBtn);
        // Live TV: categories open from the side Channels button, not from the Now/Day row.
        if (live) catBtn.setVisibility(View.GONE);
        btns.addView(button("Now", v -> {}));
        btns.addView(button("◀ Day", v -> {}));
        btns.addView(button("Day ▶", v -> {}));
        // Phones: the Now/Day controls move into the bigger-guide pop-up bar so the normal guide keeps the room.
        if (!phoneLive) info.addView(btns);
        LinearLayout side = column();
        // TV boxes (photo layout): preview on the left, programme info beside it with the search pills top right.
        LinearLayout boxInfo = column();
        TextView boxDesc = text("", 15, MUTED, false), boxNext = text("", 15, TEXT, false), boxCat = text("", 14, MUTED, false), boxStar = text("", 20, TEXT, false);
        android.widget.ProgressBar boxBar = new android.widget.ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        TextView dateLbl = text("", 18, ACCENT, true);
        if (boxLive) {
            info.removeView(progTitle); info.removeView(progTime);
            boxInfo.setPadding(dp(18), 0, dp(8), 0);
            boxInfo.setGravity(Gravity.TOP);
            top.setBaselineAligned(false); top.setGravity(Gravity.TOP);
            for (TextView t : new TextView[]{progTitle, progTime, boxDesc, boxNext, boxCat, boxStar}) { t.setPadding(t.getPaddingLeft(), dp(2), t.getPaddingRight(), dp(2)); t.setIncludeFontPadding(false); }
            LinearLayout pills = row(); pills.setGravity(Gravity.CENTER_VERTICAL | Gravity.END);
            pills.setPadding(0, 0, dp(PlayerApplication.MAJOR_ICON_SLOT_DP), 0);
            pills.addView(new View(this), new LinearLayout.LayoutParams(0, 1, 1));
            pills.addView(headerPill("🔍 Search TV", v -> showSearch("live", "")));
            pills.addView(headerPill("🎤 Voice search", v -> startVoice("live")));
            // A clear space between the pills and the programme title beneath them.
            LinearLayout.LayoutParams plp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            plp.bottomMargin = dp(14);
            boxInfo.addView(pills, plp);
            // Tight stack: every line wraps its own content (single line or a fixed limit), so nothing can stretch tall.
            final int wrap = ViewGroup.LayoutParams.WRAP_CONTENT, fill = ViewGroup.LayoutParams.MATCH_PARENT;
            progTitle.setTextSize(24); progTitle.setMaxLines(2); progTitle.setEllipsize(android.text.TextUtils.TruncateAt.END);
            boxInfo.addView(progTitle, new LinearLayout.LayoutParams(fill, wrap));
            // Time and minutes left share one line of text (no side-by-side views that can squeeze).
            progTime.setSingleLine(true); progTime.setEllipsize(android.text.TextUtils.TruncateAt.END);
            boxInfo.addView(progTime, new LinearLayout.LayoutParams(fill, wrap));
            boxBar.setMax(100); boxBar.setVisibility(View.GONE);
            LinearLayout.LayoutParams bp = new LinearLayout.LayoutParams(dp(160), dp(4)); bp.setMargins(0, dp(3), 0, dp(4));
            boxInfo.addView(boxBar, bp);
            boxDesc.setMaxLines(3); boxDesc.setEllipsize(android.text.TextUtils.TruncateAt.END);
            boxInfo.addView(boxDesc, new LinearLayout.LayoutParams(fill, wrap));
            boxNext.setSingleLine(true); boxNext.setEllipsize(android.text.TextUtils.TruncateAt.END);
            boxStar.setSingleLine(true); boxCat.setSingleLine(true); boxCat.setEllipsize(android.text.TextUtils.TruncateAt.END);
            boxCat.setMaxWidth(dp(220));
            LinearLayout br = row(); br.setGravity(Gravity.CENTER_VERTICAL); br.setBaselineAligned(false);
            br.addView(boxNext, new LinearLayout.LayoutParams(0, wrap, 1));
            boxStar.setPadding(dp(10), 0, dp(10), 0);
            br.addView(boxStar, new LinearLayout.LayoutParams(wrap, wrap)); br.addView(boxCat, new LinearLayout.LayoutParams(wrap, wrap));
            boxInfo.addView(br, new LinearLayout.LayoutParams(fill, wrap));
        } else top.addView(info, weight(1.6f, ViewGroup.LayoutParams.WRAP_CONTENT));
        androidx.media3.ui.PlayerView pv = new androidx.media3.ui.PlayerView(this);
        pv.setErrorMessageProvider(e -> android.util.Pair.create(0, SafeError.PLAYBACK));
        pv.setUseController(false); pv.setBackgroundColor(Color.BLACK); pv.setFocusable(false);
        pv.setResizeMode(androidx.media3.ui.AspectRatioFrameLayout.RESIZE_MODE_FILL);
        pv.setShutterBackgroundColor(Color.BLACK);
        if (live) {
            // Preview box sits above the guide and shows the family picture until a channel is OK'd.
            android.widget.FrameLayout pvFrame = new android.widget.FrameLayout(this);
            pvFrame.addView(pv, new android.widget.FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            android.widget.ImageView posterImg = new android.widget.ImageView(this);
            posterImg.setImageResource(R.drawable.preview_family);
            posterImg.setScaleType(android.widget.ImageView.ScaleType.CENTER_CROP);
            pvFrame.addView(posterImg, new android.widget.FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            previewPoster = posterImg; previewItem = null;
            posterImg.setVisibility(View.VISIBLE); posterImg.bringToFront();
            if (boxLive) {
                android.util.DisplayMetrics dm = getResources().getDisplayMetrics();
                int w = (int) (dm.widthPixels * 0.30f), h = w * 9 / 16, cap = (int) (dm.heightPixels * 0.32f);
                if (h > cap) { h = cap; w = h * 16 / 9; }
                side.addView(pvFrame, new LinearLayout.LayoutParams(w, h));
            } else side.addView(pvFrame, new LinearLayout.LayoutParams(dp(400), dp(225)));
            pvStatus.setText("OK on a programme that's on now to preview it · OK again for the channel menu");
            pvStatus.setMaxWidth(dp(400));
            if (phoneLive) {
                pvStatus.setVisibility(View.GONE); // phones: no instruction text under the picture
                android.view.GestureDetector tap = new android.view.GestureDetector(this, new android.view.GestureDetector.SimpleOnGestureListener() {
                    @Override public boolean onDown(android.view.MotionEvent e) { return true; }
                    @Override public boolean onSingleTapUp(android.view.MotionEvent e) {
                        // Once a preview is on the box, tapping it brings up that channel's play menu.
                        if (previewItem != null) open(previewItem);
                        else Toast.makeText(MainActivity.this, "Preview a channel first", Toast.LENGTH_SHORT).show();
                        return true;
                    }
                });
                pvFrame.setOnTouchListener((v, e) -> tap.onTouchEvent(e));
            }
        } else side.addView(pv, new LinearLayout.LayoutParams(dp(288), dp(162)));
        side.addView(pvStatus);
        if (boxLive) pvStatus.setVisibility(View.GONE);
        top.addView(side, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        if (boxLive) top.addView(boxInfo, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        root.addView(top);
        final Runnable[] dayBack = { null }, dayNow = { null }, dayFwd = { null };
        if (boxLive) {
            dateLbl.setText(new java.text.SimpleDateFormat("EEE, d MMM, " + ("12".equals(prefs.getString("time_format", "24")) ? "h:mm a" : "HH:mm"), java.util.Locale.UK).format(new java.util.Date()));
            dateLbl.setTextSize(15); dateLbl.setTextColor(TEXT); dateLbl.setPadding(0, 0, dp(10), 0);
            LinearLayout dr = row(); dr.setGravity(Gravity.CENTER_VERTICAL); dr.setBaselineAligned(false);
            dr.setPadding(0, dp(6), 0, dp(4));
            dr.addView(dateLbl);
            dr.addView(miniPill("📅 ◀ 24h", "Back 24 hours", () -> { if (dayBack[0] != null) dayBack[0].run(); }));
            dr.addView(miniPill("Now", "Back to now", () -> { if (dayNow[0] != null) dayNow[0].run(); }));
            dr.addView(miniPill("24h ▶", "Forward 24 hours", () -> { if (dayFwd[0] != null) dayFwd[0].run(); }));
            // Category pill straight after the day jumps: opens the category list; picking one loads its guide.
            boxCatPill = miniPill("☰ Category: All", "Choose a category", () -> catBtn.performClick());
            dr.addView(boxCatPill);
            root.addView(dr);
        }
        GuideGridView grid = new GuideGridView(this);
        // Phones: "Bigger guide" hides the preview and header so the guide fills the screen.
        LinearLayout bigBar = row(); bigBar.setGravity(Gravity.CENTER_VERTICAL);
        TextView guideTitle = text("TV guide", 20, TEXT, true);
        guideTitle.setSingleLine(true);
        guideTitle.setEllipsize(android.text.TextUtils.TruncateAt.END);
        bigBar.addView(guideTitle, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        // Phones: jump-to-now and day shifting live inside the bigger-guide pop-up.
        if (phoneLive) bigBar.addView(btns);
        bigBar.setPadding(0, 0, dp(PlayerApplication.MAJOR_ICON_SLOT_DP), 0);
        bigBar.setVisibility(View.GONE);
        root.addView(bigBar);
        Runnable closeBig = () -> { bigBar.setVisibility(View.GONE); grid.setVisibility(View.GONE); top.setVisibility(View.VISIBLE); head.setVisibility(View.VISIBLE); back = this::showHome; };
        bigBar.addView(headerPill("✕ Close", v -> closeBig.run()));
        if (phoneLive) {
            // Phones: no guide grid under the preview — "View EPG" (before Search TV) opens it full screen.
            head.addView(headerPill("View EPG", v -> {
                top.setVisibility(View.GONE); head.setVisibility(View.GONE); bigBar.setVisibility(View.VISIBLE);
                grid.setVisibility(View.VISIBLE);
                back = closeBig; grid.requestFocus();
            }), 2);
            grid.setVisibility(View.GONE);
        }
        root.addView(grid, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        // TV boxes: Left on the remote at "now" slides the categories out.

        dayBack[0] = () -> grid.shiftDay(-1);
        dayFwd[0] = () -> grid.shiftDay(1);
        dayNow[0] = () -> { grid.jumpNow(); grid.requestFocus(); };
        // The category list pops out from the left edge instead of a pop-up at the top.
        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setBackgroundColor(CARD);
        panel.setPadding(dp(18), dp(24), dp(18), dp(16));
        panel.addView(text("Categories", 22, TEXT, true));
        final List<Item> shownCh = new ArrayList<>();
        previewSelected[0] = () -> {
            int r = grid.selectedRow();
            if (r < 0 || r >= shownCh.size()) { Toast.makeText(this, "Pick a channel from Channels first", Toast.LENGTH_SHORT).show(); return; }
            schedulePreview(shownCh.get(r), pv, pvStatus);
        };
        android.widget.ListView catList = new android.widget.ListView(this);
        catList.setDivider(new android.graphics.drawable.ColorDrawable(0x1FFFFFFF));
        catList.setDividerHeight(1);
        catList.setFocusable(true);
        LiveChannelDrawer channelDrawer = live ? new LiveChannelDrawer(this, catList, pos -> {
            if (pos < 0 || pos >= shownCh.size()) return;
            Item ch = shownCh.get(pos);
            hidePanel();
            grid.selectChannel(pos);
            schedulePreview(ch, pv, pvStatus);
        }) : null;
        panel.addView(channelDrawer != null ? channelDrawer : catList,
                new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        panel.addView(button("Close", v -> hidePanel()));
        LinearLayout content = root;
        // TV boxes: no left-edge tab — categories open only from the Category pill after the day jumps.
        if (live && !boxLive) {
            content = row();
            // Edge tab like the website's "Order chat" side button: stuck to the left edge, vertically centred, vertical label.
            LinearLayout rail = new LinearLayout(this);
            rail.setOrientation(LinearLayout.VERTICAL);
            rail.setGravity(Gravity.CENTER_VERTICAL);
            rail.setBackgroundColor(BG);
            LinearLayout tab = new LinearLayout(this);
            tab.setOrientation(LinearLayout.VERTICAL);
            tab.setGravity(Gravity.CENTER_HORIZONTAL);
            tab.setPadding(dp(14), dp(28), dp(14), dp(28));
            tab.setFocusable(true);
            tab.setClickable(true);
            GradientDrawable tabOn = new GradientDrawable(); tabOn.setColor(ACCENT);
            tabOn.setCornerRadii(new float[]{0,0,dp(14),dp(14),dp(14),dp(14),0,0});
            tabOn.setStroke(dp(3), TEXT);
            GradientDrawable tabOff = new GradientDrawable(); tabOff.setColor(ACCENT);
            tabOff.setCornerRadii(new float[]{0,0,dp(14),dp(14),dp(14),dp(14),0,0});
            StateListDrawable tabBg = new StateListDrawable();
            tabBg.addState(new int[]{android.R.attr.state_focused}, tabOn);
            tabBg.addState(new int[]{android.R.attr.state_pressed}, tabOn);
            tabBg.addState(new int[]{}, tabOff);
            tab.setBackground(tabBg);
            TextView icon = new TextView(this);
            icon.setText("☰"); icon.setTextColor(TEXT); icon.setTextSize(18); icon.setGravity(Gravity.CENTER);
            tab.addView(icon);
            TextView vlabel = new TextView(this) {
                @Override protected void onMeasure(int w, int h) { super.onMeasure(h, w); setMeasuredDimension(getMeasuredHeight(), getMeasuredWidth()); }
                @Override protected void onDraw(android.graphics.Canvas c) { c.save(); c.translate(0, getHeight()); c.rotate(-90); c.translate(getCompoundPaddingLeft(), getExtendedPaddingTop()); getLayout().draw(c); c.restore(); }
            };
            vlabel.setText("Categories"); vlabel.setTextColor(TEXT); vlabel.setTextSize(15);
            vlabel.setTypeface(Typeface.DEFAULT_BOLD); vlabel.setSingleLine(true);
            LinearLayout.LayoutParams vlp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            vlp.topMargin = dp(8);
            tab.addView(vlabel, vlp);
            // Open as soon as a finger lands (no wait for lift/tap-slop) and let the whole edge strip act as the button.
            final long[] lastOpen = { 0 };
            Runnable openTab = () -> { long t = android.os.SystemClock.uptimeMillis(); if (t - lastOpen[0] < 400) return; lastOpen[0] = t; catBtn.performClick(); };
            tab.setOnClickListener(v -> openTab.run());
            View.OnTouchListener instant = (v, e) -> { if (e.getActionMasked() == android.view.MotionEvent.ACTION_DOWN) { tab.setPressed(true); openTab.run(); } else if (e.getActionMasked() == android.view.MotionEvent.ACTION_UP || e.getActionMasked() == android.view.MotionEvent.ACTION_CANCEL) tab.setPressed(false); return true; };
            tab.setOnTouchListener(instant);
            rail.setOnTouchListener(instant);
            rail.addView(tab, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));
            content.addView(rail, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.MATCH_PARENT));
            content.addView(root, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1));
        }
        FrameLayout guideScreen = sideDrawer(content, panel);
        if ("phone".equals(platform())) GuideSafeArea.apply(guideScreen);
        setContentView(guideScreen);
        btns.getChildAt(1).setOnClickListener(v -> { grid.jumpNow(); grid.requestFocus(); });
        btns.getChildAt(2).setOnClickListener(v -> grid.shiftDay(-1));
        btns.getChildAt(3).setOnClickListener(v -> grid.shiftDay(1));

        final List<String[]> catRows = new ArrayList<>();
        final java.util.Set<String> requested = new java.util.HashSet<>();
        final int[] gen = { 0 };
        final String[] previewPending = { null };
        java.util.function.Consumer<String[]> applyCat = cat -> {
            shownCh.clear(); requested.clear(); gen[0]++;
            for (Item it : liveChannels) if (cat[0].equals("*") || cat[0].equals(it.category)) shownCh.add(it);
            catBtn.setText((live ? "☰ Categories: " : "Category: ") + cat[1]);
            if (boxLive && boxCatPill != null) boxCatPill.setText("☰ Category: " + cat[1]);
            selectedCategory.setText("Category: " + cat[1]);
            guideTitle.setText("TV guide · " + cat[1]);
            if (live) liveCatId = cat[0];
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
            if (channelDrawer != null) channelDrawer.showCategories();
            showPanel();
            catList.requestFocus();
        });
        catList.setOnItemClickListener((d, w, pos, id) -> {
            if (pos >= catRows.size()) return;
            applyCat.accept(catRows.get(pos));
            // TV boxes: picking a category loads that category's channels into the guide and closes the panel.
            if (channelDrawer != null && !boxLive) {
                List<String> channelNames = new ArrayList<>();
                for (Item ch : shownCh) channelNames.add(ch.name);
                channelDrawer.showChannels(channelNames);
            } else {
                hidePanel();
                // Focus lands on the category's first channel in the guide, never the Search TV pill.
                if (!shownCh.isEmpty()) grid.selectChannel(0);
                grid.requestFocus();
                grid.post(grid::requestFocus);
            }
        });
        grid.setListener(new GuideGridView.Listener() {
            @Override public void needEpg(int r) {
                if (r < 0 || r >= shownCh.size()) return;
                Item it = shownCh.get(r);
                List<GuideGridView.Prog> c = guideCache.get(it.id);
                long nowS = System.currentTimeMillis() / 1000, win = guideWindowSecs();
                Long at = guideFetchedAt.get(it.id);
                long viewEnd = Math.max(nowS + win, grid.windowEnd());
                Long covered = guideCoveredTo.get(it.id);
                boolean fresh = c != null && at != null && (!GuideListings.stale(at, c, nowS, win, viewEnd, guideFullFetched.contains(it.id))
                        || (!c.isEmpty() && covered != null && viewEnd <= covered && nowS - at < GuideListings.REFRESH_SECS));
                if (c != null) { if (!grid.loaded(r)) grid.setProgs(r, c); if (fresh) return; }
                if (!requested.add(it.id)) return;
                final int g = gen[0];
                guideIo.execute(() -> {
                    long now = System.currentTimeMillis() / 1000;
                    List<GuideGridView.Prog> got = new ArrayList<>();
                    boolean ok = false, full0 = false;
                    JSONArray fixtures = fixtureListings(it);
                    if (fixtures != null) { got = GuideListings.parse(fixtures, now); ok = true; full0 = true; }
                    // Ordinary and unmatched channels retain provider short/full-day EPG.
                    if (fixtures == null) {
                    try {
                        got = GuideListings.parse(new JSONObject(Net.get(api("get_short_epg") + "&stream_id=" + it.id + "&limit=30")).optJSONArray("epg_listings"), now);
                        ok = true;
                    } catch (Exception ignored) {}
                    // Some providers only send "now" in the short list; the full day's table has the rest.
                    // Day ▶ / swiping ahead needs programmes beyond the short list, so ask for the full table too.
                    // The whole day is a big download: only ask for it when the short list is empty or the guide was moved ahead.
                    if (GuideListings.needsFull(got, now, win, viewEnd)) try {
                        List<GuideGridView.Prog> full = GuideListings.parse(new JSONObject(Net.get(api("get_simple_data_table") + "&stream_id=" + it.id)).optJSONArray("epg_listings"), now);
                        if (full.size() > got.size()) got = full;
                        ok = true; full0 = true;
                    } catch (Exception ignored) {}
                    }
                    if (got.isEmpty()) {
                        GuideGridView.Prog event = EventChannel.programme(it.name, now);
                        if (event != null) { got.add(event); ok = true; full0 = true; }
                    }
                    final List<GuideGridView.Prog> res = got; final boolean fetched = ok, gotFull = full0;
                    ui.post(() -> {
                        requested.remove(it.id);
                        if (!fetched) return;
                        List<GuideGridView.Prog> got2 = res;
                        guideFetchedAt.put(it.id, System.currentTimeMillis() / 1000);
                        guideCoveredTo.put(it.id, Math.max(System.currentTimeMillis() / 1000 + win, viewEnd));
                        if (gotFull) guideFullFetched.add(it.id); else guideFullFetched.remove(it.id);
                        guideCache.put(it.id, got2);
                        if (g == gen[0] && "tvguide".equals(screen)) grid.setProgs(r, got2);
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
                    if (boxLive) {
                        boolean live2 = on && p.en > now;
                        String left = live2 ? ((p.en - now + 59) / 60) + " min left" : p.en > p.st ? ((p.en - p.st) / 60) + " min" : "";
                        progTime.setText(clock(p.st) + (p.en > 0 ? " – " + clock(p.en) : "") + (left.isEmpty() ? "" : "  ·  " + left));
                        boxBar.setVisibility(live2 ? View.VISIBLE : View.GONE);
                        if (live2) boxBar.setProgress((int) ((now - p.st) * 100 / Math.max(1, p.en - p.st)));
                        boxDesc.setText(p.desc == null || p.desc.isEmpty() ? (ch.archiveDays > 0 && on ? "Press ◀ for Catch up" : "") : p.desc);
                        GuideGridView.Prog nx = null;
                        List<GuideGridView.Prog> lst = guideCache.get(ch.id);
                        if (lst != null) for (GuideGridView.Prog q : lst) if (q.st >= (p.en > 0 ? p.en : p.st + 1)) { nx = q; break; }
                        boxNext.setText(nx == null ? "" : "Next:  " + clock(nx.st) + "  " + nx.title);
                        boxStar.setText(isSaved("fav", ch) ? "★" : "☆");
                        String cn = "";
                        for (String[] c : catRows) if (c[0].equals(ch.category)) { cn = c[1]; break; }
                        boxCat.setText(cn);
                        dateLbl.setText(new java.text.SimpleDateFormat("EEE, d MMM, " + ("12".equals(prefs.getString("time_format", "24")) ? "h:mm a" : "HH:mm"), java.util.Locale.UK).format(new java.util.Date()));
                    } else
                    progTime.setText(ch.name + "  ·  " + clock(p.st) + (p.en > 0 ? " – " + clock(p.en) : "")
                            + (ch.archiveDays > 0 && on ? "   ·  🕘 ◀ for Catch up" : "")
                            + (on ? "   ·  On now – OK to watch" : MainActivity.this.hasReminder(ch.id, p.st) ? "   ·  ⏰ Reminder set – OK to remove" : "   ·  OK to set a reminder"));
                }
                if (live) return; // Live TV never starts a preview on highlight.
                if (previewPending[0] != null && previewPending[0].equals(ch.id)) return;
                previewPending[0] = ch.id;
                schedulePreview(ch, pv, pvStatus);
            }
            @Override public void onPick(int r, GuideGridView.Prog p) {
                if (r < 0 || r >= shownCh.size()) return;
                Item ch = shownCh.get(r);
                long now = System.currentTimeMillis() / 1000;
                if (GuideReminder.eligible(p, now)) {
                    Runnable redraw = () -> { grid.invalidate(); onHighlight(r, p); };
                    if (MainActivity.this.hasReminder(ch.id, p.st)) confirmRemoveReminder(ch, p.title, p.st, redraw);
                    else confirmAddReminder(ch, p.title, p.st, redraw);
                    return;
                }
                if (p != null && p.st > now) return;
                if (live) {
                    // Only current programmes/channel names start previews; reminders returned above.
                    if (previewItem == null || !ch.id.equals(previewItem.id)) { schedulePreview(ch, pv, pvStatus); return; }
                    if (p == null || p.st <= now) { open(ch); return; }
                }
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
                showCatchup(ch, live ? () -> browse("live") : MainActivity.this::showTvGuide);
            }
        });
        io.execute(() -> {
            try {
                JSONArray ca = orderedCategories("live", new JSONArray(cachedGet("live", "get_live_categories", "")));
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

    /** Sports guide: day pills + website Category pop-up on top, one card per game on the left, its channels on the right. */
    private void showSports() {
        screen = "sports";
        stopSports();
        back = () -> { stopSports(); retryEvent = null; showHome(); };
        stopPreview();
        LinearLayout root = column();
        root.setPadding(dp(24), dp(16), dp(24), dp(16));
        TextView status = text("", 13, MUTED, false);
        root.addView(sportsHeader(status), new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        sportsDays = row();
        sportsDays.setGravity(Gravity.CENTER_VERTICAL);
        sportsDays.setPadding(0, dp(4), 0, dp(8));
        root.addView(sportsDays);
        LinearLayout body = row();
        body.setBaselineAligned(false);
        ListView lv = list();
        lv.setTag("sports");
        lv.setVerticalFadingEdgeEnabled(false);
        lv.setOnFocusChangeListener((v, focused) -> {
            if (focused) lv.post(() -> revealSportsCard(lv));
        });
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1.15f);
        lp.setMargins(0, 0, dp(12), 0);
        body.addView(lv, lp);
        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        GradientDrawable pbg = new GradientDrawable(); pbg.setColor(CARD); pbg.setCornerRadius(dp(12));
        panel.setBackground(pbg);
        panel.setPadding(dp(14), dp(10), dp(14), dp(10));
        sportsPanelTitle = text("", 19, TEXT, true);
        sportsPanelTitle.setMaxLines(2); sportsPanelTitle.setEllipsize(android.text.TextUtils.TruncateAt.END);
        sportsPanelSub = text("", 13, MUTED, false);
        panel.addView(sportsPanelTitle); panel.addView(sportsPanelSub);
        sportsChannelList = list();
        sportsChannelList.setBackgroundColor(Color.TRANSPARENT);
        panel.addView(sportsChannelList, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        body.addView(panel, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1f));
        root.addView(body, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        setContentView(root);
        sportsList = lv;
        sportsVersion = "";
        String cached = prefs.getString("sports_cache", "");
        if (!cached.isEmpty()) try { renderSports(new JSONObject(cached)); } catch (Exception ignored) {}
        loadSports(status, false, true);
        sportsTask = new Runnable() { @Override public void run() {
            if (!"sports".equals(screen)) return;
            loadSports(status, false);
            ui.postDelayed(this, Checkin.delay(60000));
        } };
        ui.postDelayed(sportsTask, 60000);
    }
    /** Keep the header bounded even when the website supplies a long competition name. */
    private LinearLayout sportsHeader(TextView status) {
        LinearLayout head = row();
        head.setBaselineAligned(false);
        head.setGravity(Gravity.CENTER_VERTICAL);
        TextView title = text("Sports guide", 24, TEXT, true);
        title.setSingleLine(true);
        title.setEllipsize(android.text.TextUtils.TruncateAt.END);
        head.addView(title, new LinearLayout.LayoutParams(dp(150), ViewGroup.LayoutParams.WRAP_CONTENT));
        status.setSingleLine(true);
        head.addView(status);
        sportsCatPill = headerPill(sportsCatLabel(), v -> showSportsCategories());
        sportsCatPill.setSingleLine(true);
        sportsCatPill.setEllipsize(android.text.TextUtils.TruncateAt.END);
        sportsCatPill.setContentDescription("Choose a category: " + sportsCatLabel());
        LinearLayout.LayoutParams categorySize = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1);
        categorySize.setMargins(dp(12), 0, dp(12), 0);
        head.addView(sportsCatPill, categorySize);
        Button voice = headerPill("🎤 Voice search", v -> startVoice("sports"));
        voice.setSingleLine(true);
        head.addView(voice);
        Button refresh = headerPill("⟳ Refresh", v -> loadSports(status, true));
        refresh.setSingleLine(true);
        head.addView(refresh);
        return head;
    }

    private Button sportsCatPill; private LinearLayout sportsDays;
    private TextView sportsPanelTitle, sportsPanelSub; private ListView sportsChannelList;
    private String sportsReturnChannelId;
    /** Chosen website main category / sub-category (null = all) and day (0 = today). */
    private String sportsSport, sportsSub, sportsGuide; private int sportsDay;
    private List<String[]> sportsAliases = new ArrayList<>();
    private int sportsPanelToken;
    private ListView sportsList;
    private String pendingSportsQuery;

    /** Entering the sports guide: browse the categories by hand or say an event / team name. */
    private void askSportsMode() {
        new AlertDialog.Builder(this).setTitle("Sports guide")
                .setMessage("How would you like to find an event?")
                .setPositiveButton("📂 Search manually", (d, w) -> { resetSportsFilters(); showSports(); })
                .setNegativeButton("🎤 Voice search", (d, w) -> { resetSportsFilters(); showSports(); startVoice("sports"); })
                .setNeutralButton("Cancel", null).show();
    }

    /** Voice result: events whose name, team, guide or sport contains every spoken word. */
    private void sportsVoice(String spoken) {
        JSONObject r = sportsData;
        if (r == null) { pendingSportsQuery = spoken; Toast.makeText(this, "Loading the sports guide…", Toast.LENGTH_SHORT).show(); return; }
        String want = SportsVoiceSearch.query(spoken);
        List<String[]> aliases = new ArrayList<>();
        JSONArray al = r.optJSONArray("aliases");
        if (al != null) for (int i = 0; i < al.length(); i++) { JSONObject o = al.optJSONObject(i); if (o != null) aliases.add(new String[]{o.optString("from"), o.optString("to")}); }
        for (String[] x : BUILT_IN_ALIASES) aliases.add(x);
        List<JSONObject> hits = new ArrayList<>();
        JSONArray ev = r.optJSONArray("events");
        if (!want.isEmpty() && ev != null) {
            for (int i = 0; i < ev.length() && hits.size() < 60; i++) {
                JSONObject e = ev.optJSONObject(i); if (e == null) continue;
                String hay = " " + normChannel(e.optString("title") + " " + e.optString("competition") + " " + e.optString("subcategory") + " " + e.optString("sport") + " " + sportsChannelText(e)) + " ";
                hay = hay + expandTeamNicknames(hay);
                if (SportsVoiceSearch.matches(hay, spoken)) hits.add(e);
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
    private AlertDialog sportsLoadingDialog;
    private TextView sportsLoadingStatus;
    private Runnable sportsReady;
    private void finishSportsLoading() {
        dismissQuietly(sportsLoadingDialog); sportsLoadingDialog = null; sportsLoadingStatus = null; sportsReady = null;
    }
    private void showSportsLoading() {
        if (sportsLoadingDialog != null && sportsLoadingDialog.isShowing()) return;
        LinearLayout box = column();
        box.setPadding(dp(28), dp(24), dp(28), dp(24)); box.setBackgroundColor(CARD);
        box.addView(text("Loading sports listings… please wait", 22, TEXT, true));
        android.widget.ProgressBar bar = new android.widget.ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        bar.setIndeterminate(true); bar.setIndeterminateTintList(android.content.res.ColorStateList.valueOf(ACCENT));
        box.addView(bar, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(24)));
        sportsLoadingStatus = text("Fetching listings…", 16, TEXT, false); box.addView(sportsLoadingStatus);
        sportsLoadingDialog = new AlertDialog.Builder(this).setView(box).create();
        sportsLoadingDialog.show();
    }
    private void stopSports() {
        if (sportsTask != null) ui.removeCallbacks(sportsTask); sportsTask = null;
        finishSportsLoading();
    }

    private void loadSports(TextView status, boolean manual) {
        loadSports(status, manual, manual);
    }
    private void loadSports(TextView status, boolean manual, boolean popup) {
        if (popup) showSportsLoading();
        io.execute(() -> {
            try {
                String raw = Net.postJson(Net.SITE + "/api/public/player",
                        new JSONObject().put("action", "sports").put("device_token", prefs.getString("token", "")).toString());
                JSONObject r = new JSONObject(raw);
                prefs.edit().putString("sports_cache", raw).apply();
                ui.post(() -> { if (sportsLoadingStatus != null) sportsLoadingStatus.setText("Preparing channels…"); });
                if (liveChannels == null || manual) {
                    JSONArray a = new JSONArray(manual ? cachedGetFresh() : cachedGet("live", "get_live_streams", ""));
                    List<Item> l = new ArrayList<>();
                    for (int i = 0; i < a.length(); i++) {
                        JSONObject o = a.getJSONObject(i);
                        l.add(liveItem(o));
                    }
                    liveChannels = l;
                }
                JSONArray down = r.optJSONArray("unavailable");
                java.util.Set<String> ds = new java.util.HashSet<>();
                if (down != null) for (int i = 0; i < down.length(); i++) ds.add(down.optString(i).toLowerCase(java.util.Locale.ROOT));
                sportsDown = ds;
                sportsTicketFaults = r.optJSONArray("ticketFaults");
                // A channel gaining or losing its cross redraws the guide too.
                String v = r.optString("version") + "|" + (down == null ? "" : down.toString());
                ui.post(() -> {
                    if (!"sports".equals(screen)) return;
                    if (popup) sportsReady = this::finishSportsLoading;
                    if (popup || manual || !v.equals(sportsVersion)) renderSports(r);
                    status.setText("Updated " + clock(System.currentTimeMillis() / 1000) + "  ");
                    if (pendingSportsQuery != null) { String q = pendingSportsQuery; pendingSportsQuery = null; sportsVoice(q); }
                });
            } catch (Exception e) {
                ui.post(() -> {
                    finishSportsLoading();
                    status.setText("Couldn't update – try Refresh  ");
                });
            }
        });
    }
    private String cachedGetFresh() throws Exception { clearCache("live"); return cachedGet("live", "get_live_streams", ""); }

    private JSONObject sportsData;
    private void resetSportsFilters() { sportsSport = null; sportsSub = null; sportsGuide = null; sportsDay = 0; }
    /** No "All sports": start on the website's first category (Daily Sports) and its first sub-category. */
    private void defaultSportsCategory(JSONObject r) {
        if (sportsSport != null || r == null) return;
        JSONArray cats = r.optJSONArray("categories"); JSONObject c = cats == null ? null : cats.optJSONObject(0);
        if (c == null) return;
        sportsSport = c.optString("name"); JSONArray sb = c.optJSONArray("subs");
        sportsSub = sb != null && sb.length() > 0 ? sb.optString(0) : null;
        if (sportsCatPill != null) sportsCatPill.setText(sportsCatLabel());
    }
    private JSONArray sportsGuidesOf(String sport, String sub) {
        JSONObject g = sportsData == null ? null : sportsData.optJSONObject("guides");
        JSONArray supplied = g == null ? null : g.optJSONArray(sport + "|" + (sub == null ? "" : sub));
        if (supplied == null) return null;
        JSONArray active = new JSONArray();
        List<JSONObject> events = upcomingSports(sportsData, System.currentTimeMillis());
        for (int i = 0; i < supplied.length(); i++) {
            String name = supplied.optString(i);
            for (JSONObject e : events) if (inSportsCategory(e.optString("sport"), e.optString("subcategory"), e.optString("competition"), sport, sub, name)) { active.put(name); break; }
        }
        return active;
    }
    private String sportsCatLabel() {
        return "☰ Category: " + (sportsSport == null ? "Choose" : sportsSport + (sportsSub == null ? "" : " › " + sportsSub) + (sportsGuide == null ? "" : " › " + sportsGuide));
    }
    private static final java.util.TimeZone UK = java.util.TimeZone.getTimeZone("Europe/London");
    /** UK calendar days from today (0 = today); games already on from yesterday count as today. */
    static int ukDayIndex(long start, long now) {
        java.util.Calendar c = java.util.Calendar.getInstance(UK);
        c.setTimeInMillis(now); c.set(java.util.Calendar.HOUR_OF_DAY, 0); c.set(java.util.Calendar.MINUTE, 0); c.set(java.util.Calendar.SECOND, 0); c.set(java.util.Calendar.MILLISECOND, 0);
        long midnight = c.getTimeInMillis();
        if (start < midnight) return 0;
        int d = 0;
        while (d < 14) { c.add(java.util.Calendar.DAY_OF_MONTH, 1); if (start < c.getTimeInMillis()) return d; d++; }
        return d;
    }
    /** Website category filter: main category, then (when chosen) its sub-category. */
    static boolean inSportsCategory(String eventSport, String eventSub, String sport, String sub) {
        if (sport == null) return true;
        if (!sport.equals(eventSport)) return false;
        return sub == null || sub.equals(eventSub);
    }
    static boolean inSportsCategory(String eventSport, String eventSub, String eventGuide, String sport, String sub, String guide) {
        return inSportsCategory(eventSport, eventSub, sport, sub) && (guide == null || guide.equals(eventGuide));
    }
    private List<JSONObject> upcomingSports(JSONObject r, long now) {
        List<JSONObject> out = new ArrayList<>();
        JSONArray ev = r == null ? null : r.optJSONArray("events");
        if (ev != null) for (int i = 0; i < ev.length(); i++) {
            JSONObject e = ev.optJSONObject(i);
            if (e != null && sportsEnd(e) + 2 * 3600_000L > now) out.add(e);
        }
        return out;
    }

    /** Category pop-up: the website's main categories, then the chosen one's sub-categories. */
    private void showSportsCategories() {
        JSONObject r = sportsData;
        if (r == null) { Toast.makeText(this, "Loading the sports guide…", Toast.LENGTH_SHORT).show(); return; }
        List<JSONObject> up = upcomingSports(r, System.currentTimeMillis());
        List<String> names = new ArrayList<>(); final List<JSONArray> subs = new ArrayList<>();
        JSONArray cats = r.optJSONArray("categories");
        if (cats != null) for (int i = 0; i < cats.length(); i++) {
            JSONObject c = cats.optJSONObject(i); if (c == null) continue;
            String name = c.optString("name");
            boolean active = false; for (JSONObject e : up) if (name.equals(e.optString("sport"))) { active = true; break; }
            if (active) { names.add(name); subs.add(c.optJSONArray("subs")); }
        }
        // Older website without the category list: fall back to the categories the games carry.
        if (names.isEmpty()) for (JSONObject e : up) if (!names.contains(e.optString("sport"))) { names.add(e.optString("sport")); subs.add(null); }
        String[] labels = new String[names.size()];
        for (int i = 0; i < names.size(); i++) {
            int n = 0; for (JSONObject e : up) if (names.get(i).equals(e.optString("sport"))) n++;
            JSONArray sb = subs.get(i); JSONArray gd = sportsGuidesOf(names.get(i), null);
            boolean more = (sb != null && sb.length() > 0) || (gd != null && gd.length() > 1);
            labels[i] = (names.get(i).equals(sportsSport) ? "✓ " : "") + names.get(i) + "  (" + n + ")" + (more ? "   ›" : "");
        }
        new AlertDialog.Builder(this).setTitle("Choose a category").setItems(labels, (d, w) -> {
            String name = names.get(w); JSONArray sb = subs.get(w);
            if (sb == null || sb.length() == 0) {
                JSONArray gd = sportsGuidesOf(name, null);
                if (gd != null && gd.length() > 1) showSportsGuides(name, null, up, this::showSportsCategories);
                else applySportsCategory(name, null);
                return;
            }
            showSportsSubCategories(name, sb, up);
        }).setNegativeButton("Close", null).show();
    }
    private void showSportsSubCategories(String sport, JSONArray sb, List<JSONObject> up) {
        JSONArray activeSubs = new JSONArray();
        for (int i = 0; i < sb.length(); i++) {
            String name = sb.optString(i);
            for (JSONObject e : up) if (inSportsCategory(e.optString("sport"), e.optString("subcategory"), sport, name)) { activeSubs.put(name); break; }
        }
        sb = activeSubs;
        final JSONArray shownSubs = sb;
        String[] labels = new String[sb.length() + 1];
        int all = 0; for (JSONObject e : up) if (sport.equals(e.optString("sport"))) all++;
        labels[0] = "All " + sport + "  (" + all + ")";
        for (int i = 0; i < sb.length(); i++) {
            String s = sb.optString(i); int n = 0;
            for (JSONObject e : up) if (sport.equals(e.optString("sport")) && s.equals(e.optString("subcategory", ""))) n++;
            JSONArray gd = sportsGuidesOf(sport, s);
            labels[i + 1] = (sport.equals(sportsSport) && s.equals(sportsSub) ? "✓ " : "") + s + "  (" + n + ")" + (gd != null && gd.length() > 1 ? "   ›" : "");
        }
        new AlertDialog.Builder(this).setTitle(sport).setItems(labels, (d, w) -> {
            if (w == 0) { applySportsCategory(sport, null); return; }
            String s = shownSubs.optString(w - 1); JSONArray gd = sportsGuidesOf(sport, s);
            if (gd != null && gd.length() > 1) showSportsGuides(sport, s, up, () -> showSportsSubCategories(sport, shownSubs, up));
            else applySportsCategory(sport, s);
        })
                .setNegativeButton("◀ Back", (d, w) -> showSportsCategories()).show();
    }
    /** Third level: the guides inside a sub-category (e.g. Football › Mens › Premier League). */
    private void showSportsGuides(String sport, String sub, List<JSONObject> up, Runnable back) {
        JSONArray gd = sportsGuidesOf(sport, sub);
        String[] labels = new String[gd.length() + 1];
        int all = 0; for (JSONObject e : up) if (inSportsCategory(e.optString("sport"), e.optString("subcategory", ""), sport, sub)) all++;
        labels[0] = "All " + (sub == null ? sport : sub) + "  (" + all + ")";
        for (int i = 0; i < gd.length(); i++) {
            String g = gd.optString(i); int n = 0;
            for (JSONObject e : up) if (inSportsCategory(e.optString("sport"), e.optString("subcategory", ""), e.optString("competition"), sport, sub, g)) n++;
            labels[i + 1] = (g.equals(sportsGuide) ? "✓ " : "") + g + "  (" + n + ")";
        }
        new AlertDialog.Builder(this).setTitle(sub == null ? sport : sport + " › " + sub)
                .setItems(labels, (d, w) -> applySportsCategory(sport, sub, w == 0 ? null : gd.optString(w - 1)))
                .setNegativeButton("◀ Back", (d, w) -> back.run()).show();
    }
    private void applySportsCategory(String sport, String sub) { applySportsCategory(sport, sub, null); }
    private void applySportsCategory(String sport, String sub, String guide) {
        sportsSport = sport; sportsSub = sub; sportsGuide = guide; sportsDay = 0;
        if (sportsCatPill != null) sportsCatPill.setText(sportsCatLabel());
        if (sportsData != null) renderSports(sportsData);
    }

    /** Day pills, cards for the chosen day and category, and the selected card's channels beside them. */
    private void renderSports(JSONObject r) {
        if (sportsList == null) return;
        sportsData = r;
        sportsTicketFaults = r.optJSONArray("ticketFaults");
        defaultSportsCategory(r);
        JSONArray downNow = r.optJSONArray("unavailable");
        sportsVersion = r.optString("version") + "|" + (downNow == null ? "" : downNow.toString());
        List<String[]> aliases = new ArrayList<>();
        JSONArray al = r.optJSONArray("aliases");
        if (al != null) for (int i = 0; i < al.length(); i++) { JSONObject o = al.optJSONObject(i); if (o != null) aliases.add(new String[]{o.optString("from"), o.optString("to")}); }
        for (String[] x : BUILT_IN_ALIASES) aliases.add(x);
        sportsAliases = aliases;
        long now = System.currentTimeMillis();
        List<JSONObject> inCat = new ArrayList<>();
        for (JSONObject e : upcomingSports(r, now)) if (inSportsCategory(e.optString("sport"), e.optString("subcategory", ""), e.optString("competition"), sportsSport, sportsSub, sportsGuide)) inCat.add(e);
        int[] perDay = new int[7];
        for (JSONObject e : inCat) { int d = ukDayIndex(e.optLong("start"), now); if (d < 7) perDay[d]++; }
        sportsDay = populatedSportsDay(perDay, sportsDay);
        if (sportsDays != null) {
            sportsDays.removeAllViews();
            java.text.SimpleDateFormat dn = new java.text.SimpleDateFormat("EEE d", java.util.Locale.UK); dn.setTimeZone(UK);
            for (int d = 0; d < 7; d++) {
                if (perDay[d] == 0) continue;
                final int day = d;
                String label = d == 0 ? "Today" : d == 1 ? "Tomorrow" : dn.format(new java.util.Date(now + d * 86400_000L));
                Button b = miniPill(label + (perDay[d] > 0 ? "  " + perDay[d] : ""), label, () -> { sportsDay = day; renderSports(sportsData); });
                if (d == sportsDay) { GradientDrawable on = new GradientDrawable(); on.setColor(ACCENT); on.setCornerRadius(dp(12)); b.setBackground(on); }
                sportsDays.addView(b);
            }
        }
        final List<JSONObject> cards = new ArrayList<>();
        for (JSONObject e : inCat) if (ukDayIndex(e.optLong("start"), now) == sportsDay) cards.add(e);
        final long nowF = now;
        java.util.Collections.sort(cards, (x, y) -> Boolean.compare(sportsEnd(x) <= nowF, sportsEnd(y) <= nowF));
        int keep = sportsList.getSelectedItemPosition();
        sportsList.setAdapter(new SportsCardAdapter(cards, now));
        sportsList.setOnItemSelectedListener(new android.widget.AdapterView.OnItemSelectedListener() {
            @Override public void onItemSelected(android.widget.AdapterView<?> p, View v, int pos, long id) {
                if (pos < cards.size()) fillSportsPanel(cards.get(pos), sportsChannelList.hasFocus());
                sportsList.post(() -> revealSportsCard(sportsList));
            }
            @Override public void onNothingSelected(android.widget.AdapterView<?> p) {}
        });
        sportsList.setOnItemClickListener((p, v, pos, id) -> { if (pos < cards.size()) fillSportsPanel(cards.get(pos), true); });
        if (cards.isEmpty()) {
            finishSportsLoading();
            sportsPanelTitle.setText("No games here");
            sportsPanelSub.setText("Pick another day or category");
            sportsChannelList.setAdapter(adapter(new ArrayList<>()));
            sportsCatPill.requestFocus();
            return;
        }
        int sel = keep >= 0 && keep < cards.size() ? keep : 0;
        sportsList.setSelectionFromTop(sel, 0);
        fillSportsPanel(cards.get(sel), sportsChannelList.hasFocus());
        if (!sportsChannelList.hasFocus()) sportsList.requestFocus();
    }

    /** Android may retain a partial row on focus/refresh; keep the selected card inside its viewport. */
    static void revealSportsCard(ListView list) {
        if (list == null || list.getHeight() <= 0) return;
        int position = list.getSelectedItemPosition();
        View card = list.getSelectedView();
        if (position < 0 || card == null) return;
        int top = list.getPaddingTop(), bottom = list.getHeight() - list.getPaddingBottom();
        if (card.getTop() < top || (card.getBottom() > bottom && card.getHeight() <= bottom - top)) {
            list.setSelectionFromTop(position, 0);
        }
    }

    /** One game card: big kick-off time (or LIVE), game name, competition, channel count pill. */
    private final class SportsCardAdapter extends android.widget.BaseAdapter {
        private final List<JSONObject> cards; private final long now;
        SportsCardAdapter(List<JSONObject> cards, long now) { this.cards = cards; this.now = now; }
        @Override public int getCount() { return cards.size(); }
        @Override public Object getItem(int i) { return cards.get(i); }
        @Override public long getItemId(int i) { return i; }
        @Override public View getView(int i, View cv, ViewGroup parent) {
            JSONObject e = cards.get(i); long st = e.optLong("start");
            LinearLayout r = row(); r.setGravity(Gravity.CENTER_VERTICAL); r.setPadding(dp(12), dp(10), dp(12), dp(10));
            r.setBaselineAligned(false);
            boolean done = sportsEnd(e) <= now;
            TextView t = text(done ? "Finished" : st <= now ? "LIVE" : clock(st / 1000), done ? 14 : 20, done ? MUTED : st <= now ? ACCENT : TEXT, true);
            r.setAlpha(done ? 0.55f : 1f);
            r.addView(t, new LinearLayout.LayoutParams(dp(78), ViewGroup.LayoutParams.WRAP_CONTENT));
            LinearLayout mid = new LinearLayout(MainActivity.this); mid.setOrientation(LinearLayout.VERTICAL);
            TextView name = text(e.optString("title"), 17, TEXT, true); name.setPadding(0, 0, 0, 0);
            name.setMaxLines(2); name.setEllipsize(android.text.TextUtils.TruncateAt.END);
            String sub = e.optString("subcategory", "");
            TextView comp = text(e.optString("competition") + (sub.isEmpty() ? "" : "  ·  " + sub), 13, MUTED, false); comp.setPadding(0, dp(2), 0, 0);
            comp.setSingleLine(true); comp.setEllipsize(android.text.TextUtils.TruncateAt.END);
            mid.addView(name); mid.addView(comp);
            r.addView(mid, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
            JSONArray ch = e.optJSONArray("channels"); int n = ch == null ? 0 : ch.length();
            TextView pill = text(n + (n == 1 ? " channel" : " channels"), 12, TEXT, false);
            GradientDrawable pb = new GradientDrawable(); pb.setColor(0xFF22314F); pb.setCornerRadius(dp(12));
            pill.setBackground(pb); pill.setPadding(dp(10), dp(4), dp(10), dp(4));
            r.addView(pill);
            return r;
        }
    }

    /** When a game ends: the website's end time (TV guide or typical length), else start + 3h. */
    static long sportsEnd(JSONObject e) {
        long end = e.optLong("end", 0);
        return end > 0 ? end : e.optLong("start") + 3 * 3600_000L;
    }

    /** Right-hand panel: the selected game's channels grouped Channels / Sports passes / Club channels. */
    private void fillSportsPanel(JSONObject e, boolean focus) {
        final int keepChannel = focus && sportsChannelList != null ? sportsChannelList.getSelectedItemPosition() : -1;
        final int token = ++sportsPanelToken;
        long st = e.optLong("start");
        java.text.SimpleDateFormat day = new java.text.SimpleDateFormat("EEE d MMM", java.util.Locale.UK); day.setTimeZone(UK);
        sportsPanelTitle.setText(e.optString("title"));
        sportsPanelSub.setText((sportsEnd(e) <= System.currentTimeMillis() ? "Finished" : st <= System.currentTimeMillis() ? "🔴 Live now" : day.format(new java.util.Date(st)) + "  " + clock(st / 1000)) + "  ·  " + e.optString("competition"));
        final List<String[]> aliases = sportsAliases;
        final List<String> labels = new ArrayList<>(); final List<Item> targets = new ArrayList<>();
        labels.add("Finding channels…"); targets.add(null);
        sportsChannelList.setAdapter(adapter(labels));
        io.execute(() -> {
            List<String> l = new ArrayList<>(); List<Item> t = new ArrayList<>();
            try {
                if (liveChannels == null) {
                    JSONArray a = new JSONArray(cachedGet("live", "get_live_streams", ""));
                    List<Item> pl = new ArrayList<>();
                    for (int i = 0; i < a.length(); i++) pl.add(liveItem(a.getJSONObject(i)));
                    liveChannels = pl;
                }
                buildSportsRows(e, aliases, liveChannels, l, t);
            } catch (Exception ex) { l.clear(); t.clear(); l.add("Couldn't load your channels – check your login in Settings"); t.add(null); }
            ui.post(() -> {
                if (token != sportsPanelToken || !"sports".equals(screen)) return;
                l.add("🔍 Search all channels…"); t.add(null);
                final int searchRow = l.size() - 1;
                sportsChannelList.setAdapter(adapter(l));
                if (sportsReady != null) sportsReady.run();
                sportsChannelList.setOnItemClickListener((p, v, w, id) -> {
                    JSONArray ch = e.optJSONArray("channels");
                    if (w == searchRow) { searchChannels(e, aliases, ch != null && ch.length() > 0 ? normChannel(ch.optString(0)) : ""); return; }
                    Item it = t.get(w);
                    if (it == null && !l.get(w).startsWith("✕")) return;
                    if (it == null) Toast.makeText(this, "That channel isn't in your playlist – try another or search", Toast.LENGTH_SHORT).show();
                    else { sportsReturnChannelId = it.id; retryEvent = e; retryAliases = aliases; play(it, defaultVlc()); }
                });
                if (focus) {
                    int restore = keepChannel >= 0 && keepChannel < t.size() && t.get(keepChannel) != null ? keepChannel : firstPlayable(t);
                    if (sportsReturnChannelId != null) for (int i = 0; i < t.size(); i++) if (t.get(i) != null && sportsReturnChannelId.equals(t.get(i).id)) { restore = i; break; }
                    sportsChannelList.requestFocus(); sportsChannelList.setSelection(restore);
                }
            });
        });
    }
    private static int firstPlayable(List<Item> t) { for (int i = 0; i < t.size(); i++) if (t.get(i) != null) return i; return 0; }
    static int populatedSportsDay(int[] counts, int selected) {
        if (selected >= 0 && selected < counts.length && counts[selected] > 0) return selected;
        for (int i = 0; i < counts.length; i++) if (counts[i] > 0) return i;
        return 0;
    }

    /** Channel rows for a game: the guide's channels, then sports passes, then each club's own channels. */
    void buildSportsRows(JSONObject e, List<String[]> aliases, List<Item> pl, List<String> labels, List<Item> targets) {
        java.util.Set<String> seen = new java.util.HashSet<>();
        String where = (e.optString("sport") + " " + e.optString("subcategory") + " " + e.optString("competition")).toLowerCase(java.util.Locale.ROOT);
        boolean clubs = e.optBoolean("teamChannels") || where.contains("ifollow") || where.contains("scot");
        String[] teams = e.optString("title").split("\\s+(?:v|vs|vs\\.|v\\.)\\s+|\\s+-\\s+");
        java.util.Set<String> teamNames = new java.util.HashSet<>();
        for (String tm : teams) teamNames.add(tm.trim().toLowerCase(java.util.Locale.ROOT));
        java.util.Set<String> pass = new java.util.HashSet<>();
        JSONArray pc = e.optJSONArray("passChannels");
        if (pc != null) for (int j = 0; j < pc.length(); j++) pass.add(pc.optString(j).toLowerCase(java.util.Locale.ROOT));
        JSONArray ch = e.optJSONArray("channels");
        for (int section = 0; section < 2; section++) {
            boolean heading = false;
            if (ch != null) for (int j = 0; j < ch.length(); j++) {
                String g = ch.optString(j); String k = g.toLowerCase(java.util.Locale.ROOT);
                if (g.trim().isEmpty() || pass.contains(k) != (section == 1)) continue;
                if (clubs && teamNames.contains(k)) continue;
                List<Item> m = matchChannel(g, pl, aliases);
                JSONObject ccMap = e.optJSONObject("channelCountry");
                String cc = ccMap == null ? "" : ccMap.optString(g, "");
                if (!cc.isEmpty()) { List<Item> keep = new ArrayList<>(); for (Item it : m) if (channelInCountry(it.name, cc)) keep.add(it); m = keep; }
                if (section == 1 && (m.isEmpty() || m.stream().allMatch(it -> seen.contains(it.id)))) continue;
                if (!heading) { labels.add(section == 0 ? "━━  CHANNELS  ━━" : "━━  SPORTS PASSES  ━━"); targets.add(null); heading = true; }
                if (m.isEmpty()) { labels.add("✕ " + g + "  —  not in your channels"); targets.add(null); }
                for (Item it : m) if (seen.add(it.id)) { labels.add(sportsRowLabel(e, g, it.name)); targets.add(it); }
            }
        }
        if (clubs) {
            labels.add("━━  CLUB CHANNELS  ━━"); targets.add(null);
            for (String team : teams) {
                if (team.trim().isEmpty()) continue;
                List<Item> m = teamChannels(team, pl);
                if (m.isEmpty()) { labels.add("✕ No " + team.trim() + " channel in your list"); targets.add(null); }
                for (Item it : m) if (seen.add(it.id)) { labels.add("▶  " + it.name); targets.add(it); }
            }
        }
    }

    /** Channels the website currently marks not working (Sports Guide crosses). */
    static volatile java.util.Set<String> sportsDown = new java.util.HashSet<>();
    static volatile JSONArray sportsTicketFaults;
    static String sportsRowLabel(JSONObject e, String guideName, String channel) {
        if (ChannelHealth.ticketFault(e == null ? null : e.optJSONArray("ticketFaults"), guideName, channel)
                || ChannelHealth.ticketFault(sportsTicketFaults, guideName, channel))
            return "❌  " + channel + "  —  fault reported, staff are investigating. Try another channel";
        boolean down = ChannelHealth.crossed(e, guideName) || ChannelHealth.crossed(e, channel)
                || sportsDown.contains(channel.toLowerCase(java.util.Locale.ROOT));
        if (!down) return "▶  " + channel;
        return ChannelHealth.beforeStart(e, System.currentTimeMillis())
                ? "⏳  " + channel + "  —  event hasn't started yet, this channel goes live nearer the start"
                : "❌  " + channel + "  —  not working right now, try another channel";
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
        PreviewHandoff.drop(); // a hand-off nobody claimed must not keep the decoder or provider connection
        resetShiftAfterClockChange();
        super.onResume();
        // Only clear when nothing in this screen is still playing (a running preview keeps counting).
        if (preview == null) clearNowPlaying();
        if (hasLogin()) io.execute(() -> safeRun(io, this::pollOnce));
        // Positions watched on another device show here too (throttled to every 30s).
        if (unlocked && hasLogin()) ProgressSync.pull(this, false, () -> { if ("home".equals(screen)) showHome(); });
        refreshVersionScreens();
        // Re-opened after being away: ask the PIN again before showing any screen.
        if (!PlayerApplication.pinPassed && unlocked && hasLogin() && !java.util.Arrays.asList("pin", "link", "linkcheck", "linkok", "unlock", "expired", "maintenance", "").contains(screen)) { stopPreview(); stopMulti(); checkPin(); return; }
        if (watchedAdapter != null) watchedAdapter.notifyDataSetChanged();
        if ("sports".equals(screen) && retryEvent != null) { retryEvent = null; if (sportsChannelList != null) sportsChannelList.requestFocus(); }
        else if ("sports_channels".equals(screen) && retryEvent != null) {
            JSONObject e = retryEvent; retryEvent = null;
            ui.postDelayed(() -> pickSportsChannel(e, retryAliases, true), 300);
        }
    }

    /** Every playlist channel the event could be on: all guide matches, best first, then a search. */
    private void pickSportsChannel(JSONObject e, List<String[]> aliases, boolean retry) {
        if (liveChannels == null) {
            final AlertDialog wait = findingDialog();
            io.execute(() -> {
                try {
                    JSONArray a = new JSONArray(cachedGet("live", "get_live_streams", ""));
                    List<Item> l = new ArrayList<>();
                    for (int i = 0; i < a.length(); i++) { JSONObject o = a.getJSONObject(i); l.add(liveItem(o)); }
                    liveChannels = l;
                    ui.post(() -> { dismissQuietly(wait); pickSportsChannel(e, aliases, retry); });
                } catch (Exception ex) { ui.post(() -> { dismissQuietly(wait); Toast.makeText(this, "Couldn't load your channels – check your login in Settings", Toast.LENGTH_LONG).show(); }); }
            });
            return;
        }
        JSONArray ch = e.optJSONArray("channels");
        final AlertDialog wait = findingDialog();
        List<Item> pl = liveChannels;
        io.execute(() -> {
            List<String> labels = new ArrayList<>();
            List<Item> targets = new ArrayList<>();
            try {
                buildSportsRows(e, aliases, pl, labels, targets);
            } catch (Exception ex) { labels.clear(); targets.clear(); }
            ui.post(() -> { dismissQuietly(wait); try { showSportsChannels(e, aliases, retry, ch, labels, targets); }
                catch (Exception ex) { Toast.makeText(this, "Couldn't open the channel list", Toast.LENGTH_LONG).show(); } });
        });
    }

    /** "Finding channels…" stays on screen until every channel row is ready (a toast vanished too early). */
    private AlertDialog findingDialog() {
        LinearLayout box = new LinearLayout(this); box.setOrientation(LinearLayout.HORIZONTAL);
        box.setGravity(android.view.Gravity.CENTER_VERTICAL); box.setPadding(dp(24), dp(20), dp(24), dp(20));
        box.addView(new android.widget.ProgressBar(this), new LinearLayout.LayoutParams(dp(40), dp(40)));
        TextView t = text("Finding channels… please wait", 18, TEXT, true); t.setPadding(dp(16), 0, 0, 0);
        box.addView(t);
        AlertDialog d = new AlertDialog.Builder(this).setView(box).setCancelable(true).create();
        d.show();
        return d;
    }
    private static void dismissQuietly(AlertDialog d) { try { if (d != null && d.isShowing()) d.dismiss(); } catch (Exception ignored) {} }

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

    /** Reopen the sports guide on the category and day the customer was on. */
    private void showSportsKeep() { showSports(); }

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
    /** Small guide control: compact text, tight padding, so the day buttons never crowd the screen. */
    private Button miniPill(String label, String desc, Runnable r) {
        Button b = button(label, v -> r.run());
        b.setTextSize(13); b.setMinHeight(0); b.setMinimumHeight(0); b.setMinWidth(0); b.setMinimumWidth(0);
        b.setPadding(dp(10), dp(4), dp(10), dp(4));
        b.setContentDescription(desc);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.setMargins(dp(4), 0, dp(4), 0);
        b.setLayoutParams(lp);
        return b;
    }

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
    private LinearLayout.LayoutParams iconWeight() {
        LinearLayout.LayoutParams lp = weight(1f, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.setMargins(dp(4), dp(4), dp(4), dp(0));
        return lp;
    }

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
        // Same gap across and down so every row sits an even distance below the one above.
        g.setHorizontalSpacing(dp(12)); g.setVerticalSpacing(dp(12));
        g.setPadding(dp(10), dp(10), dp(10), dp(10));
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
                    img.setScaleType(android.widget.ImageView.ScaleType.FIT_CENTER); // whole poster shown, never cropped
                    img.setBackgroundColor(Color.rgb(20, 28, 48));
                    card.addView(img, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(150)));
                    t = text("", 13, TEXT, false); t.setLines(2); t.setEllipsize(android.text.TextUtils.TruncateAt.END); t.setGravity(Gravity.CENTER);
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
                // Every card reserves the watched bar's space (invisible when unwatched) so all cards share one
                // natural height on any screen or text size — nothing is cut off and rows stay evenly spaced.
                LinearLayout wb = "series".equals(it.kind) ? null : watchedBar(it);
                if (wb == null || wb.getVisibility() == View.GONE) {
                    wb = new LinearLayout(MainActivity.this); wb.setOrientation(LinearLayout.VERTICAL);
                    wb.addView(new View(MainActivity.this), new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(6)));
                    wb.addView(text("0% watched", 12, MUTED, false));
                    wb.setVisibility(View.INVISIBLE);
                }
                progress.addView(wb);
                t.setLines(2); t.setText(it.name);
                // Rating always sits on its own single line under any watched bar, so the score and vote count are never cut off.
                TextView rt = text(ratingText(it), 12, MUTED, false); rt.setSingleLine(true); rt.setEllipsize(android.text.TextUtils.TruncateAt.END);
                progress.addView(rt); requestRating(it);
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
        return resultList(title, count, row, pick, posLabel, pos, negLabel, neg, i -> true);
    }
    private AlertDialog resultList(String title, int count, java.util.function.IntFunction<View> row, java.util.function.IntConsumer pick,
                                   String posLabel, Runnable pos, String negLabel, Runnable neg, java.util.function.IntPredicate enabled) {
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
        lv.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            @Override public void onItemSelected(AdapterView<?> parent, View view, int position, long id) {
                for (int i = 0; i < parent.getChildCount(); i++) ChannelNameView.activate(parent.getChildAt(i), parent.getChildAt(i) == view);
            }
            @Override public void onNothingSelected(AdapterView<?> parent) {
                for (int i = 0; i < parent.getChildCount(); i++) ChannelNameView.activate(parent.getChildAt(i), false);
            }
        });
        lv.setFocusable(true);
        lv.setDividerHeight(0);
        lv.setAdapter(new BaseAdapter() {
            @Override public int getCount() { return count; }
            @Override public boolean areAllItemsEnabled() { return false; }
            @Override public boolean isEnabled(int i) { return enabled.test(i); }
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
        lv.setOnItemClickListener((p, v, i, id) -> { if (enabled.test(i)) { dlg.dismiss(); pick.accept(i); } });
        dlg.setOnShowListener(d -> { lv.requestFocus(); for (int i = 0; i < count; i++) if (enabled.test(i)) { lv.setSelection(i); break; } });
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
