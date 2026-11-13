package uk.bmsupport.player;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.widget.FrameLayout;
import android.widget.VideoView;

/** Local, offline-capable opening film; never interrupts playback or reminder links. */
public class IntroActivity extends Activity {
    private final Handler handler = new Handler(Looper.getMainLooper());
    private VideoView video;
    private boolean opened;
    private boolean preparingDisplay;
    private final Runnable next = this::afterVideo;

    @Override protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        if (saved != null || !isTaskRoot()) { openPlayer(); return; }
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(android.graphics.Color.BLACK);
        video = new VideoView(this);
        root.addView(video, new FrameLayout.LayoutParams(-1, -1, android.view.Gravity.CENTER));
        setContentView(root);
        video.setVideoURI(Uri.parse("android.resource://" + getPackageName() + "/" + R.raw.player_intro));
        video.setOnPreparedListener(player -> {
            player.setLooping(false);
            player.setVolume(0.65f, 0.65f);
            video.start();
            handler.removeCallbacks(next);
            handler.postDelayed(next, 5500);
        });
        video.setOnCompletionListener(player -> afterVideo());
        video.setOnErrorListener((player, what, extra) -> { afterVideo(); return true; });
        handler.postDelayed(next, 8000);
    }

    private void afterVideo() {
        if (opened || preparingDisplay || isFinishing()) return;
        preparingDisplay = true;
        handler.removeCallbacks(next);
        if (video != null) video.stopPlayback();
        if (true) { // no automatic 50Hz prompt any more: the home screen has a 50Hz button
            FrameRateMatch.prefer50(this);
            openPlayer();
            return;
        }
        FrameLayout root = new FrameLayout(this);
        android.widget.ImageView art = new android.widget.ImageView(this);
        art.setImageResource(R.drawable.channel_loading);
        art.setScaleType(android.widget.ImageView.ScaleType.CENTER_CROP);
        root.addView(art, new FrameLayout.LayoutParams(-1, -1));
        android.widget.LinearLayout box = new android.widget.LinearLayout(this);
        box.setOrientation(android.widget.LinearLayout.VERTICAL);
        box.setGravity(android.view.Gravity.CENTER);
        box.setBackgroundColor(0xDD000000);
        float density = getResources().getDisplayMetrics().density;
        int inset = Math.round(16 * density);
        box.setPadding(inset, inset, inset, inset);
        android.widget.TextView note = new android.widget.TextView(this);
        note.setText("Switch your TV to 50Hz\n\nThis helps your TV show smoother streaming and motion.\n\nA black screen will appear for a few seconds while your TV switches.\n\nPress OK to switch and continue.");
        note.setTextSize(18); note.setTextColor(android.graphics.Color.WHITE);
        note.setGravity(android.view.Gravity.CENTER);
        android.widget.ScrollView message = new android.widget.ScrollView(this);
        message.setFillViewport(true);
        message.addView(note, new android.widget.ScrollView.LayoutParams(-1, -2));
        box.addView(message, new android.widget.LinearLayout.LayoutParams(-1, 0, 1));
        android.widget.Button ok = new android.widget.Button(this);
        ok.setText("OK");
        ok.setContentDescription("OK, switch TV to 50Hz");
        ok.setTextSize(20);
        ok.setSingleLine(true);
        ok.setMinHeight(Math.round(56 * density));
        android.widget.LinearLayout.LayoutParams buttonLayout = new android.widget.LinearLayout.LayoutParams(Math.round(160 * density), -2);
        buttonLayout.topMargin = Math.round(12 * density);
        box.addView(ok, buttonLayout);
        FrameLayout.LayoutParams boxLayout = new FrameLayout.LayoutParams(-1, -1, android.view.Gravity.CENTER);
        android.util.DisplayMetrics metrics = getResources().getDisplayMetrics();
        int safeX = Math.max(inset, Math.round(metrics.widthPixels * 0.08f));
        int safeY = Math.max(inset, Math.round(metrics.heightPixels * 0.10f));
        boxLayout.setMargins(safeX, safeY, safeX, safeY);
        root.addView(box, boxLayout);
        setContentView(root);
        ok.setOnClickListener(v -> {
            if (opened || isFinishing() || isDestroyed()) return;
            ok.setEnabled(false);
            FrameRateMatch.prefer50(this);
            openPlayer();
        });
        ok.requestFocus();
    }

    private void openPlayer() {
        if (opened || isFinishing() || isDestroyed()) return;
        opened = true;
        handler.removeCallbacks(next);
        if (video != null) video.stopPlayback();
        startActivity(new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP));
        finish();
    }

    @Override protected void onPause() {
        super.onPause();
        if (video != null) video.pause();
    }

    @Override protected void onResume() {
        super.onResume();
        if (video != null && !opened && !preparingDisplay) video.start();
    }

    @Override protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        if (video != null) video.stopPlayback();
        super.onDestroy();
    }
}