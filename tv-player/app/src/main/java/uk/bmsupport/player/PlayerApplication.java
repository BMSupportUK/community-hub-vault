package uk.bmsupport.player;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.Application;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import java.util.ArrayList;
import java.util.List;

/** One inactivity timer across the app's menus, preview and built-in playback. */
public final class PlayerApplication extends Application implements Application.ActivityLifecycleCallbacks {
    /** True once the customer has entered their PIN (or has none) since the app opened. */
    static volatile boolean pinPassed = false;

    private final Handler ui = new Handler(Looper.getMainLooper());
    private final List<Activity> activities = new ArrayList<>();
    private Activity foreground;
    private AlertDialog prompt;
    private long lastInput = SystemClock.elapsedRealtime(), promptedAt = -1;
    private boolean exiting;
    // Admin announcement shown along the bottom of whichever screen is open, refreshed every 15s.
    private final java.util.concurrent.ExecutorService annIo = java.util.concurrent.Executors.newSingleThreadExecutor();
    private String annId, annMsg;
    private android.view.View banner;
    private int annTicks = (int) (Math.random() * 15);
    private int annEvery = 15;
    private boolean annBusy;
    private final long startedAt = SystemClock.elapsedRealtime();
    // Longer "major" announcements behind a top-right icon with an unread counter, refreshed every 60s.
    private org.json.JSONArray majorItems = new org.json.JSONArray();
    private int majorTicks = 45 + (int) (Math.random() * 15);
    private int majorEvery = 60;
    private boolean majorBusy;
    private android.widget.TextView majorIcon;
    private android.widget.FrameLayout majorBox;
    /** Width every header keeps free on its right for the 📣 icon. */
    static final int MAJOR_ICON_SLOT_DP = 64;
    static void interaction(Activity activity) {
        PlayerApplication app = (PlayerApplication) activity.getApplication();
        if (app.prompt == null) app.lastInput = SystemClock.elapsedRealtime();
    }
    @Override public void onCreate() {
        super.onCreate(); registerActivityLifecycleCallbacks(this);
        // Keep the last crash so the next open can send it to BM Support as a ticket.
        final Thread.UncaughtExceptionHandler prev = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((t, e) -> {
            try {
                java.io.StringWriter w = new java.io.StringWriter(); e.printStackTrace(new java.io.PrintWriter(w));
                String screen = foreground == null ? "?" : foreground.getClass().getSimpleName();
                getSharedPreferences("bmplayer", MODE_PRIVATE).edit().putString("last_crash", "App closed unexpectedly on " + screen + " (thread " + t.getName() + "): " + w).commit();
            } catch (Throwable ignored) {}
            if (prev != null) prev.uncaughtException(t, e);
        });
        ui.post(new Runnable() {
            @Override public void run() { if (!exiting) { tick(); if (++annTicks >= annEvery) { annTicks = 0; annEvery = (int) (Checkin.delay(15000) / 1000); fetchAnnouncement(); } if (++majorTicks >= majorEvery) { majorTicks = 0; majorEvery = (int) (Checkin.delay(60000) / 1000); fetchMajor(); } } ui.postDelayed(this, 1000); }
        });
    }
    private void tick() {
        long now = SystemClock.elapsedRealtime();
        // The deadline belongs to the app, not a dialog/activity that Fire OS can destroy.
        if (promptedAt >= 0 && InactivityPolicy.exit(promptedAt, now)) { exitToHome(); return; }
        if (prompt != null) {
            prompt.setMessage("No activity for 3 hours. Continue viewing?\n\nThe app will close in "
                    + Math.max(0, (InactivityPolicy.RESPONSE_MS - (now - promptedAt) + 999) / 1000) + " seconds.");
            return;
        }
        Activity a = foreground;
        if (a == null || a.isFinishing() || !InactivityPolicy.prompt(lastInput, now)) return;
        if (promptedAt < 0) promptedAt = now;
        prompt = new AlertDialog.Builder(a).setTitle("Still watching?")
                .setMessage("Continue viewing?")
                .setPositiveButton("Continue viewing", (d, w) -> { prompt = null; promptedAt = -1; lastInput = SystemClock.elapsedRealtime(); })
                .setNegativeButton("Close app", (d, w) -> exitToHome())
                .setCancelable(false).create();
        prompt.setOnShowListener(d -> { if (prompt != null) prompt.getButton(AlertDialog.BUTTON_POSITIVE).requestFocus(); });
        prompt.show();
    }
    /** Brings the app's home screen forward (closing any playback above it) and opens the title sent from the website. */
    private void openWatch(org.json.JSONObject w) {
        String kind = w.optString("kind");
        if (!"film".equals(kind) && !"series".equals(kind)) return;
        android.content.Intent i = new android.content.Intent(this, MainActivity.class)
                .addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK | android.content.Intent.FLAG_ACTIVITY_CLEAR_TOP | android.content.Intent.FLAG_ACTIVITY_SINGLE_TOP)
                .putExtra("watch_kind", kind).putExtra("watch_id", w.isNull("id") ? null : w.optString("id")).putExtra("watch_title", w.optString("title"));
        startActivity(i);
    }
    private void fetchAnnouncement() {
        if (annBusy) return;
        final String token = getSharedPreferences("bmplayer", MODE_PRIVATE).getString("token", "");
        if (token.isEmpty()) return;
        annBusy = true;
        annIo.execute(() -> {
            String id = annId, msg = annMsg; boolean ok = false;
            try {
                org.json.JSONObject r = new org.json.JSONObject(Net.postJson(Net.SITE + "/api/public/player",
                        new org.json.JSONObject().put("action", "announcement").put("device_token", token).toString()));
                org.json.JSONObject w = r.optJSONObject("watch");
                if (w != null) { final org.json.JSONObject fw = w; ui.post(() -> openWatch(fw)); }
                org.json.JSONObject a = r.optJSONObject("announcement");
                // Only apps already open when it was sent show it; anyone opening later never sees it.
                if (a != null && SystemClock.elapsedRealtime() - a.optLong("age_ms", 0) < startedAt) a = null;
                id = a == null ? null : a.optString("id", null); msg = a == null ? null : a.optString("message", "");
                ok = true;
            } catch (Throwable ignored) {}
            final boolean got = ok; final String fid = id, fmsg = msg;
            ui.post(() -> { annBusy = false; if (got) { annId = fid; annMsg = fmsg; showAnnouncement(); } });
        });
    }
    /** Called right after the account number unlocks the app, so members see the icon straight away. */
    void refreshMajor() { fetchMajor(); showMajorIcon(); }
    private void fetchMajor() {
        if (majorBusy) return;
        // Major announcements are for signed-in viewers only: a logged-out app keeps no list and shows no icon.
        if (!MainActivity.isUnlocked() || getSharedPreferences("bmplayer", MODE_PRIVATE).getString("user", "").isEmpty()) {
            if (majorItems.length() > 0) { majorItems = new org.json.JSONArray(); showMajorIcon(); }
            return;
        }
        final String token = getSharedPreferences("bmplayer", MODE_PRIVATE).getString("token", "");
        if (token.isEmpty()) return;
        majorBusy = true;
        annIo.execute(() -> {
            org.json.JSONArray items = null;
            try {
                org.json.JSONObject r = new org.json.JSONObject(Net.postJson(Net.SITE + "/api/public/player",
                        new org.json.JSONObject().put("action", "major_announcements").put("device_token", token).toString()));
                items = r.optJSONArray("items");
            } catch (Throwable ignored) {}
            final org.json.JSONArray got = items;
            ui.post(() -> { majorBusy = false; if (got != null) majorItems = got; showMajorIcon(); });
        });
    }
    private java.util.Set<String> majorSeen() {
        return new java.util.HashSet<>(getSharedPreferences("bmplayer", MODE_PRIVATE).getStringSet("major_seen", new java.util.HashSet<>()));
    }
    private int majorUnread() {
        java.util.Set<String> seen = majorSeen(); int n = 0;
        for (int i = 0; i < majorItems.length(); i++) if (!seen.contains(majorItems.optJSONObject(i).optString("id"))) n++;
        return n;
    }
    /** Top-right announcement icon on the app's own screens (never over full-screen video). */
    void refreshMajorIcon() { showMajorIcon(); }
    private void showMajorIcon() {
        Activity a = foreground;
        boolean want = a instanceof MainActivity && ((MainActivity) a).showsAnnouncementIcon() && !a.isFinishing() && MainActivity.isUnlocked()
                && !getSharedPreferences("bmplayer", MODE_PRIVATE).getString("user", "").isEmpty();
        if (majorIcon != null && (!want || majorIcon.getContext() != a)) {
            if (majorBox != null && majorBox.getParent() instanceof android.view.ViewGroup) ((android.view.ViewGroup) majorBox.getParent()).removeView(majorBox);
            majorIcon = null; majorBox = null;
        }
        if (!want) return;
        int n = majorUnread();
        if (majorIcon == null) {
            float d = a.getResources().getDisplayMetrics().density;
            // Round 44dp button in the app's card/accent colours with a small red count bubble;
            // every header leaves MAJOR_ICON_SLOT_DP free on the right so it never covers a button.
            android.widget.FrameLayout box = new android.widget.FrameLayout(a);
            android.widget.TextView b = new android.widget.TextView(a);
            b.setText("📣"); b.setTextSize(18); b.setGravity(android.view.Gravity.CENTER);
            b.setContentDescription("Announcements");
            android.graphics.drawable.GradientDrawable bg = new android.graphics.drawable.GradientDrawable();
            bg.setShape(android.graphics.drawable.GradientDrawable.OVAL); bg.setColor(0xFF16213A);
            android.graphics.drawable.GradientDrawable fb = new android.graphics.drawable.GradientDrawable();
            fb.setShape(android.graphics.drawable.GradientDrawable.OVAL); fb.setColor(0xFF16213A); fb.setStroke((int) (3 * d), 0xFFE11D48);
            android.graphics.drawable.StateListDrawable sl = new android.graphics.drawable.StateListDrawable();
            sl.addState(new int[]{android.R.attr.state_focused}, fb); sl.addState(new int[]{}, bg);
            b.setBackground(sl);
            b.setFocusable(true); b.setClickable(true);
            b.setOnClickListener(v -> openMajorList());
            int size = (int) (44 * d);
            box.addView(b, new android.widget.FrameLayout.LayoutParams(size, size, android.view.Gravity.BOTTOM | android.view.Gravity.START));
            android.widget.TextView badge = new android.widget.TextView(a);
            badge.setTextColor(0xFFFFFFFF); badge.setTextSize(11); badge.setGravity(android.view.Gravity.CENTER);
            badge.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
            android.graphics.drawable.GradientDrawable rb = new android.graphics.drawable.GradientDrawable();
            rb.setShape(android.graphics.drawable.GradientDrawable.OVAL); rb.setColor(0xFFE11D48);
            badge.setBackground(rb);
            int bs = (int) (20 * d);
            box.addView(badge, new android.widget.FrameLayout.LayoutParams(bs, bs, android.view.Gravity.TOP | android.view.Gravity.END));
            box.setElevation(20 * d);
            box.setTag(badge);
            final android.widget.FrameLayout.LayoutParams lp = new android.widget.FrameLayout.LayoutParams(
                    (int) (52 * d), (int) (52 * d), android.view.Gravity.TOP | android.view.Gravity.END);
            final int m = (int) (10 * d);
            android.view.WindowInsets in = a.getWindow().getDecorView().getRootWindowInsets();
            // Top 18dp puts the 44dp button's centre at 48dp: the middle of the 48dp header pills under the 24dp screen padding.
            lp.setMargins(0, (int) (18 * d) + (in == null ? 0 : in.getSystemWindowInsetTop()), m + (in == null ? 0 : in.getSystemWindowInsetRight()), 0);
            ((android.view.ViewGroup) a.getWindow().getDecorView()).addView(box, lp);
            majorIcon = b;
            majorBox = box;
        }
        android.widget.TextView badge = (android.widget.TextView) majorBox.getTag();
        badge.setText(n > 9 ? "9+" : String.valueOf(n));
        badge.setVisibility(n > 0 ? android.view.View.VISIBLE : android.view.View.GONE);
    }
    private void openMajorList() {
        final Activity a = foreground;
        if (a == null) return;
        if (majorItems.length() == 0) {
            new AlertDialog.Builder(a).setTitle("Announcements").setMessage("There are no announcements right now.").setPositiveButton("Close", null).show();
            return;
        }
        java.util.Set<String> seen = majorSeen();
        String[] rows = new String[majorItems.length()];
        for (int i = 0; i < rows.length; i++) {
            org.json.JSONObject o = majorItems.optJSONObject(i);
            rows[i] = (seen.contains(o.optString("id")) ? "" : "● ") + o.optString("title") + "\n" + o.optString("created_at", "").replace('T', ' ').substring(0, Math.min(16, o.optString("created_at", "").length()));
        }
        new AlertDialog.Builder(a).setTitle("Announcements")
                .setItems(rows, (d, w) -> openMajor(w))
                .setNegativeButton("Close", null).show();
    }
    private void openMajor(int i) {
        final Activity a = foreground;
        org.json.JSONObject o = majorItems.optJSONObject(i);
        if (a == null || o == null) return;
        java.util.Set<String> seen = majorSeen(); seen.add(o.optString("id"));
        getSharedPreferences("bmplayer", MODE_PRIVATE).edit().putStringSet("major_seen", seen).apply();
        showMajorIcon();
        android.widget.ScrollView sv = new android.widget.ScrollView(a);
        android.widget.TextView t = new android.widget.TextView(a);
        float d = a.getResources().getDisplayMetrics().density;
        t.setPadding((int) (24 * d), (int) (12 * d), (int) (24 * d), (int) (12 * d));
        t.setTextSize(17); t.setText(o.optString("body")); t.setFocusable(true);
        sv.addView(t);
        new AlertDialog.Builder(a).setTitle(o.optString("title")).setView(sv)
                .setPositiveButton("Back to list", (dd, w) -> openMajorList())
                .setNegativeButton("Close", null).show();
    }
    private void showAnnouncement() {
        Activity a = foreground;
        String closed = getSharedPreferences("bmplayer", MODE_PRIVATE).getString("ann_closed", "");
        boolean want = annId != null && !annId.equals(closed) && a != null && !a.isFinishing();
        if (banner != null && (!want || banner.getContext() != a || !banner.getTag().equals(annId + annMsg))) {
            if (banner.getParent() instanceof android.view.ViewGroup) ((android.view.ViewGroup) banner.getParent()).removeView(banner);
            banner = null;
        }
        if (!want || banner != null) return;
        float d = a.getResources().getDisplayMetrics().density;
        android.widget.LinearLayout bar = new android.widget.LinearLayout(a);
        bar.setOrientation(android.widget.LinearLayout.HORIZONTAL);
        bar.setGravity(android.view.Gravity.CENTER_VERTICAL);
        bar.setPadding((int) (20 * d), (int) (10 * d), (int) (10 * d), (int) (10 * d));
        android.graphics.drawable.GradientDrawable bg = new android.graphics.drawable.GradientDrawable();
        bg.setColor(0xF0151A24); bg.setStroke((int) (2 * d), 0xFFE50914); bg.setCornerRadius(12 * d);
        bar.setBackground(bg); bar.setElevation(24 * d);
        android.widget.TextView t = new android.widget.TextView(a);
        t.setText("📢  " + annMsg); t.setTextColor(0xFFFFFFFF); t.setTextSize(17); t.setMaxLines(3);
        bar.addView(t, new android.widget.LinearLayout.LayoutParams(0, android.view.ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        android.widget.Button x = new android.widget.Button(a);
        x.setText("✕"); x.setTextSize(18); x.setContentDescription("Close announcement");
        x.setFocusable(true);
        final String id = annId;
        Runnable close = () -> { getSharedPreferences("bmplayer", MODE_PRIVATE).edit().putString("ann_closed", id).apply(); annId = null; showAnnouncement(); };
        x.setOnClickListener(v -> close.run());
        // Remotes: OK or Back on the cross closes it.
        x.setOnKeyListener((v, code, e) -> {
            if (e.getAction() != android.view.KeyEvent.ACTION_UP) return code == android.view.KeyEvent.KEYCODE_BACK;
            if (code == android.view.KeyEvent.KEYCODE_BACK || code == android.view.KeyEvent.KEYCODE_DPAD_CENTER || code == android.view.KeyEvent.KEYCODE_ENTER) { close.run(); return true; }
            return false;
        });
        x.setFocusableInTouchMode(false);
        bar.addView(x, new android.widget.LinearLayout.LayoutParams((int) (56 * d), (int) (48 * d)));
        // Tapping anywhere on the bar closes it too, so a phone never needs to hit the small cross.
        bar.setClickable(true); bar.setOnClickListener(v -> close.run());
        final android.widget.FrameLayout.LayoutParams lp = new android.widget.FrameLayout.LayoutParams(
                android.view.ViewGroup.LayoutParams.MATCH_PARENT, android.view.ViewGroup.LayoutParams.WRAP_CONTENT, android.view.Gravity.BOTTOM);
        final int side = (int) (24 * d), bottom = (int) (16 * d);
        lp.setMargins(side, 0, side, bottom);
        // The decor reaches under the phone's navigation bar (on the right when sideways), so keep the bar clear of it.
        bar.setOnApplyWindowInsetsListener((v, in) -> {
            lp.setMargins(side + in.getSystemWindowInsetLeft(), 0, side + in.getSystemWindowInsetRight(), bottom + in.getSystemWindowInsetBottom());
            v.setLayoutParams(lp);
            return in;
        });
        android.view.WindowInsets now = a.getWindow().getDecorView().getRootWindowInsets();
        if (now != null) lp.setMargins(side + now.getSystemWindowInsetLeft(), 0, side + now.getSystemWindowInsetRight(), bottom + now.getSystemWindowInsetBottom());
        bar.setTag(annId + annMsg);
        // The window's decor survives setContentView, so the bar stays put while screens change underneath.
        ((android.view.ViewGroup) a.getWindow().getDecorView()).addView(bar, lp);
        banner = bar;
        // TV remotes can't always reach a bar added over the screen, so put focus on the cross straight away.
        if (!a.getPackageManager().hasSystemFeature("android.hardware.touchscreen")) x.post(x::requestFocus);
    }
    /** Back closes an open announcement first, wherever focus is, before the screen's own Back runs. */
    static boolean closeAnnouncementOnBack(Activity activity, android.view.KeyEvent e) {
        if (e.getKeyCode() != android.view.KeyEvent.KEYCODE_BACK) return false;
        PlayerApplication app = (PlayerApplication) activity.getApplication();
        if (app.banner == null || app.banner.getContext() != activity || app.annId == null) return false;
        if (e.getAction() == android.view.KeyEvent.ACTION_UP) {
            app.getSharedPreferences("bmplayer", MODE_PRIVATE).edit().putString("ann_closed", app.annId).apply();
            app.annId = null; app.showAnnouncement();
        }
        return true;
    }
    private void exitToHome() {
        exiting = true;
        pinPassed = false;
        promptedAt = -1;
        if (prompt != null) { prompt.dismiss(); prompt = null; }
        for (Activity activity : new ArrayList<>(activities)) activity.finishAndRemoveTask();
        getSharedPreferences("bmplayer", MODE_PRIVATE).edit().putLong("np_since", 0).apply();
        try { startActivity(new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); }
        catch (Exception ignored) {}
        // Make sure the app really closes even if a screen refused to finish: end the process shortly after.
        ui.postDelayed(() -> android.os.Process.killProcess(android.os.Process.myPid()), 1500);
    }
    @Override public void onActivityCreated(Activity a, Bundle b) { if (exiting) { exiting = false; lastInput = SystemClock.elapsedRealtime(); } activities.add(a); }
    @Override public void onActivityResumed(Activity a) { foreground = a; showAnnouncement(); showMajorIcon(); }
    @Override public void onActivityPaused(Activity a) { if (foreground == a) foreground = null; }
    @Override public void onActivityDestroyed(Activity a) {
        activities.remove(a);
        if (banner != null && banner.getContext() == a) banner = null;
        if (foreground == a) foreground = null;
        if (prompt != null && prompt.getContext() == a) { prompt.dismiss(); prompt = null; }
    }
    private static int startedCount;
    /** True while any BM Player screen is on the display (not just alive in the background). */
    static boolean onScreen() { return startedCount > 0; }
    // Defer one UI turn so moving between our own activities never counts as leaving the app.
    private final Runnable lockBackground = () -> { if (startedCount == 0) pinPassed = false; };
    @Override public void onActivityStarted(Activity a) {
        ui.removeCallbacks(lockBackground);
        startedCount++;
    }
    @Override public void onActivityStopped(Activity a) { if (startedCount > 0 && --startedCount == 0) ui.post(lockBackground); }
    @Override public void onActivitySaveInstanceState(Activity a, Bundle b) {}
}