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
    @Override protected void attachBaseContext(android.content.Context b) { super.attachBaseContext(PhoneScale.wrap(b)); }
    private androidx.media3.ui.PlayerControlView controller;
    private android.widget.LinearLayout controlsRow;
    private BackupControlPlayer controlPlayer;
    private long lastPressAt;
    private final Runnable hideControls = new Runnable() {
        @Override public void run() {
            if (InactivityPolicy.hideControls(lastPressAt, android.os.SystemClock.elapsedRealtime())) {
                if (controller != null) controller.hide();
                if (controlsRow != null) controlsRow.setVisibility(android.view.View.GONE);
            }
            ui.postDelayed(this, 1000);
        }
    };
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
            if (controlPlayer != null) controlPlayer.refresh();
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
        installControls(root);
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
                    applyBoost();
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
        lastPressAt = android.os.SystemClock.elapsedRealtime();
        ui.postDelayed(hideControls, 1000);
    }

    private String kind() { return PlayerActionControls.kind(this); }

    private void applyBoost() {
        if (mp == null) return;
        try {
            MediaPlayer.Equalizer equalizer = MediaPlayer.Equalizer.create();
            equalizer.setPreAmp(SoundBoost.gainFor(SoundBoost.current(this)) / 100f);
            mp.setEqualizer(equalizer);
        } catch (Exception ignored) {}
    }

    private void setPlaying(boolean play) {
        if (mp == null) return;
        if (!play) reportStall(stallTracker.finish(android.os.SystemClock.elapsedRealtime()), false);
        paused = !play;
        if (play) { feedStatus.playing(android.os.SystemClock.elapsedRealtime()); mp.play(); } else mp.pause();
        updateFeedNote();
    }

    private void installControls(FrameLayout root) {
        controller = new androidx.media3.ui.PlayerControlView(this);
        controller.setShowTimeoutMs((int)InactivityPolicy.CONTROLS_MS);
        controller.setShowFastForwardButton(PlayerControls.canSkip(kind()));
        controller.setShowRewindButton(PlayerControls.canSkip(kind()));
        controlPlayer = new BackupControlPlayer(new BackupControlPlayer.Engine() {
            public long position() { return mp == null ? 0 : mp.getTime(); }
            public long duration() { return mp == null ? 0 : mp.getLength(); }
            public boolean ready() { return started; }
            public boolean paused() { return BackupPlayerActivity.this.paused; }
            public void play(boolean play) { setPlaying(play); }
            public void seek(long position) { if (mp != null) mp.setTime(position); }
            public float speed() { return mp == null ? 1 : mp.getRate(); }
            public void speed(float speed) { if (mp != null) mp.setRate(speed); }
            public androidx.media3.common.Tracks tracks() { return backupTracks(); }
            public void tracks(androidx.media3.common.TrackSelectionParameters p) { selectTracks(p); }
        }, kind());
        controller.setPlayer(controlPlayer);
        root.addView(controller, new FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM));
        controlsRow = PlayerActionControls.add(this, root, this::applyBoost,
                () -> PlayerActionControls.report(this),
                () -> PlayerActionControls.swap(this, false, () -> { if (mp != null) mp.stop(); }));
        controller.addVisibilityListener(visibility -> {
            controlsRow.setVisibility(visibility);
            if (visibility == android.view.View.VISIBLE) lastPressAt = android.os.SystemClock.elapsedRealtime();
        });
        root.setOnClickListener(v -> showControls());
        controller.show();
    }

    private androidx.media3.common.Tracks backupTracks() {
        if (mp == null) return androidx.media3.common.Tracks.EMPTY;
        java.util.List<androidx.media3.common.Tracks.Group> groups = new java.util.ArrayList<>();
        addTracks(groups, mp.getAudioTracks(), mp.getAudioTrack(), "audio", androidx.media3.common.MimeTypes.AUDIO_AAC);
        addTracks(groups, mp.getSpuTracks(), mp.getSpuTrack(), "subtitle", androidx.media3.common.MimeTypes.APPLICATION_SUBRIP);
        return new androidx.media3.common.Tracks(groups);
    }

    private void addTracks(java.util.List<androidx.media3.common.Tracks.Group> groups, MediaPlayer.TrackDescription[] descriptions, int selected, String kind, String mime) {
        if (descriptions == null) return;
        for (MediaPlayer.TrackDescription track : descriptions) {
            if (track.id < 0) continue;
            androidx.media3.common.Format format = new androidx.media3.common.Format.Builder().setId(kind + ":" + track.id).setLabel(track.name).setSampleMimeType(mime).build();
            androidx.media3.common.TrackGroup group = new androidx.media3.common.TrackGroup(kind + ":" + track.id, format);
            groups.add(new androidx.media3.common.Tracks.Group(group, false, new int[]{androidx.media3.common.C.FORMAT_HANDLED}, new boolean[]{selected == track.id}));
        }
    }

    private void selectTracks(androidx.media3.common.TrackSelectionParameters p) {
        if (mp == null) return;
        if (p.disabledTrackTypes.contains(androidx.media3.common.C.TRACK_TYPE_TEXT)) mp.setSpuTrack(-1);
        for (androidx.media3.common.TrackSelectionOverride override : p.overrides.values()) {
            if (override.trackIndices.isEmpty()) continue;
            String id = override.mediaTrackGroup.getFormat(override.trackIndices.get(0)).id;
            if (id == null) continue;
            try {
                if (id.startsWith("audio:")) mp.setAudioTrack(Integer.parseInt(id.substring(6)));
                if (id.startsWith("subtitle:") && !p.disabledTrackTypes.contains(androidx.media3.common.C.TRACK_TYPE_TEXT)) mp.setSpuTrack(Integer.parseInt(id.substring(9)));
            } catch (NumberFormatException ignored) {}
        }
    }

    private void showControls() {
        lastPressAt = android.os.SystemClock.elapsedRealtime();
        if (controller != null) controller.show();
        if (controlsRow != null) controlsRow.setVisibility(android.view.View.VISIBLE);
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
        if (PlayerApplication.closeAnnouncementOnBack(this, e)) return true;
        PlayerApplication.interaction(this);
        if (e.getAction() == KeyEvent.ACTION_DOWN && mp != null) {
            switch (e.getKeyCode()) {
                case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE: setPlaying(paused); showControls(); return true;
                case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD: case KeyEvent.KEYCODE_MEDIA_REWIND:
                    if (PlayerControls.canSkip(kind()) && mp.getLength() > 0) controlPlayer.seekTo(Math.max(0, Math.min(mp.getLength(), mp.getTime() + (e.getKeyCode() == KeyEvent.KEYCODE_MEDIA_FAST_FORWARD ? 15000 : -5000))));
                    return true;
                case KeyEvent.KEYCODE_DPAD_CENTER: case KeyEvent.KEYCODE_ENTER:
                case KeyEvent.KEYCODE_DPAD_LEFT: case KeyEvent.KEYCODE_DPAD_RIGHT:
                case KeyEvent.KEYCODE_DPAD_UP: case KeyEvent.KEYCODE_DPAD_DOWN:
                    if (controller != null && !controller.isVisible()) { showControls(); controller.findViewById(androidx.media3.ui.R.id.exo_play_pause).requestFocus(); return true; }
                    break;
                default: break;
            }
        }
        return super.dispatchKeyEvent(e);
    }

    @Override public void onUserInteraction() {
        super.onUserInteraction(); lastPressAt = android.os.SystemClock.elapsedRealtime(); PlayerApplication.interaction(this);
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
        if (controller != null) controller.setPlayer(null);
        if (controlPlayer != null) controlPlayer.release();
        ProgressSync.push(this, true);
        if (mp != null) { mp.stop(); mp.detachViews(); mp.release(); mp = null; }
        if (vlc != null) { vlc.release(); vlc = null; }
        super.onDestroy();
    }
}
