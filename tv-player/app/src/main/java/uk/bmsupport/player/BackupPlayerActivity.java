package uk.bmsupport.player;

import android.app.Activity;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.TextView;
import android.widget.Toast;
import java.util.ArrayList;
import org.videolan.libvlc.LibVLC;
import org.videolan.libvlc.Media;
import org.videolan.libvlc.MediaPlayer;
import org.videolan.libvlc.util.VLCVideoLayout;

/**
 * Backup engine built into BM Player (libVLC, plays almost every format). PlayerActivity hands over here
 * by itself when the main player can't open or keep a stream going; customers install nothing extra.
 */
public final class BackupPlayerActivity extends Activity {
    private final Handler ui = new Handler(Looper.getMainLooper());
    private LibVLC vlc;
    private MediaPlayer mp;
    private VLCVideoLayout layout;
    private TextView note;
    private TextView feedNote;
    private String[] urls;
    private int at;
    private boolean started;
    private boolean paused;
    private long resume;
    private final BackupFeedStatus feedStatus = new BackupFeedStatus();
    private final BackupStallTracker stallTracker = new BackupStallTracker();
    private String activeDecoder = "backup:hardware";
    private final Runnable reportTick = new Runnable() {
        @Override public void run() {
            BufferReporter.flush(BackupPlayerActivity.this);
            ui.postDelayed(this, 60000);
        }
    };
    private final Runnable feedTick = new Runnable() {
        @Override public void run() {
            if (mp == null || isFinishing()) return;
            feedStatus.progress(mp.getTime(), android.os.SystemClock.elapsedRealtime());
            updateFeedNote();
            ui.postDelayed(this, 500);
        }
    };

    private void updateFeedNote() {
        if (mp == null || feedNote == null) return;
        // VLC can stop reporting isPlaying during rebuffering; only an explicit user pause suppresses a stall.
        boolean stalled = isLive() && feedStatus.stalled(started, !paused, android.os.SystemClock.elapsedRealtime());
        reportStall(stallTracker.update(stalled, android.os.SystemClock.elapsedRealtime()), false);
        feedNote.setText(FeedStatus.BUFFERING);
        feedNote.setVisibility(stalled ? TextView.VISIBLE : TextView.GONE);
    }

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        layout = new VLCVideoLayout(this);
        root.addView(layout, new FrameLayout.LayoutParams(-1, -1));
        note = new TextView(this);
        note.setTextColor(Color.WHITE); note.setTextSize(16); note.setPadding(24, 16, 24, 16);
        note.setBackgroundColor(0xCC0B1220);
        note.setText("Playing with BM Player backup engine…");
        root.addView(note, new FrameLayout.LayoutParams(-2, -2, Gravity.TOP | Gravity.START));
        // Live feed status pill (top right): shows "Buffering…" while the backup engine rides out a stall.
        feedNote = new TextView(this);
        feedNote.setTextColor(Color.WHITE); feedNote.setTextSize(16); feedNote.setPadding(28, 12, 28, 12);
        feedNote.setBackgroundColor(0xB30B1220);
        feedNote.setVisibility(TextView.GONE);
        root.addView(feedNote, new FrameLayout.LayoutParams(-2, -2, Gravity.TOP | Gravity.END));
        setContentView(root);
        ui.postDelayed(() -> note.setVisibility(TextView.GONE), 4000);

        urls = getIntent().getStringArrayExtra("urls");
        if (urls == null || urls.length == 0) urls = new String[]{getIntent().getStringExtra("url")};
        resume = getIntent().getLongExtra("resume_ms", 0);
        ArrayList<String> opts = new ArrayList<>();
        opts.add("--network-caching=" + BackupBufferPolicy.networkCacheMs(isLive(), PlayerActivity.prefs(this).getString("buffer", StreamRecovery.DEFAULT_BUFFER), recoveryName()));
        opts.add("--http-reconnect");
        vlc = new LibVLC(this, opts);
        mp = new MediaPlayer(vlc);
        mp.attachViews(layout, null, false, false);
        // Films and series fill the screen (zoom, like the main player); live TV and catch up keep their shape.
        if (PlayerControls.canSkip(getIntent().getStringExtra("content_kind"))) mp.setVideoScale(MediaPlayer.ScaleType.SURFACE_FIT_SCREEN);
        mp.setEventListener(ev -> {
            switch (ev.type) {
                case MediaPlayer.Event.Playing:
                    if (!started && resume > 0 && mp.getLength() > 0) mp.setTime(resume);
                    started = true;
                    feedStatus.playing(android.os.SystemClock.elapsedRealtime());
                    feedNote.setVisibility(TextView.GONE);
                    break;
                case MediaPlayer.Event.Buffering:
                    feedStatus.buffering(ev.getBuffering());
                    updateFeedNote();
                    break;
                case MediaPlayer.Event.TimeChanged:
                    feedStatus.progress(ev.getTimeChanged(), android.os.SystemClock.elapsedRealtime());
                    updateFeedNote();
                    break;
                case MediaPlayer.Event.EncounteredError:
                    ui.post(this::next); break;
                case MediaPlayer.Event.EndReached:
                    // Live streams that end are dropped connections: reopen the same address.
                    ui.post(() -> { if (isLive()) open(); else finish(); }); break;
                default: break;
            }
        });
        open();
        ui.post(feedTick);
        ui.postDelayed(reportTick, 60000);
    }

    private boolean isLive() { return "live".equals(getIntent().getStringExtra("content_kind")) || getIntent().getStringExtra("content_kind") == null; }

    private String recoveryName() {
        String name = getIntent().getStringExtra("recovery_name");
        return name == null ? getIntent().getStringExtra("content_name") : name;
    }

    private void reportStall(long duration, boolean reconnected) {
        if (!isLive() || duration < StreamRecovery.MIN_REPORT_MS) return;
        String url = urls != null && at < urls.length && urls[at] != null ? urls[at] : "";
        String format = url.endsWith(".m3u8") ? "m3u8" : url.endsWith(".ts") ? "ts" : "direct";
        BufferReporter.record(this, "live", getIntent().getStringExtra("content_id"), getIntent().getStringExtra("content_name"),
                duration, reconnected, false, "network_drop", format, activeDecoder,
                StreamRecovery.providerTag(recoveryName()), getIntent().getStringExtra("event_name"));
    }

    private void open() {
        if (mp == null) return;
        reportStall(stallTracker.finish(android.os.SystemClock.elapsedRealtime()), true);
        started = false;
        paused = false;
        feedStatus.reset(android.os.SystemClock.elapsedRealtime());
        feedNote.setVisibility(TextView.GONE);
        Media m = new Media(vlc, Uri.parse(urls[at]));
        boolean software = VideoDecodePolicy.preferSoftware("catchup".equals(getIntent().getStringExtra("content_kind")),
                PlayerActivity.prefs(this).getString("decoder", "hardware"), getIntent().getStringExtra("content_name"));
        m.setHWDecoderEnabled(!software, false);
        activeDecoder = software ? "backup:software" : "backup:hardware";
        mp.setMedia(m);
        m.release();
        mp.play();
    }

    private int errors;
    private void next() {
        if (mp == null || isFinishing()) return;
        if (++errors > urls.length * 3) {
            if (isLive()) ChannelHealth.report(this, getIntent().getStringExtra("content_name"), "failed");
            Toast.makeText(this, "This stream couldn't be played by either player. Try again later or report a problem.", Toast.LENGTH_LONG).show();
            finish(); return;
        }
        if (!started && at + 1 < urls.length) at++;
        ui.postDelayed(this::open, started ? 2000 : 300);
    }

    @Override public boolean dispatchKeyEvent(KeyEvent e) {
        PlayerApplication.interaction(this);
        if (e.getAction() == KeyEvent.ACTION_DOWN && mp != null) {
            switch (e.getKeyCode()) {
                case KeyEvent.KEYCODE_DPAD_CENTER: case KeyEvent.KEYCODE_ENTER: case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE:
                    if (!paused) {
                        reportStall(stallTracker.finish(android.os.SystemClock.elapsedRealtime()), false);
                        paused = true;
                        mp.pause();
                    } else {
                        paused = false;
                        feedStatus.playing(android.os.SystemClock.elapsedRealtime());
                        mp.play();
                    }
                    updateFeedNote(); return true;
                case KeyEvent.KEYCODE_DPAD_RIGHT: case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD:
                    if (PlayerControls.canSkip(getIntent().getStringExtra("content_kind")) && mp.getLength() > 0) { mp.setTime(Math.min(mp.getLength(), mp.getTime() + 10000)); return true; } break;
                case KeyEvent.KEYCODE_DPAD_LEFT: case KeyEvent.KEYCODE_MEDIA_REWIND:
                    if (PlayerControls.canSkip(getIntent().getStringExtra("content_kind")) && mp.getLength() > 0) { mp.setTime(Math.max(0, mp.getTime() - 10000)); return true; } break;
                default: break;
            }
        }
        return super.dispatchKeyEvent(e);
    }

    @Override protected void onPause() {
        super.onPause();
        saveProgress();
        if (!isChangingConfigurations()) finish();
    }

    private void saveProgress() {
        String key = getIntent().getStringExtra("progress_key");
        if (mp == null || key == null || isLive()) return;
        long pos = mp.getTime(), len = mp.getLength();
        if (pos <= 0 || len <= 0) return;
        if (pos >= len - 15000) pos = len;
        SharedPreferences.Editor ed = getSharedPreferences("bmplayer", MODE_PRIVATE).edit().putLong(key + ":position", pos).putLong(key + ":duration", len);
        String series = getIntent().getStringExtra("series_key");
        if (series != null) ed.putLong(series + ":position", pos).putLong(series + ":duration", len);
        ProgressSync.touch(getSharedPreferences("bmplayer", MODE_PRIVATE), ed, key, series);
        ed.apply();
        ProgressSync.push(this, false);
    }

    @Override protected void onDestroy() {
        reportStall(stallTracker.finish(android.os.SystemClock.elapsedRealtime()), false);
        BufferReporter.flush(this);
        ui.removeCallbacksAndMessages(null);
        ProgressSync.push(this, true);
        if (mp != null) { mp.stop(); mp.detachViews(); mp.release(); mp = null; }
        if (vlc != null) { vlc.release(); vlc = null; }
        super.onDestroy();
    }
}
