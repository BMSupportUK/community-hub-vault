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
    private final Runnable next = this::openPlayer;

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
        video.setOnCompletionListener(player -> openPlayer());
        video.setOnErrorListener((player, what, extra) -> { openPlayer(); return true; });
        handler.postDelayed(next, 8000);
    }

    private void openPlayer() {
        if (opened || isFinishing()) return;
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
        if (video != null && !opened) video.start();
    }

    @Override protected void onDestroy() {
        handler.removeCallbacks(next);
        if (video != null) video.stopPlayback();
        super.onDestroy();
    }
}