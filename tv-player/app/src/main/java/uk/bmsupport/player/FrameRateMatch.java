package uk.bmsupport.player;

import android.app.Activity;
import android.os.Build;
import android.view.Display;
import android.view.WindowManager;

/**
 * Android boxes output 60Hz, so 50fps UK broadcasts judder. Switch the TV to a refresh rate that is a
 * whole multiple of the content's frame rate while playing; leaving the activity restores the default.
 * Fire TV matches by itself, so it is left alone.
 */
final class FrameRateMatch {
    /** Index of the best mode for {@code fps} among same-size modes, or -1 when the current one already fits. */
    static int pick(float fps, float[] rates, int[] widths, int[] heights, int curW, int curH, float curRate) {
        if (!(fps >= 20 && fps <= 61)) return -1;
        if (fits(fps, curRate)) return -1;
        int best = -1;
        for (int i = 0; i < rates.length; i++) {
            if (widths[i] != curW || heights[i] != curH || !fits(fps, rates[i])) continue;
            // Prefer the lowest exact multiple (50 over 100) — fewer boxes struggle with it.
            if (best < 0 || rates[i] < rates[best]) best = i;
        }
        return best;
    }

    /** A new window must pin an already-matching mode too, or Android can restore its default. */
    static int windowMode(float fps, float[] rates, int[] widths, int[] heights, int current) {
        if (current < 0 || current >= rates.length || !(fps >= 20 && fps <= 61)) return -1;
        if (fits(fps, rates[current])) return current;
        return pick(fps, rates, widths, heights, widths[current], heights[current], rates[current]);
    }

    /** Frame rate from consecutive presentation times (µs), snapped to broadcast rates; -1 if unclear. */
    static float measure(long[] us) {
        long[] d = new long[us.length - 1];
        for (int i = 1; i < us.length; i++) d[i - 1] = Math.abs(us[i] - us[i - 1]);
        java.util.Arrays.sort(d);
        long mid = d[d.length / 2];
        if (mid <= 0) return -1;
        float fps = 1_000_000f / mid;
        for (float s : new float[]{23.976f, 24f, 25f, 29.97f, 30f, 50f, 59.94f, 60f}) if (Math.abs(fps - s) < 0.3f) return s;
        return -1;
    }

    static boolean fits(float fps, float rate) {
        double m = rate / fps, r = Math.rint(m);
        return r >= 1 && Math.abs(m - r) < 0.01;
    }

    static boolean skip() {
        return Build.VERSION.SDK_INT < 23 || "amazon".equalsIgnoreCase(Build.MANUFACTURER);
    }

    /** Asks for a matching mode; true when the TV is being switched (it goes black for a moment). */
    static boolean apply(Activity a, float fps) { return apply(a, fps, true); }
    /** True when apply would switch the TV, without switching it yet. */
    static boolean wouldSwitch(Activity a, float fps) { return apply(a, fps, false); }
    /** How long the switch note is on screen before the TV is asked to change (it then goes black). */
    static final long NOTE_LEAD_MS = 1500;
    private static boolean apply(Activity a, float fps, boolean doIt) {
        if (skip() || a == null) return false;
        try {
            Display d = a.getWindowManager().getDefaultDisplay();
            Display.Mode cur = d.getMode();
            Display.Mode[] modes = d.getSupportedModes();
            float[] rates = new float[modes.length]; int[] w = new int[modes.length], h = new int[modes.length];
            int current = -1;
            for (int i = 0; i < modes.length; i++) {
                rates[i] = modes[i].getRefreshRate(); w[i] = modes[i].getPhysicalWidth(); h[i] = modes[i].getPhysicalHeight();
                if (modes[i].getModeId() == cur.getModeId()) current = i;
            }
            int i = windowMode(fps, rates, w, h, current);
            if (i < 0) return false;
            WindowManager.LayoutParams lp = a.getWindow().getAttributes();
            if (lp.preferredDisplayModeId == modes[i].getModeId()) return false;
            boolean switching = modes[i].getModeId() != cur.getModeId();
            if (!doIt) return switching;
            lp.preferredDisplayModeId = modes[i].getModeId();
            a.getWindow().setAttributes(lp);
            return switching;
        } catch (Exception ignored) { return false; }
    }

    /** How long the picture stays covered after a switch so the TV's re-sync blank isn't seen mid-picture. */
    static final long SETTLE_MS = 2000;
    /** Longest the picture is held back waiting for the frame rate. */
    static final long MAX_HOLD_MS = 4000;
    /** Cover stays up after the rate is known only when the TV is actually switching. */
    static long uncoverDelay(boolean switched) { return switched ? SETTLE_MS : 0; }

    /** How long the "switching to 50Hz" note stays up (covers the TV's blank and a moment after). */
    static final long NOTE_MS = 5000;
    static int noteHz(float fps) { int r = Math.round(fps); return r > 0 && r <= 30 ? r * 2 : r; }
    static String noteText(float fps) { return "Switching your TV to " + noteHz(fps) + "Hz for a smoother picture…"; }

    /**
     * TV boxes start every BM Player screen at 50Hz (same resolution) so UK 50/25fps channels never
     * need a switch, and its black blank, when they go full screen. Phones and Fire TV are left alone.
     */
    static void prefer50(Activity a) {
        if (!isAndroidTv(a)) return;
        if (!chosen50(a)) return; // only after the customer pressed the 50Hz button on the home screen
        apply(a, 50f);
    }

    /** The customer's own choice from the home-screen 50Hz button; never switched automatically. */
    // Kept only while the app is running: every fresh start opens at the TV's normal setting.
    private static boolean on50;
    static boolean chosen50(Activity a) { return on50; }

    static void setChosen50(Activity a, boolean on) {
        on50 = on;
        if (on) apply(a, 50f); else reset(a);
    }

    static boolean isAndroidTv(Activity a) {
        if (a == null || skip()) return false;
        android.app.UiModeManager ui = (android.app.UiModeManager) a.getSystemService(android.content.Context.UI_MODE_SERVICE);
        return ui != null && ui.getCurrentModeType() == android.content.res.Configuration.UI_MODE_TYPE_TELEVISION;
    }

    static void reset(Activity a) {
        if (skip() || a == null) return;
        try {
            WindowManager.LayoutParams lp = a.getWindow().getAttributes();
            if (lp.preferredDisplayModeId == 0) return;
            lp.preferredDisplayModeId = 0;
            a.getWindow().setAttributes(lp);
        } catch (Exception ignored) {}
    }
}
