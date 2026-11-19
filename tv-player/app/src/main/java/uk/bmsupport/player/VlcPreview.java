package uk.bmsupport.player;

import android.content.Context;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import java.util.ArrayList;
import org.videolan.libvlc.LibVLC;
import org.videolan.libvlc.Media;
import org.videolan.libvlc.MediaPlayer;
import org.videolan.libvlc.util.VLCVideoLayout;

/** Live TV guide preview played by the built-in backup engine (libVLC), the same engine full screen uses. */
final class VlcPreview {
    static final VlcHandoff<Session> forward = new VlcHandoff<>();
    static final VlcHandoff<Session> backward = new VlcHandoff<>();
    static final class Session implements AutoCloseable {
        final LibVLC vlc;
        final MediaPlayer player;
        final SoundBoost.Vlc boost;
        final String[] urls;
        final int index;
        VlcStage stage;
        Session(LibVLC vlc, MediaPlayer player, SoundBoost.Vlc boost, String[] urls, int index) {
            this.vlc = vlc; this.player = player; this.boost = boost; this.urls = urls; this.index = index;
        }
        @Override public void close() {
            player.setEventListener(null);
            player.stop(); player.detachViews(); player.release(); vlc.release();
            if (boost != null) boost.release();
            if (stage != null) stage.close();
        }
    }

    /** Move ownership without stopping, setting media, or playing a new address. */
    Session takeSession() {
        if (released || mp == null || !playing) return null;
        released = true;
        ui.removeCallbacksAndMessages(null);
        mp.setEventListener(null);
        Session session = new Session(vlc, mp, boost, urls, at);
        session.stage = stage;
        if (stage != null) { stage.player = mp; stage.full(true); }
        else {
            mp.detachViews();
            if (host != null && layout != null) host.removeView(layout);
        }
        stage = null;
        mp = null; vlc = null; boost = null; layout = null; host = null;
        return session;
    }
    interface Listener { void playing(); void failed(); }
    private final android.os.Handler ui = new android.os.Handler(android.os.Looper.getMainLooper());
    private LibVLC vlc;
    private MediaPlayer mp;
    private VLCVideoLayout layout;
    private ViewGroup host;
    private VlcStage stage;
    private String[] urls;
    private int at, errors;
    private boolean released, playing, muted;
    private final Context ctx;
    private final LiveRideThrough ride = new LiveRideThrough();
    private final LiveReconnect reconnect = new LiveReconnect();
    private boolean retryQueued, failed;
    private final Runnable retry = () -> { retryQueued = false; open(); };
    private void reconnect() {
        if (released || failed || retryQueued) return;
        long wait = reconnect.failed(android.os.SystemClock.elapsedRealtime());
        if (wait < 0) { failed = true; listener.failed(); return; }
        retryQueued = true;
        ui.postDelayed(retry, wait);
    }
    private Listener listener;
    private final Runnable watch = new Runnable() {
        @Override public void run() {
            if (released || failed || mp == null) return;
            long now = android.os.SystemClock.elapsedRealtime();
            if (ride.stable(now)) { errors = 0; ride.freezeReopens = 0; }
            try {
                org.videolan.libvlc.interfaces.IMedia media = mp.getMedia();
                if (media != null) {
                    org.videolan.libvlc.interfaces.IMedia.Stats st = media.getStats();
                    media.release();
                    if (st != null && !retryQueued) {
                        if (reconnect.stalled(st.displayedPictures, st.decodedAudio, now)) reconnect();
                        else if (playing && ride.frozen(st.displayedPictures, st.decodedAudio, now) && ride.allowFreezeReopen()) open();
                    }
                }
            } catch (RuntimeException ignored) {}
            ui.postDelayed(this, 1000);
        }
    };

    void setMuted(boolean m) { muted = m; applyVolume(); }
    boolean isPlaying() { return playing && !released; }
    private void applyVolume() { if (mp != null && !released) mp.setVolume(SoundBoost.vlcVolume(boost != null && boost.enhanced(), SoundBoost.current(ctx), muted)); }
    private SoundBoost.Vlc boost;

    /** Same direct gain as full-screen live TV, retaining the pane's mute state. */
    void applyBoost() {
        if (mp == null || released) return;
        try {
            mp.setEqualizer(null);
            if (boost != null) boost.apply(SoundBoost.gainFor(SoundBoost.current(ctx)));
            applyVolume();
        } catch (Exception ignored) {}
    }

    VlcPreview(Context c, ViewGroup host, String[] urls, Listener l) { this(c, host, -1, urls, l); }

    /** index: where the picture goes in host (-1 = on top), so Multi-screen labels stay above it. */
    VlcPreview(Context c, ViewGroup host, int index, String[] urls, Listener l) {
        this(c, host, index, urls, l, null);
    }

    VlcPreview(Context c, ViewGroup host, String[] urls, Listener l, Session carried) {
        this(c, host, -1, urls, l, carried);
    }

    private VlcPreview(Context c, ViewGroup host, int index, String[] urls, Listener l, Session carried) {
        this.ctx = c.getApplicationContext(); this.host = host; this.urls = urls; this.listener = l;
        if (carried != null) {
            vlc = carried.vlc; mp = carried.player; boost = carried.boost;
            this.urls = carried.urls; at = carried.index;
            playing = mp.isPlaying();
        } else {
        ArrayList<String> opts = new ArrayList<>();
        opts.add("--network-caching=" + BackupBufferPolicy.previewCacheMs());
        opts.add("--http-reconnect");
        opts.add("--no-audio-time-stretch");
        boost = SoundBoost.vlc(c, opts);
        vlc = new LibVLC(c, opts);
        mp = new MediaPlayer(vlc);
        }
        if (carried != null && carried.stage != null) {
            stage = carried.stage; stage.player = mp; stage.full(false);
            layout = (VLCVideoLayout) stage.picture;
        } else {
            layout = new VLCVideoLayout(c);
            if (index == -1 && c instanceof android.app.Activity) { stage = new VlcStage((android.app.Activity)c, host, layout); stage.player = mp; }
            else host.addView(layout, index, new FrameLayout.LayoutParams(-1, -1));
            mp.attachViews(layout, null, false, false);
        }
        mp.setEventListener(ev -> {
            if (released) return;
            if (ev.type == MediaPlayer.Event.Playing) ui.post(() -> { if (!released && !failed) { ui.removeCallbacks(retry); retryQueued = false; reconnect.recovered(); applyVolume(); applyBoost(); playing = true; ride.playing(android.os.SystemClock.elapsedRealtime()); l.playing(); } });
            else if (ev.type == MediaPlayer.Event.EncounteredError || ev.type == MediaPlayer.Event.EndReached) ui.post(() -> {
                if (released) return;
                reconnect();
            });
        });
        if (carried == null) open();
        else { applyBoost(); ride.playing(android.os.SystemClock.elapsedRealtime()); l.playing(); }
        reconnect.opened(android.os.SystemClock.elapsedRealtime());
        ui.postDelayed(watch, 1000);
    }

    private void open() {
        if (released || failed || urls == null || urls.length == 0) return;
        playing = false;
        reconnect.opened(android.os.SystemClock.elapsedRealtime());
        ride.stopped(); ride.resetSamples();
        Media m = new Media(vlc, android.net.Uri.parse(urls[at]));
        mp.setMedia(m); m.release(); applyBoost(); mp.play();
    }

    void release() {
        if (released) return;
        released = true;
        ui.removeCallbacksAndMessages(null);
        try { mp.stop(); mp.detachViews(); mp.release(); vlc.release(); } catch (RuntimeException ignored) {}
        if (boost != null) boost.release();
        if (host != null && layout != null) host.removeView(layout);
        if (stage != null) { stage.close(); stage = null; }
        mp = null; vlc = null; layout = null; host = null;
    }
}
