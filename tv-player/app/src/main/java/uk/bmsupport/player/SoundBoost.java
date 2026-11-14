package uk.bmsupport.player;

import android.content.Context;
import android.media.AudioManager;
import android.media.audiofx.LoudnessEnhancer;

import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.analytics.AnalyticsListener;

import java.util.Collections;
import java.util.Map;
import java.util.WeakHashMap;

/** Sound booster: a LoudnessEnhancer on each built-in player's audio session. Level is saved per device. */
final class SoundBoost {
    static final String KEY = "sound_boost";
    static final String[] IDS = {"off", "low", "medium", "high", "max"};
    static final String[] LABELS = {"Off", "Low (+6 dB)", "Medium (+12 dB)", "High (+18 dB)", "Max (+24 dB)"};
    static final int[] GAIN_MB = {0, 600, 1200, 1800, 2400};
    /** Level used until the viewer picks one: broadcast TV is mastered quiet, so start boosted. */
    static final String DEFAULT = "medium";
    static final String HIGH_NOTE = "Very loud — may distort on small speakers.";
    private static final Map<ExoPlayer, Holder> live = Collections.synchronizedMap(new WeakHashMap<>());

    private SoundBoost() {}

    static int index(String id) { for (int i = 0; i < IDS.length; i++) if (IDS[i].equals(id)) return i; return 0; }
    static int gainFor(String id) { return GAIN_MB[index(id)]; }
    /** Fallback only (no enhancer on the libVLC session): libVLC cubes volume above 100%, so invert that curve. Raw gain clips loud peaks. */
    static int vlcVolumeFor(String id, boolean muted) {
        if (muted) return 0;
        return Math.min(200, (int) Math.round(100 * Math.pow(10, Math.min(1800, gainFor(id)) / 6000.0)));
    }
    /** With LoudnessEnhancer on libVLC's own audio session, libVLC stays at unity so peaks are limited, not clipped. */
    static int vlcVolume(boolean enhanced, String id, boolean muted) { return muted ? 0 : enhanced ? 100 : vlcVolumeFor(id, false); }
    static String next(String id) { return IDS[(index(id) + 1) % IDS.length]; }
    /** 5.25: the booster made no audible difference on any box, so the level is fixed at the default and the controls are hidden everywhere. */
    static boolean fixed() { return true; }
    static String current(Context c) { return fixed() ? DEFAULT : IDS[index(PlayerActivity.prefs(c).getString(KEY, DEFAULT))]; }
    static String label(Context c) { return LABELS[index(current(c))]; }

    static void set(Context c, String id) {
        PlayerActivity.prefs(c).edit().putString(KEY, IDS[index(id)]).apply();
        int mb = gainFor(id);
        synchronized (live) { for (Holder h : live.values()) h.apply(mb); }
        synchronized (vlcLive) { for (Vlc v : vlcLive.keySet()) v.apply(mb); }
        deviceVolume(c.getApplicationContext());
    }

    // The effect can't push audio past full scale, so a quiet box media volume caps every level.
    // While anything plays with the booster on, the box's own media volume goes to maximum; it is restored afterwards.
    private static int users; private static int savedVolume = -1;
    static synchronized void hold(Context app) { users++; deviceVolume(app); }
    static synchronized void unhold(Context app) { if (users > 0) users--; if (users == 0) restoreVolume(app); }
    static boolean raisesDeviceVolume(String id) { return false; }
    private static synchronized void deviceVolume(Context app) {
        // 5.23: never touch the box's own volume again (forcing it to full was far too loud). Only undo an earlier raise.
        restoreVolume(app);
        if (true) return;
        try {
            AudioManager am = (AudioManager) app.getSystemService(Context.AUDIO_SERVICE);
            if (am == null || am.isVolumeFixed()) return;
            int max = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC), now = am.getStreamVolume(AudioManager.STREAM_MUSIC);
            if (now >= max) return;
            if (savedVolume < 0) savedVolume = now;
            am.setStreamVolume(AudioManager.STREAM_MUSIC, max, 0);
        } catch (Throwable ignored) {}
    }
    private static synchronized void restoreVolume(Context app) {
        if (savedVolume < 0) return;
        try {
            AudioManager am = (AudioManager) app.getSystemService(Context.AUDIO_SERVICE);
            if (am != null && !am.isVolumeFixed()) am.setStreamVolume(AudioManager.STREAM_MUSIC, savedVolume, 0);
        } catch (Throwable ignored) {}
        savedVolume = -1;
    }

    private static final Map<Vlc, Boolean> vlcLive = Collections.synchronizedMap(new WeakHashMap<>());

    /** Creates a fixed audio session for a libVLC instance (passed as --audiotrack-session-id) with Android's limiter-backed LoudnessEnhancer on it. */
    static Vlc vlc(Context c, java.util.List<String> opts) {
        Vlc v = new Vlc(c.getApplicationContext());
        if (v.session > 0) opts.add("--audiotrack-session-id=" + v.session);
        vlcLive.put(v, Boolean.TRUE);
        return v;
    }

    static final class Vlc {
        final Context app; final int session; LoudnessEnhancer fx;
        Vlc(Context app) {
            this.app = app; int id = 0;
            try { AudioManager am = (AudioManager) app.getSystemService(Context.AUDIO_SERVICE); id = am == null ? 0 : am.generateAudioSessionId(); } catch (Throwable ignored) {}
            session = id > 0 ? id : 0;
            if (session > 0) { try { fx = new LoudnessEnhancer(session); } catch (Throwable e) { fx = null; } }
            apply(gainFor(current(app)));
            hold(app);
        }
        synchronized boolean enhanced() { return fx != null; }
        synchronized void apply(int mb) {
            if (fx == null) return;
            try { fx.setTargetGain(mb); fx.setEnabled(mb > 0); } catch (Throwable ignored) {}
        }
        synchronized void release() {
            if (vlcLive.remove(this) != null) unhold(app);
            if (fx != null) { try { fx.release(); } catch (Throwable ignored) {} fx = null; }
        }
    }

    static void attach(Context c, ExoPlayer p) {
        Holder h = new Holder(c.getApplicationContext());
        live.put(p, h); hold(h.app);
        p.addAnalyticsListener(h);
        try { int s = p.getAudioSessionId(); if (s != 0) h.bind(s); } catch (Throwable ignored) {}
    }

    static void release(ExoPlayer p) { Holder h = live.remove(p); if (h != null) h.finish(); }

    private static final class Holder implements AnalyticsListener {
        final Context app; LoudnessEnhancer fx; int session;
        Holder(Context app) { this.app = app; }
        @Override public void onAudioSessionIdChanged(EventTime t, int id) { bind(id); }
        private boolean finished;
        @Override public void onPlayerReleased(EventTime t) { finish(); }
        synchronized void finish() { close(); if (!finished) { finished = true; unhold(app); } }
        synchronized void bind(int id) {
            if (id == session && fx != null) return;
            close(); session = id;
            if (id == 0) return;
            try { fx = new LoudnessEnhancer(id); apply(gainFor(current(app))); } catch (Throwable e) { fx = null; }
        }
        synchronized void apply(int mb) {
            if (fx == null) return;
            try { fx.setTargetGain(mb); fx.setEnabled(mb > 0); } catch (Throwable ignored) {}
        }
        synchronized void close() { if (fx != null) { try { fx.release(); } catch (Throwable ignored) {} fx = null; } }
    }
}
