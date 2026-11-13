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
        if (!FrameRateMatch.isAndroidTv(this) || !FrameRateMatch.wouldSwitch(this, 50f)) {
            FrameRateMatch.prefer50(this);
            openPlayer();
            return;
        }
        FrameLayout root = new FrameLayout(this);
        android.widget.ImageView art = new android.widget.ImageView(this);
        art.setImageResource(R.drawable.channel_loading);
        art.setScaleType(android.widget.ImageView.ScaleType.CENTER_CROP);
        root.addView(art, new FrameLayout.LayoutParams(-1, -1));
        android.widget.TextView note = new android.widget.TextView(this);
        note.setText(FrameRateMatch.noteText(50f));
        note.setTextSize(24); note.setTextColor(android.graphics.Color.WHITE);
        note.setBackgroundColor(0xDD000000); note.setGravity(android.view.Gravity.CENTER);
        note.setPadding(32, 24, 32, 24);
        root.addView(note, new FrameLayout.LayoutParams(-1, -2, android.view.Gravity.BOTTOM));
        setContentView(root);
        handler.postDelayed(() -> {
            if (isFinishing() || isDestroyed()) return;
            FrameRateMatch.prefer50(this);
            handler.postDelayed(this::openPlayer, FrameRateMatch.SETTLE_MS);
        }, FrameRateMatch.NOTE_LEAD_MS);
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