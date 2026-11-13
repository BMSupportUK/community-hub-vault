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
    private boolean released;

    VlcPreview(Context c, ViewGroup host, String[] urls, Listener l) {
        this.host = host; this.urls = urls;
        ArrayList<String> opts = new ArrayList<>();
        opts.add("--network-caching=" + BackupBufferPolicy.previewCacheMs());
        opts.add("--http-reconnect");
        opts.add("--no-audio-time-stretch");
        vlc = new LibVLC(c, opts);
        mp = new MediaPlayer(vlc);
        layout = new VLCVideoLayout(c);
        host.addView(layout, new FrameLayout.LayoutParams(-1, -1));
        mp.attachViews(layout, null, false, false);
        mp.setEventListener(ev -> {
            if (released) return;
            if (ev.type == MediaPlayer.Event.Playing) ui.post(() -> { if (!released) l.playing(); });
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
        mp.setMedia(m); m.release(); mp.play();
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
