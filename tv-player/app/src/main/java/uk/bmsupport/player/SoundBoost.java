package uk.bmsupport.player;

import android.content.Context;
import android.media.audiofx.LoudnessEnhancer;

import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.analytics.AnalyticsListener;

import java.util.Collections;
import java.util.Map;
import java.util.WeakHashMap;

/** Sound booster: a LoudnessEnhancer on each built-in player's audio session. Level is saved per device. */
final class SoundBoost {
    static final String KEY = "sound_boost";
    static final String[] IDS = {"off", "low", "medium", "high"};
    static final String[] LABELS = {"Off", "Low (+50%)", "Medium (+100%)", "High (+150%)"};
    static final int[] GAIN_MB = {0, 600, 1200, 1800};
    static final String HIGH_NOTE = "Very loud — may distort on small speakers.";
    private static final Map<ExoPlayer, Holder> live = Collections.synchronizedMap(new WeakHashMap<>());

    private SoundBoost() {}

    static int index(String id) { for (int i = 0; i < IDS.length; i++) if (IDS[i].equals(id)) return i; return 0; }
    static int gainFor(String id) { return GAIN_MB[index(id)]; }
    static String next(String id) { return IDS[(index(id) + 1) % IDS.length]; }
    static String current(Context c) { return IDS[index(PlayerActivity.prefs(c).getString(KEY, "off"))]; }
    static String label(Context c) { return LABELS[index(current(c))]; }

    static void set(Context c, String id) {
        PlayerActivity.prefs(c).edit().putString(KEY, IDS[index(id)]).apply();
        int mb = gainFor(id);
        synchronized (live) { for (Holder h : live.values()) h.apply(mb); }
    }

    static void attach(Context c, ExoPlayer p) {
        Holder h = new Holder(c.getApplicationContext());
        live.put(p, h);
        p.addAnalyticsListener(h);
        try { int s = p.getAudioSessionId(); if (s != 0) h.bind(s); } catch (Throwable ignored) {}
    }

    static void release(ExoPlayer p) { Holder h = live.remove(p); if (h != null) h.close(); }

    private static final class Holder implements AnalyticsListener {
        final Context app; LoudnessEnhancer fx; int session;
        Holder(Context app) { this.app = app; }
        @Override public void onAudioSessionIdChanged(EventTime t, int id) { bind(id); }
        @Override public void onPlayerReleased(EventTime t) { close(); }
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
