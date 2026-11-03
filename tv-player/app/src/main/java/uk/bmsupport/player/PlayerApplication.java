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
            @Override public void run() { if (!exiting) tick(); ui.postDelayed(this, 1000); }
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
    private void exitToHome() {
        exiting = true;
        if (prompt != null) { prompt.dismiss(); prompt = null; }
        for (Activity activity : new ArrayList<>(activities)) activity.finishAndRemoveTask();
        getSharedPreferences("bmplayer", MODE_PRIVATE).edit().putLong("np_since", 0).apply();
        try { startActivity(new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); }
        catch (Exception ignored) {}
    }
    @Override public void onActivityCreated(Activity a, Bundle b) { if (exiting) { exiting = false; lastInput = SystemClock.elapsedRealtime(); } activities.add(a); }
    @Override public void onActivityResumed(Activity a) { foreground = a; }
    @Override public void onActivityPaused(Activity a) { if (foreground == a) foreground = null; }
    @Override public void onActivityDestroyed(Activity a) {
        activities.remove(a);
        if (foreground == a) foreground = null;
        if (prompt != null && prompt.getContext() == a) { prompt.dismiss(); prompt = null; }
    }
    @Override public void onActivityStarted(Activity a) {}
    @Override public void onActivityStopped(Activity a) {}
    @Override public void onActivitySaveInstanceState(Activity a, Bundle b) {}
}