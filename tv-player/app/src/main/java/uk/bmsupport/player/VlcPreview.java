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
    interface Listener { void playing(); void failed(); }
    private final android.os.Handler ui = new android.os.Handler(android.os.Looper.getMainLooper());
    private LibVLC vlc;
    private MediaPlayer mp;
    private VLCVideoLayout layout;
    private ViewGroup host;
    private String[] urls;
    private int at, errors;
    private boolean released, playing, muted;
    private final Context ctx;

    void setMuted(boolean m) { muted = m; applyVolume(); }
    boolean isPlaying() { return playing && !released; }
    private void applyVolume() { if (mp != null && !released) mp.setVolume(muted ? 0 : 100); }

    /** Same sound booster pre-amp as full-screen live TV; re-run when the level changes. */
    void applyBoost() {
        if (mp == null || released) return;
        try {
            MediaPlayer.Equalizer eq = MediaPlayer.Equalizer.create();
            eq.setPreAmp(SoundBoost.gainFor(SoundBoost.current(ctx)) / 100f);
            mp.setEqualizer(eq);
        } catch (Exception ignored) {}
    }

    VlcPreview(Context c, ViewGroup host, String[] urls, Listener l) { this(c, host, -1, urls, l); }

    /** index: where the picture goes in host (-1 = on top), so Multi-screen labels stay above it. */
    VlcPreview(Context c, ViewGroup host, int index, String[] urls, Listener l) {
        this.ctx = c.getApplicationContext(); this.host = host; this.urls = urls;
        ArrayList<String> opts = new ArrayList<>();
        opts.add("--network-caching=" + BackupBufferPolicy.previewCacheMs());
        opts.add("--http-reconnect");
        opts.add("--no-audio-time-stretch");
        vlc = new LibVLC(c, opts);
        mp = new MediaPlayer(vlc);
        layout = new VLCVideoLayout(c);
        host.addView(layout, index, new FrameLayout.LayoutParams(-1, -1));
        mp.attachViews(layout, null, false, false);
        mp.setEventListener(ev -> {
            if (released) return;
            if (ev.type == MediaPlayer.Event.Playing) ui.post(() -> { if (!released) { applyVolume(); applyBoost(); playing = true; l.playing(); } });
            else if (ev.type == MediaPlayer.Event.EncounteredError || ev.type == MediaPlayer.Event.EndReached) ui.post(() -> {
                if (released) return;
                if (++errors > urls.length * 3) { l.failed(); return; }
                if (ev.type == MediaPlayer.Event.EncounteredError && at + 1 < urls.length) at++;
                ui.postDelayed(this::open, 500);
            });
        });
        open();
    }

    private void open() {
        if (released || urls == null || urls.length == 0) return;
        Media m = new Media(vlc, android.net.Uri.parse(urls[at]));
        mp.setMedia(m); m.release(); applyBoost(); mp.play();
    }

    void release() {
        if (released) return;
        released = true;
        ui.removeCallbacksAndMessages(null);
        try { mp.stop(); mp.detachViews(); mp.release(); vlc.release(); } catch (RuntimeException ignored) {}
        if (host != null && layout != null) host.removeView(layout);
        mp = null; vlc = null; layout = null; host = null;
    }
}
