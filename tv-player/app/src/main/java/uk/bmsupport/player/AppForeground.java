package uk.bmsupport.player;

import android.app.Activity;
import android.app.Application;
import android.os.Bundle;

/** Tracks whether BM Player as a whole left the screen (home button, other app, closed), ignoring moves between its own screens. */
final class AppForeground {
    private static boolean registered;
    private static int started;
    private static boolean left;

    static synchronized void watch(Application app) {
        if (registered) return;
        registered = true;
        app.registerActivityLifecycleCallbacks(new Application.ActivityLifecycleCallbacks() {
            @Override public void onActivityStarted(Activity a) { started++; }
            @Override public void onActivityStopped(Activity a) { if (--started <= 0) { started = 0; if (!a.isChangingConfigurations()) left = true; } }
            @Override public void onActivityCreated(Activity a, Bundle b) {}
            @Override public void onActivityResumed(Activity a) {}
            @Override public void onActivityPaused(Activity a) {}
            @Override public void onActivitySaveInstanceState(Activity a, Bundle b) {}
            @Override public void onActivityDestroyed(Activity a) {}
        });
    }

    static synchronized boolean consumeLeft() { boolean l = left; left = false; return l; }
}
