package uk.bmsupport.player;

/**
 * Catch up Fast forward / Back 1 min. Presses stack ("⏩ +3 min") and the recording reopens once,
 * DEBOUNCE_MS after the last press, because timeshift recordings cannot seek in place.
 */
final class CatchupSeek {
    static final long DEBOUNCE_MS = 1500;
    static final int MAX_PENDING_MIN = 30;
    interface Target { void jumpMinutes(int minutes); }

    private int pending;
    /** Add one press (+1 or -1); returns the stacked total, kept to ±MAX_PENDING_MIN. */
    int press(int delta) { pending = Math.max(-MAX_PENDING_MIN, Math.min(MAX_PENDING_MIN, pending + delta)); return pending; }
    int pending() { return pending; }
    /** Take the stacked total and reset it. */
    int take() { int p = pending; pending = 0; return p; }
    static String label(int pending) {
        if (pending > 0) return "⏩ +" + pending + " min";
        if (pending < 0) return "⏪ " + pending + " min";
        return "⏩ Fast forward";
    }

    final android.widget.LinearLayout row;
    final android.widget.Button forward, back;
    private final android.os.Handler ui;
    private final Runnable commit;

    CatchupSeek() { row = null; forward = null; back = null; commit = null; ui = null; }

    CatchupSeek(android.content.Context c, Target target, Runnable onUse) {
        ui = new android.os.Handler(android.os.Looper.getMainLooper());
        row = new android.widget.LinearLayout(c);
        row.setOrientation(android.widget.LinearLayout.HORIZONTAL);
        back = new android.widget.Button(c);
        forward = new android.widget.Button(c);
        back.setText("⏪ Back 1 min"); back.setAllCaps(false);
        forward.setText(label(0)); forward.setAllCaps(false);
        row.addView(back); row.addView(forward);
        ring(back); ring(forward);
        commit = () -> {
            int m = take();
            forward.setText(label(0));
            if (m != 0) target.jumpMinutes(m);
        };
        android.view.View.OnClickListener l = v -> {
            int p = press(v == forward ? 1 : -1);
            forward.setText(label(p));
            ui.removeCallbacks(commit); ui.postDelayed(commit, DEBOUNCE_MS);
            wake();
            if (onUse != null) onUse.run();
        };
        back.setOnClickListener(l); forward.setOnClickListener(l);
        // Holding OK / the button keeps counting up quickly.
        forward.setOnLongClickListener(v -> { for (int i = 0; i < 5; i++) press(1); forward.setText(label(pending));
            ui.removeCallbacks(commit); ui.postDelayed(commit, DEBOUNCE_MS); if (onUse != null) onUse.run(); return true; });
    }
    /** A clear white box round the button the remote is on, so you can see where you are. */
    private static void ring(android.widget.Button b) {
        float d = b.getResources().getDisplayMetrics().density;
        android.graphics.drawable.GradientDrawable on = new android.graphics.drawable.GradientDrawable();
        on.setColor(0xCC0B1A33); on.setCornerRadius(10 * d); on.setStroke((int) (3 * d), 0xFFFFFFFF);
        android.graphics.drawable.GradientDrawable off = new android.graphics.drawable.GradientDrawable();
        off.setColor(0x990B1A33); off.setCornerRadius(10 * d); off.setStroke((int) (1 * d), 0x66FFFFFF);
        android.graphics.drawable.StateListDrawable sl = new android.graphics.drawable.StateListDrawable();
        sl.addState(new int[]{android.R.attr.state_focused}, on);
        sl.addState(new int[]{android.R.attr.state_pressed}, on);
        sl.addState(new int[]{}, off);
        b.setBackground(sl); b.setTextColor(0xFFFFFFFF); b.setFocusable(true);
        b.setPadding((int) (16 * d), (int) (8 * d), (int) (16 * d), (int) (8 * d));
        android.widget.LinearLayout.LayoutParams lp = new android.widget.LinearLayout.LayoutParams(-2, -2);
        lp.setMargins((int) (6 * d), 0, (int) (6 * d), 0); b.setLayoutParams(lp);
    }
    /** OK/Enter presses whichever button is focused (Fast forward when neither is). */
    void click() { if (back != null && back.isFocused()) back.performClick(); else if (forward != null) forward.performClick(); }
    boolean hasFocus() { return row != null && (forward.isFocused() || back.isFocused()); }
    void cancel() { if (commit != null) ui.removeCallbacks(commit); if (ui != null) ui.removeCallbacks(hide); }

    /** Same 3.5-second input timer as the Windows player's controls. */
    static final long SHOW_MS = 3500;
    private final Runnable hide = this::autoHide;
    private void autoHide() { if (row == null) return; if (pending == 0) row.setVisibility(android.view.View.GONE); else wake(); }
    /** Sit at the bottom of the player, just above the playback bar, like Windows. */
    void attach(android.widget.FrameLayout root) {
        android.widget.FrameLayout.LayoutParams lp = new android.widget.FrameLayout.LayoutParams(-2, -2,
                android.view.Gravity.BOTTOM | android.view.Gravity.CENTER_HORIZONTAL);
        lp.bottomMargin = (int) (110 * root.getResources().getDisplayMetrics().density);
        root.addView(row, lp);
        forward.requestFocus();
        wake();
    }
    /** Any key or touch brings the buttons back; they hide again after SHOW_MS without input. */
    void wake() {
        if (row == null) return;
        // Never take focus here: every press passes through wake(), and grabbing focus stopped the remote
        // reaching Subtitles, VPN and the other controls.
        row.setVisibility(android.view.View.VISIBLE);
        ui.removeCallbacks(hide); ui.postDelayed(hide, SHOW_MS);
    }
    boolean shown() { return row != null && row.getParent() != null && row.getVisibility() == android.view.View.VISIBLE; }
}
