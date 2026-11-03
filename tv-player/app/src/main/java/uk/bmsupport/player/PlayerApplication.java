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
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final List<Activity> activities = new ArrayList<>();
    private Activity foreground;
    private AlertDialog prompt;
    private long lastInput = SystemClock.elapsedRealtime(), promptedAt;
    private boolean exiting;
    // Admin announcement shown along the bottom of whichever screen is open, refreshed every 15s.
    private final java.util.concurrent.ExecutorService annIo = java.util.concurrent.Executors.newSingleThreadExecutor();
    private String annId, annMsg;
    private android.view.View banner;
    private int annTicks = 14;
    private boolean annBusy;
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
            @Override public void run() { if (!exiting) { tick(); if (++annTicks >= 15) { annTicks = 0; fetchAnnouncement(); } } ui.postDelayed(this, 1000); }
        });
    }
    private void tick() {
        long now = SystemClock.elapsedRealtime();
        if (prompt != null) {
            if (InactivityPolicy.exit(promptedAt, now)) { exitToHome(); return; }
            prompt.setMessage("No activity for 3 hours. Continue viewing?\n\nThe app will close in "
                    + Math.max(0, (InactivityPolicy.RESPONSE_MS - (now - promptedAt) + 999) / 1000) + " seconds.");
            return;
        }
        Activity a = foreground;
        if (a == null || a.isFinishing() || !InactivityPolicy.prompt(lastInput, now)) return;
        promptedAt = now;
        prompt = new AlertDialog.Builder(a).setTitle("Still watching?")
                .setMessage("Continue viewing?")
                .setPositiveButton("Continue viewing", (d, w) -> { prompt = null; lastInput = SystemClock.elapsedRealtime(); })
                .setNegativeButton("Close app", (d, w) -> exitToHome())
                .setCancelable(false).create();
        prompt.setOnShowListener(d -> { if (prompt != null) prompt.getButton(AlertDialog.BUTTON_POSITIVE).requestFocus(); });
        prompt.show();
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
                org.json.JSONObject a = r.optJSONObject("announcement");
                id = a == null ? null : a.optString("id", null); msg = a == null ? null : a.optString("message", "");
                ok = true;
            } catch (Throwable ignored) {}
            final boolean got = ok; final String fid = id, fmsg = msg;
            ui.post(() -> { annBusy = false; if (got) { annId = fid; annMsg = fmsg; showAnnouncement(); } });
        });
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
        x.setOnClickListener(v -> { getSharedPreferences("bmplayer", MODE_PRIVATE).edit().putString("ann_closed", id).apply(); showAnnouncement(); });
        bar.addView(x, new android.widget.LinearLayout.LayoutParams((int) (56 * d), (int) (48 * d)));
        android.widget.FrameLayout.LayoutParams lp = new android.widget.FrameLayout.LayoutParams(
                android.view.ViewGroup.LayoutParams.MATCH_PARENT, android.view.ViewGroup.LayoutParams.WRAP_CONTENT, android.view.Gravity.BOTTOM);
        lp.setMargins((int) (24 * d), 0, (int) (24 * d), (int) (16 * d));
        bar.setTag(annId + annMsg);
        // The window's decor survives setContentView, so the bar stays put while screens change underneath.
        ((android.view.ViewGroup) a.getWindow().getDecorView()).addView(bar, lp);
        banner = bar;
    }
    private void exitToHome() {
        exiting = true;
        if (prompt != null) { prompt.dismiss(); prompt = null; }
        for (Activity activity : new ArrayList<>(activities)) activity.finishAndRemoveTask();
        getSharedPreferences("bmplayer", MODE_PRIVATE).edit().putLong("np_since", 0).apply();
        try { startActivity(new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); }
        catch (Exception ignored) {}
    }
    @Override public void onActivityCreated(Activity a, Bundle b) { if (exiting) { exiting = false; lastInput = SystemClock.elapsedRealtime(); } activities.add(a); }
    @Override public void onActivityResumed(Activity a) { foreground = a; showAnnouncement(); }
    @Override public void onActivityPaused(Activity a) { if (foreground == a) foreground = null; }
    @Override public void onActivityDestroyed(Activity a) {
        activities.remove(a);
        if (banner != null && banner.getContext() == a) banner = null;
        if (foreground == a) foreground = null;
        if (prompt != null && prompt.getContext() == a) { prompt.dismiss(); prompt = null; }
    }
    @Override public void onActivityStarted(Activity a) {}
    @Override public void onActivityStopped(Activity a) {}
    @Override public void onActivitySaveInstanceState(Activity a, Bundle b) {}
}