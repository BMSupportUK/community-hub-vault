package uk.bmsupport.installscreen;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

/** Full-screen install progress shown on the TV. BM TV Enabler sends states with am start extras. */
public final class MainActivity extends Activity {
    private static final int NAVY = Color.rgb(0x16, 0x2a, 0x35), RED = Color.rgb(0xc9, 0x1a, 0x42),
            GREEN = Color.rgb(0x2e, 0xa0, 0x5a), MUTED = Color.rgb(0xc7, 0xd2, 0xd9);
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable close = this::finish;
    private TextView badge, title, detail, count;
    private ProgressBar bar;

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (Build.VERSION.SDK_INT >= 27) setShowWhenLocked(true);
        else getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        root.setBackgroundColor(NAVY);
        root.setPadding(dp(80), dp(40), dp(80), dp(40));
        ImageView logo = new ImageView(this);
        logo.setImageResource(R.drawable.bm_logo);
        logo.setAdjustViewBounds(true);
        root.addView(logo, new LinearLayout.LayoutParams(dp(140), dp(140)));
        badge = text(48, Color.WHITE, true); root.addView(badge);
        title = text(34, Color.WHITE, true); root.addView(title);
        detail = text(22, MUTED, false); root.addView(detail);
        bar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        bar.setMax(100);
        bar.setProgressTintList(android.content.res.ColorStateList.valueOf(RED));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(dp(560), dp(14));
        lp.topMargin = dp(24);
        root.addView(bar, lp);
        count = text(20, MUTED, false); root.addView(count);
        setContentView(root);
        render(getIntent());
    }

    @Override protected void onNewIntent(Intent i) { super.onNewIntent(i); setIntent(i); render(i); }

    private void render(Intent i) {
        InstallState s = InstallState.from(i.getStringExtra("state"), i.getStringExtra("app"),
                i.getIntExtra("index", 0), i.getIntExtra("total", 0), i.getStringExtra("apps"));
        handler.removeCallbacks(close);
        badge.setText(s.badge);
        badge.setTextColor(s.kind == InstallState.COMPLETE ? GREEN : s.kind == InstallState.ERROR ? RED : Color.WHITE);
        title.setText(s.title);
        detail.setText(s.detail);
        count.setText(s.count);
        bar.setVisibility(s.percent >= 0 ? android.view.View.VISIBLE : android.view.View.GONE);
        if (s.percent >= 0) bar.setProgress(s.percent);
        if (s.kind == InstallState.COMPLETE) handler.postDelayed(close, 30_000);
    }

    @Override public boolean onKeyDown(int code, KeyEvent e) {
        if (code == KeyEvent.KEYCODE_DPAD_CENTER || code == KeyEvent.KEYCODE_ENTER || code == KeyEvent.KEYCODE_BACK) { finish(); return true; }
        return super.onKeyDown(code, e);
    }

    @Override protected void onDestroy() { handler.removeCallbacks(close); super.onDestroy(); }

    private TextView text(int sp, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setTextSize(sp); t.setTextColor(color); t.setGravity(Gravity.CENTER);
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        t.setPadding(0, dp(10), 0, 0);
        return t;
    }

    private int dp(int v) { return Math.round(v * getResources().getDisplayMetrics().density); }
}
