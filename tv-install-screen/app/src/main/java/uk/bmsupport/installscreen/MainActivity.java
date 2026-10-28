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
    private android.widget.Button closeBtn;

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (Build.VERSION.SDK_INT >= 27) setShowWhenLocked(true);
        else getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED);
        FrameLayout root = new FrameLayout(this);
        ImageView bg = new ImageView(this);
        bg.setImageResource(R.drawable.install_bg);
        bg.setScaleType(ImageView.ScaleType.CENTER_CROP);
        root.addView(bg, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT));
        View scrim = new View(this);
        scrim.setBackgroundColor(Color.argb(0xA6, 0x08, 0x14, 0x1b));
        root.addView(scrim, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT));
        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setGravity(Gravity.CENTER);
        GradientDrawable panelBg = new GradientDrawable();
        panelBg.setColor(Color.argb(0xD9, 0x16, 0x2a, 0x35));
        panelBg.setCornerRadius(dp(28));
        panel.setBackground(panelBg);
        panel.setPadding(dp(80), dp(48), dp(80), dp(48));
        ImageView logo = new ImageView(this);
        logo.setImageResource(R.drawable.bm_logo);
        logo.setAdjustViewBounds(true);
        panel.addView(logo, new LinearLayout.LayoutParams(dp(110), dp(110)));
        badge = text(48, Color.WHITE, true); panel.addView(badge);
        title = text(34, Color.WHITE, true); panel.addView(title);
        detail = text(22, MUTED, false); panel.addView(detail);
        bar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        bar.setMax(100);
        bar.setProgressTintList(android.content.res.ColorStateList.valueOf(RED));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(dp(560), dp(14));
        lp.topMargin = dp(24);
        panel.addView(bar, lp);
        count = text(20, MUTED, false); panel.addView(count);
        closeBtn = new android.widget.Button(this);
        closeBtn.setText("Close");
        closeBtn.setTextSize(24); closeBtn.setAllCaps(false); closeBtn.setTextColor(Color.WHITE);
        GradientDrawable btnBg = new GradientDrawable(); btnBg.setColor(RED); btnBg.setCornerRadius(dp(14));
        closeBtn.setBackground(btnBg);
        closeBtn.setPadding(dp(48), dp(14), dp(48), dp(14));
        closeBtn.setFocusable(true);
        closeBtn.setOnClickListener(v -> finish());
        closeBtn.setOnFocusChangeListener((v, f) -> { v.setScaleX(f ? 1.08f : 1f); v.setScaleY(f ? 1.08f : 1f); });
        LinearLayout.LayoutParams cp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        cp.topMargin = dp(28); cp.gravity = Gravity.CENTER_HORIZONTAL;
        panel.addView(closeBtn, cp);
        root.addView(panel, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.WRAP_CONTENT,
                FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.CENTER));
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
        boolean finished = s.kind == InstallState.COMPLETE || s.kind == InstallState.ERROR;
        closeBtn.setVisibility(finished ? View.VISIBLE : View.GONE);
        if (finished) { count.setText(""); closeBtn.requestFocus(); }
    }

    @Override public boolean onKeyDown(int code, KeyEvent e) {
        if (code == KeyEvent.KEYCODE_BACK) { finish(); return true; }
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
