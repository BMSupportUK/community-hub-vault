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
public class BackupPlayerActivity extends Activity {
    /** Corner VPN light on the backup player too, matching the Media3 player. */
    @Override protected void onResume() { super.onResume(); BoxVpn.badge(this); getWindow().getDecorView().postDelayed(() -> BoxVpn.badge(this), 1500); }
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
    private VlcStage carriedStage;
    private TextView note;
    private TextView feedNote;
    private String[] urls;
    private int at;
    private boolean started;
    private boolean paused;
    private long resume;
    private final BackupFeedStatus feedStatus = new BackupFeedStatus();
    private final ChannelLink link = new ChannelLink();
    private String linkVpnServer;
    private TextView linkNote;
    private boolean wasStalled;
    private long lastLinkPing;
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
            rideThrough();
            ui.postDelayed(this, 500);
        }
    };

    private void updateFeedNote() {
        if (mp == null || feedNote == null) return;
        // VLC can stop reporting isPlaying during rebuffering; only an explicit user pause suppresses a stall.
        boolean stalled = isLive() && feedStatus.stalled(started, !paused, android.os.SystemClock.elapsedRealtime());
        long nowMs = android.os.SystemClock.elapsedRealtime();
        reportStall(stallTracker.update(stalled, nowMs), false);
        if (stalled && !wasStalled) link.stalled(nowMs);
        wasStalled = stalled;
        updateLink(nowMs);
        ride.channel(getIntent().getStringExtra("recovery_name") != null ? getIntent().getStringExtra("recovery_name") : getIntent().getStringExtra("content_name"));
        String name = getIntent().getStringExtra("content_name");
        feedNote.setText(retryQueued || reconnect.active()
                ? "Reconnecting" + (name == null ? "" : " to " + name) + "…\n" + BufferBlame.label(BufferBlame.current(this, "network_drop"))
                : FeedStatus.BUFFERING + "\n" + BufferBlame.label(BufferBlame.current(this, "network_drop")));
        feedNote.setVisibility(stalled || retryQueued || reconnect.active() ? TextView.VISIBLE : TextView.GONE);
    }

    /** Pings the channel's own server every 15s off the main thread and refreshes the connection pill. */
    private void updateLink(long now) {
        if (linkNote == null) return;
        if (!isLive() && !catchup()) { linkNote.setVisibility(TextView.GONE); return; }
        if (now - lastLinkPing >= 15000) {
            lastLinkPing = now;
            String url = urls != null && at < urls.length ? urls[at] : null;
            if (url != null) new Thread(() -> {
                try {
                    java.net.URI u = java.net.URI.create(url);
                    int port = u.getPort() > 0 ? u.getPort() : ("https".equalsIgnoreCase(u.getScheme()) ? 443 : 80);
                    long t0 = android.os.SystemClock.elapsedRealtime();
                    try (java.net.Socket sk = new java.net.Socket()) {
                        sk.connect(new java.net.InetSocketAddress(u.getHost(), port), 5000);
                        int ms = (int) (android.os.SystemClock.elapsedRealtime() - t0);
                        ui.post(() -> link.ping(Math.max(1, ms)));
                    }
                } catch (Exception ignored) { } // A failed ping (e.g. mid VPN switch) is not a reading; stalls still count.
            }, "channel-ping").start();
        }
        if (!java.util.Objects.equals(linkVpnServer, BoxVpn.server)) { if (linkVpnServer != null) link.serverChanged(android.os.SystemClock.elapsedRealtime()); linkVpnServer = BoxVpn.server; }
        String rating = link.rating(now);
        // Publish one atomic snapshot from the same ChannelLink instance driving the on-box pill.
        SharedPreferences savedLink = getSharedPreferences("bmplayer", MODE_PRIVATE);
        long since = savedLink.getLong("np_since", 0);
        if (since > 0 && !savedLink.getBoolean("np_preview", false)) {
            try {
                org.json.JSONObject snapshot = new org.json.JSONObject().put("since", since)
                        .put("ping_ms", link.pingMs()).put("stalls", link.stalls(now))
                        .put("reconnects", link.reconnects(now)).put("delivery_ratio", link.deliveryRatio())
                        .put("short_ms", link.shortMs(now)).put("poor_ms", link.poorMs(now));
                String encoded = snapshot.toString();
                if (!encoded.equals(savedLink.getString("channel_link_snapshot", null)))
                    savedLink.edit().putString("channel_link_snapshot", encoded).apply();
            } catch (org.json.JSONException ignored) { }
        }
        linkNote.setText(link.label(now));
        linkNote.setBackgroundColor("Poor".equals(rating) ? 0xE0B91C1C : "Fair".equals(rating) ? 0xE0B45309
                : "Checking".equals(rating) ? 0xB30B1220 : 0xE0166534);
        // Shown with the controls only, so the picture stays clear; a Poor link also shows while the feed is struggling.
        boolean controls = controlsRow != null && controlsRow.getVisibility() == android.view.View.VISIBLE;
        linkNote.setVisibility(controls || ("Poor".equals(rating) && feedNote.getVisibility() == TextView.VISIBLE) ? TextView.VISIBLE : TextView.GONE);
    }

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        StreamClaim.attach(this);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(this instanceof BackupStageActivity ? Color.TRANSPARENT : Color.BLACK);
        BufferBlame.reset();
        layout = new VLCVideoLayout(this);
        root.addView(layout, new FrameLayout.LayoutParams(-1, -1));
        // Catch up skips: the last picture stays up as a still until the new time draws, never a black gap.
        still = new android.widget.ImageView(this);
        still.setScaleType(android.widget.ImageView.ScaleType.FIT_CENTER);
        still.setVisibility(android.view.View.GONE);
        root.addView(still, new FrameLayout.LayoutParams(-1, -1));
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
        linkNote = new TextView(this);
        linkNote.setTextColor(Color.WHITE); linkNote.setTextSize(15); linkNote.setPadding(24, 10, 24, 10);
        linkNote.setVisibility(TextView.GONE);
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(-2, -2, Gravity.TOP | Gravity.CENTER_HORIZONTAL);
        lp.topMargin = 16;
        root.addView(linkNote, lp);
        installControls(root);
        setContentView(root);
        liveDrawer = new LiveDrawerOverlay(this, root, getIntent().getStringExtra("content_id"));
        ui.postDelayed(() -> note.setVisibility(TextView.GONE), 4000);

        urls = getIntent().getStringArrayExtra("urls");
        if (urls == null || urls.length == 0) urls = new String[]{getIntent().getStringExtra("url")};
        resume = getIntent().getLongExtra("resume_ms", 0);
        if (catchup()) {
            cuSegStart = getIntent().getLongExtra("catchup_start", 0);
            cuEnd = getIntent().getLongExtra("catchup_end", 0);
            urls = new String[]{cuUrl()};
            resume = 0;
        }
        VlcPreview.Session carried = getIntent().getBooleanExtra("vlc_carried", false)
                ? VlcPreview.forward.take(getIntent().getStringExtra("content_id"), android.os.SystemClock.elapsedRealtime()) : null;
        if (carried != null) {
            carriedStage = carried.stage;
            vlc = carried.vlc; mp = carried.player; vlcBoost = carried.boost;
            urls = carried.urls; at = carried.index;
            started = true;
            feedStatus.playing(android.os.SystemClock.elapsedRealtime());
            ride.playing(android.os.SystemClock.elapsedRealtime());
            note.setVisibility(android.view.View.GONE);
        } else {
        ArrayList<String> opts = new ArrayList<>();
        opts.add("--network-caching=" + BackupBufferPolicy.networkCacheMs(isLive(), PlayerActivity.prefs(this).getString("buffer", StreamRecovery.DEFAULT_BUFFER), recoveryName()));
        opts.add("--http-reconnect");
        vlcBoost = SoundBoost.vlc(this, opts);
        vlc = new LibVLC(this, opts);
        mp = new MediaPlayer(vlc);
        }
        if (carriedStage != null) {
            root.removeView(layout);
            layout = (VLCVideoLayout) carriedStage.picture;
        } else mp.attachViews(layout, null, false, false);
        // Films and series fill the screen (zoom, like the main player); live TV and catch up keep their shape.
        if (PlayerControls.canSkip(getIntent().getStringExtra("content_kind"))) mp.setVideoScale(MediaPlayer.ScaleType.SURFACE_FIT_SCREEN);
        else {
            // Live/catch up: always show the whole picture. A preview surface carried to full screen keeps its small
            // size until told otherwise, which cut the picture off on phones, so refit whenever the screen size changes.
            mp.setVideoScale(MediaPlayer.ScaleType.SURFACE_BEST_FIT);
            layout.addOnLayoutChangeListener((v, l, t, r, btm, ol, ot, or, ob) -> {
                if (mp != null && (r - l != or - ol || btm - t != ob - ot)) {
                    mp.getVLCVout().setWindowSize(r - l, btm - t);
                    mp.setVideoScale(MediaPlayer.ScaleType.SURFACE_BEST_FIT);
                }
            });
        }
        mp.setEventListener(ev -> {
            switch (ev.type) {
                case MediaPlayer.Event.Playing:
                    if (!started && resume > 0 && mp.getLength() > 0) mp.setTime(resume);
                    started = true;
                    cuRetries = 0;
                    feedStatus.playing(android.os.SystemClock.elapsedRealtime());
                    feedNote.setVisibility(TextView.GONE);
                    reconnect.recovered();
                    ui.removeCallbacks(retryLive);
                    retryQueued = false;
                    // After a catch up skip the sound stays off until the picture shows (waitPicture turns it on).
                    if (!hushing) applyBoost(); else try { mp.setVolume(0); } catch (Exception ignored) {}
                    ride.playing(android.os.SystemClock.elapsedRealtime());
                    break;
                case MediaPlayer.Event.ESAdded:
                case MediaPlayer.Event.ESSelected:
                    ui.postDelayed(this::keepAudio, 300); break;
                case MediaPlayer.Event.Buffering:
                    feedStatus.buffering(ev.getBuffering());
                    updateFeedNote();
                    break;
                case MediaPlayer.Event.Vout:
                    if (ev.getVoutCount() > 0) ui.postDelayed(dropStill, 150);
                    break;
                case MediaPlayer.Event.TimeChanged:
                    feedStatus.progress(ev.getTimeChanged(), android.os.SystemClock.elapsedRealtime());
                    updateFeedNote();
                    break;
                case MediaPlayer.Event.EncounteredError:
                    if (catchup() && staleCatchupEvent()) break;
                    ui.post(catchup() ? this::catchupResume : this::next); break;
                case MediaPlayer.Event.EndReached:
                    // Live streams that end are dropped connections: reopen the same address.
                    if (catchup() && staleCatchupEvent()) break;
                    ui.post(() -> { if (catchup()) catchupResume(); else if (isLive()) next(); else finish(); }); break;
                default: break;
            }
        });
        // The carried guide preview only holds 1.5s of picture; 4K/UHD needs the full live buffer or the picture freezes while sound carries on.
        if (catchup()) startHush(); // first open too: no sound over the black screen before the picture
        if (carried == null || (isLive() && StreamRecovery.isHeavyName(recoveryName()))) open(); else if (!hushing) applyBoost();
        if (catchup()) showSkipToListed(root);
        ui.post(feedTick);
        ui.postDelayed(reportTick, 60000);
        lastPressAt = android.os.SystemClock.elapsedRealtime();
        ui.postDelayed(hideControls, 1000);
    }

    private String kind() { return PlayerActionControls.kind(this); }

    // ---------- catch up: timeshift recordings can't be seeked in place, so every move reopens the address ----------
    private long cuSegStart, cuEnd; private int cuRetries;
    private boolean catchup() { return getIntent().hasExtra("catchup_prefix"); }
    private String cuUrl() {
        return PlayerActivity.timeshiftUrl(getIntent().getStringExtra("catchup_prefix"), getIntent().getStringExtra("catchup_id"), cuSegStart, cuEnd, getIntent().getStringExtra("catchup_tz"));
    }
    // Until the reopened recording plays, the old one's clock and end/error events are stale: they must not drag the start back.
    private long cuOpenedAt;
    private android.widget.ImageView still;
    private final Runnable dropStill = () -> { if (still != null) { still.setVisibility(android.view.View.GONE); still.setImageBitmap(null); } };
    private static android.view.SurfaceView firstSurface(android.view.View v) {
        if (v instanceof android.view.SurfaceView) return (android.view.SurfaceView) v;
        if (v instanceof android.view.ViewGroup) { android.view.ViewGroup g = (android.view.ViewGroup) v;
            for (int i = 0; i < g.getChildCount(); i++) { android.view.SurfaceView s = firstSurface(g.getChildAt(i)); if (s != null) return s; } }
        return null;
    }
    /** Freeze the current frame over the picture (PixelCopy, Android 7+); older boxes just keep the old behaviour. */
    private void holdStill() {
        if (still == null || android.os.Build.VERSION.SDK_INT < 24 || !started) return;
        android.view.SurfaceView sv = firstSurface(layout);
        if (sv == null || sv.getWidth() <= 0 || sv.getHeight() <= 0 || !sv.getHolder().getSurface().isValid()) return;
        try {
            final android.graphics.Bitmap bm = android.graphics.Bitmap.createBitmap(sv.getWidth(), sv.getHeight(), android.graphics.Bitmap.Config.ARGB_8888);
            android.view.PixelCopy.request(sv, bm, r -> {
                if (r != android.view.PixelCopy.SUCCESS || still == null) return;
                still.setImageBitmap(bm); still.setVisibility(android.view.View.VISIBLE);
                ui.removeCallbacks(dropStill); ui.postDelayed(dropStill, 20000);
            }, ui);
        } catch (Throwable ignored) { }
    }
    private long hushUntil;
    private boolean hushing;
    /** Checks every 100ms whether the reopened recording has drawn a picture, then lets sound and picture go together. */
    private final Runnable waitPicture = new Runnable() { @Override public void run() {
        if (mp == null) return;
        int shown = 0;
        try { org.videolan.libvlc.interfaces.IMedia m = mp.getMedia(); if (m != null) { org.videolan.libvlc.interfaces.IMedia.Stats st = m.getStats(); if (st != null) shown = st.displayedPictures; m.release(); } } catch (Throwable ignored) {}
        if (shown > 0 || android.os.SystemClock.elapsedRealtime() > hushUntil) { hushing = false; applyBoost(); ui.post(dropStill); return; }
        // libVLC ignores a volume set before its sound output exists, so keep forcing silence until the picture is up.
        try { if (mp.getVolume() != 0) mp.setVolume(0); } catch (Throwable ignored) {}
        ui.postDelayed(this, 40);
    } };
    /** Sound waits for the picture: silent from the moment catch up opens until its first picture is drawn (10s cap). */
    private void startHush() {
        try { if (mp != null) mp.setVolume(0); } catch (Exception ignored) {}
        hushUntil = android.os.SystemClock.elapsedRealtime() + 10000; hushing = true;
        ui.removeCallbacks(waitPicture); ui.postDelayed(waitPicture, 40);
    }
    private boolean staleCatchupEvent() { return !started && android.os.SystemClock.elapsedRealtime() - cuOpenedAt < 3000; }
    private long cuReached() { return started ? cuSegStart + Math.max(0, mp == null ? 0 : mp.getTime()) / 1000 : cuSegStart; }
    private void catchupOpenAt(long start) {
        holdStill();
        startHush();
        cuSegStart = start; urls[0] = cuUrl(); at = 0; started = false; resume = 0; cuOpenedAt = android.os.SystemClock.elapsedRealtime();
        try { mp.stop(); } catch (Exception ignored) {}
        open();
    }
    private void catchupJump(int minutes) {
        if (mp == null) return;
        cuRetries = 0;
        long to = CatchupStart.jump(cuReached(), minutes, getIntent().getLongExtra("catchup_listed", cuSegStart), cuEnd);
        catchupOpenAt(to);
        if (skipBtn != null && skipBtn.getParent() != null) { learnCatchupStart(to); seek.wake(); }
    }
    /** The provider closed the recording early or it failed: reopen at the minute reached; after 8 tries use the main player. */
    private void catchupResume() {
        if (mp == null || isFinishing()) return;
        long reached = cuReached();
        if (started && reached >= cuEnd - 30) { finish(); return; }
        if (++cuRetries > 8) {
            android.content.Intent i = new android.content.Intent(getIntent()).setClass(this, PlayerActivity.class)
                    .putExtra("primary_fallback", true).putExtra("catchup_start", reached - Math.floorMod(reached, 60L));
            i.removeExtra("backup_first");
            startActivity(i); finish(); return;
        }
        // Never step back: rounding down replayed the same opening minute again and again.
        long restart = reached + Math.floorMod(60L - Math.floorMod(reached, 60L), 60L);
        ui.postDelayed(() -> catchupOpenAt(restart), cuRetries > 1 ? 2000 : 300);
    }
    /**
     * Catch-up recordings often still show the end of the show before; the listed start is earlier still, so a
     * "back to listed start" button only replayed the old show. This button always moves forward from where
     * playback has got to, stays up while it is being used, and the point reached is remembered per channel so
     * the next catch up on that channel opens there.
     */
    private android.view.View skipBtn;
    private CatchupSeek seek;
    private FrameLayout skipRoot;
    private final Runnable hideSkip = () -> { if (seek != null) seek.wake(); };
    private void showSkipToListed(FrameLayout root) {
        final long listed = getIntent().getLongExtra("catchup_listed", 0);
        if (listed <= 0) return;
        seek = new CatchupSeek(this, this::catchupJump, null);
        skipBtn = seek.row; skipRoot = root;
        seek.attach(root);
    }
    /** Remember where this channel's programmes really start, so its next catch up opens there. */
    private void learnCatchupStart(long start) {
        long listed = getIntent().getLongExtra("catchup_listed", 0);
        String id = getIntent().getStringExtra("catchup_id");
        if (listed <= 0 || id == null) return;
        PlayerActivity.prefs(this).edit().putInt(CatchupStart.learnKey(id), CatchupStart.learned(start, listed)).apply();
    }

    private SoundBoost.Vlc vlcBoost;

    private void applyBoost() {
        if (mp == null) return;
        try {
            // VLC's flat equalizer attenuates PCM by 0.25 (-12 dB) before its pre-amp.
            // Use AudioTrack's direct gain path instead, without that cancellation.
            mp.setEqualizer(null);
            vlcBoost.apply(SoundBoost.gainFor(SoundBoost.current(this)));
            mp.setVolume(SoundBoost.vlcVolume(vlcBoost.enhanced(), SoundBoost.current(this), false));
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
        controller.setShowFastForwardButton(PlayerControls.canSkip(kind()) || catchup());
        controller.setShowRewindButton(PlayerControls.canSkip(kind()) || catchup());
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
            public void jump(int minutes) { catchupJump(minutes); }
        }, kind());
        controller.setPlayer(controlPlayer);
        root.addView(controller, new FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM));
        controlsRow = PlayerActionControls.add(this, root, this::applyBoost,
                () -> PlayerActionControls.report(this),
                () -> PlayerActionControls.swap(this, false, () -> { if (mp != null) mp.stop(); }),
                this::chooseSubtitles);
        controller.addVisibilityListener(visibility -> {
            controlsRow.setVisibility(visibility);
            if (visibility == android.view.View.VISIBLE) lastPressAt = android.os.SystemClock.elapsedRealtime();
        });
        root.setOnClickListener(v -> showControls());
        controller.show();
    }

    private void chooseSubtitles() {
        if (mp == null) return;
        MediaPlayer.TrackDescription[] spu = mp.getSpuTracks();
        final java.util.List<Integer> ids = new java.util.ArrayList<>(); java.util.List<String> names = new java.util.ArrayList<>();
        int current = mp.getSpuTrack(), selected = -1;
        if (spu != null) for (MediaPlayer.TrackDescription t : spu) {
            if (t.id < 0) continue;
            if (t.id == current) selected = names.size();
            ids.add(t.id); names.add(PlayerActionControls.trackName(t.name, null, names.size() + 1));
        }
        PlayerActionControls.pickSubtitles(this, names, selected, which -> { if (mp != null) mp.setSpuTrack(which < 0 ? -1 : ids.get(which)); });
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
        if (p.disabledTrackTypes.contains(androidx.media3.common.C.TRACK_TYPE_AUDIO)) mp.setAudioTrack(-1);
        for (androidx.media3.common.TrackSelectionOverride override : p.overrides.values()) {
            if (override.trackIndices.isEmpty()) continue;
            String id = override.mediaTrackGroup.getFormat(override.trackIndices.get(0)).id;
            if (id == null) continue;
            try {
                if (id.startsWith("audio:")) {
                    int aid = Integer.parseInt(id.substring(6));
                    mp.setAudioTrack(aid);
                    MediaPlayer.TrackDescription[] at2 = mp.getAudioTracks();
                    if (at2 != null) for (MediaPlayer.TrackDescription d : at2) if (d.id == aid) wantedAudio = d.name;
                }
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
        // Count the reconnect before clearing started, otherwise no reconnect is ever recorded.
        link.channelOpened(android.os.SystemClock.elapsedRealtime());
        if (started || retryQueued) link.reconnected(android.os.SystemClock.elapsedRealtime());
        started = false;
        paused = false;
        link.reset();
        reconnect.opened(android.os.SystemClock.elapsedRealtime());
        ride.stopped(); ride.resetSamples();
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

    private final LiveRideThrough ride = new LiveRideThrough();
    private String wantedAudio;
    private long lastSample;

    /** Adverts and picture/sound changes: reopen a frozen picture quietly, refresh the retry budget, keep the audio track. */
    private void rideThrough() {
        if (mp == null || (!isLive() && !catchup()) || paused || retryQueued) return;
        long now = android.os.SystemClock.elapsedRealtime();
        if (ride.stable(now)) { errors = 0; ride.freezeReopens = 0; }
        if (now - lastSample < 1000) return;
        lastSample = now;
        try {
            org.videolan.libvlc.interfaces.IMedia media = mp.getMedia();
            if (media == null) return;
            org.videolan.libvlc.interfaces.IMedia.Stats st = media.getStats();
            media.release();
            if (st != null) { link.bytes(st.readBytes, st.demuxReadBytes, now); BufferBlame.pingMs = link.pingMs(); BufferBlame.channelKbps = link.kbps(); }
            reconnect.patient(UhdChannel.is(getIntent().getStringExtra("content_name")));
            boolean noData = st != null && isLive() && started && reconnect.noData(st.readBytes, st.displayedPictures, now);
            boolean mute = st != null && isLive() && started && !noData && reconnect.soundLost(st.displayedPictures, st.playedAbuffers, now, mp.getAudioTracksCount() > 1);
            if (st != null && isLive() && (reconnect.stalled(st.displayedPictures, st.decodedAudio, now) | noData | mute)) {
                // A drop is always reported, even when VLC never raised a Buffering event.
                link.stalled(now);
                BufferReporter.record(this, "live", getIntent().getStringExtra("content_id"), getIntent().getStringExtra("content_name"),
                        (noData || mute) ? reconnect.noDataMs() : reconnect.stallMs(), true, false, mute ? "audio_drop" : "network_drop", "direct", activeDecoder,
                        StreamRecovery.providerTag(recoveryName()), getIntent().getStringExtra("event_name"));
                next();
            } else if (started && st != null && isLive() && reconnect.blocky(st.lostPictures, now)) {
                open();
            } else if (started && st != null && ride.frozen(st.displayedPictures, st.decodedAudio, now)) {
                if (catchup()) catchupResume(); else if (ride.allowFreezeReopen()) open(); else next();
            }
        } catch (RuntimeException ignored) {}
    }

    private void keepAudio() {
        if (mp == null || wantedAudio == null) return;
        MediaPlayer.TrackDescription[] t = mp.getAudioTracks();
        if (t == null) return;
        int[] ids = new int[t.length]; String[] names = new String[t.length];
        for (int i = 0; i < t.length; i++) { ids[i] = t[i].id; names[i] = t[i].name; }
        int cur = mp.getAudioTrack();
        for (int i = 0; i < t.length; i++) if (ids[i] == cur && wantedAudio.equals(names[i])) return;
        int id = LiveRideThrough.pickAudio(ids, names, wantedAudio);
        if (id >= 0) mp.setAudioTrack(id);
    }

    private int errors;
    private final LiveReconnect reconnect = new LiveReconnect();
    private boolean retryQueued;
    private final Runnable retryLive = () -> {
        retryQueued = false;
        if (mp == null || isFinishing()) return;
        open();
    };
    private void next() {
        if (mp == null || isFinishing() || retryQueued) return;
        if (isLive()) {
            // A channel that drops keeps reconnecting by itself for up to two minutes instead of closing.
            long nowMs = android.os.SystemClock.elapsedRealtime();
            if (reconnect.wantsBackup(nowMs) && PlayerActionControls.autoBackup(this, () -> { if (mp != null) mp.stop(); })) return;
            long wait = reconnect.failed(nowMs);
            if (wait >= 0) {
                String name = getIntent().getStringExtra("content_name");
                retryQueued = true;
                ui.postDelayed(retryLive, wait);
                feedNote.setText("Reconnecting" + (name == null ? "" : " to " + name) + "…");
                feedNote.setVisibility(TextView.VISIBLE);
                return;
            }
            errors = Integer.MAX_VALUE / 2;
        }
        if (++errors > urls.length * 3) {
            if (isLive() && getIntent().getBooleanExtra("backup_first", false)) {
                // Backup engine played first and gave up: try the main player once before failing.
                android.content.Intent i = new android.content.Intent(getIntent()).setClass(this, PlayerActivity.class)
                        .putExtra("primary_fallback", true);
                i.removeExtra("backup_first");
                i.removeExtra("carried");
                startActivity(i); finish(); return;
            }
            if (isLive()) ChannelHealth.report(this, getIntent().getStringExtra("content_name"), "failed");
            Toast.makeText(this, "This stream couldn't be played by either player. Try again later or report a problem.", Toast.LENGTH_LONG).show();
            finish(); return;
        }
        if (!started && at + 1 < urls.length) at++;
        ui.postDelayed(this::open, started ? 2000 : 300);
    }

    private LiveDrawerOverlay liveDrawer;

    @Override public boolean dispatchKeyEvent(KeyEvent e) {
        if (PlayerApplication.closeAnnouncementOnBack(this, e)) return true;
        PlayerApplication.interaction(this);
        // Live TV on a box: Left with the controls hidden slides the guide's categories over the picture;
        // Back or Left slides them away again.
        if (e.getAction() == KeyEvent.ACTION_DOWN && liveDrawer != null) {
            int k = e.getKeyCode();
            if (liveDrawer.shown && (k == KeyEvent.KEYCODE_BACK || k == KeyEvent.KEYCODE_DPAD_LEFT)) {
                // Left inside the channel list still belongs to the drawer's own "back to categories".
                if (k == KeyEvent.KEYCODE_BACK) { liveDrawer.hide(); return true; }
            } else if (!liveDrawer.shown && k == KeyEvent.KEYCODE_DPAD_LEFT && isLive() && !getIntent().hasExtra("catchup_prefix")
                    && LiveDrawerData.ready() && LiveDrawerOverlay.tvBox(this) && (controller == null || !controller.isVisible())) {
                liveDrawer.show(); return true;
            }
            if (liveDrawer.shown) return super.dispatchKeyEvent(e);
        }
        // OK on the Skip ahead button must press it, not just reveal the controls.
        if (e.getAction() == KeyEvent.ACTION_DOWN && seek != null && seek.shown()
                && (e.getKeyCode() == KeyEvent.KEYCODE_DPAD_CENTER || e.getKeyCode() == KeyEvent.KEYCODE_ENTER)
                && seek.hasFocus()) { seek.click(); return true; }
        if (e.getAction() == KeyEvent.ACTION_DOWN && mp != null) {
            switch (e.getKeyCode()) {
                case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE: setPlaying(paused); showControls(); return true;
                case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD: case KeyEvent.KEYCODE_MEDIA_REWIND:
                    if (catchup()) catchupJump(e.getKeyCode() == KeyEvent.KEYCODE_MEDIA_FAST_FORWARD ? CatchupStart.JUMP_MIN : -CatchupStart.JUMP_MIN);
                    else if (PlayerControls.canSkip(kind()) && mp.getLength() > 0) controlPlayer.seekTo(Math.max(0, Math.min(mp.getLength(), mp.getTime() + (e.getKeyCode() == KeyEvent.KEYCODE_MEDIA_FAST_FORWARD ? 15000 : -5000))));
                    return true;
                case KeyEvent.KEYCODE_DPAD_CENTER: case KeyEvent.KEYCODE_ENTER:
                case KeyEvent.KEYCODE_DPAD_LEFT: case KeyEvent.KEYCODE_DPAD_RIGHT:
                case KeyEvent.KEYCODE_DPAD_UP: case KeyEvent.KEYCODE_DPAD_DOWN:
                    if (controller != null && !controller.isVisible()) {
                        showControls();
                        android.view.View play = controller.findViewById(androidx.media3.ui.R.id.exo_play_pause);
                        if (play != null) play.requestFocus(); else controller.requestFocus();
                        return true;
                    }
                    break;
                default: break;
            }
        }
        return super.dispatchKeyEvent(e);
    }

    @Override public void onUserInteraction() {
        super.onUserInteraction(); if (seek != null) seek.wake(); lastPressAt = android.os.SystemClock.elapsedRealtime(); PlayerApplication.interaction(this);
    }

    @Override protected void onPause() {
        super.onPause();
        saveProgress();
        // Return ownership before the guide resumes; background exits release normally.
        if (!DeviceLock.locked() && isFinishing() && isLive() && started && mp != null && LiveDrawerData.pendingPick == null) {
            mp.setEventListener(null);
            if (carriedStage == null) mp.detachViews();
            if (paused) mp.play();
            VlcPreview.Session session = new VlcPreview.Session(vlc, mp, vlcBoost, urls, at);
            session.stage = carriedStage;
            if (carriedStage != null) carriedStage.full(false);
            carriedStage = null;
            VlcPreview.backward.offer(session,
                    getIntent().getStringExtra("content_id"), android.os.SystemClock.elapsedRealtime());
            new Handler(Looper.getMainLooper()).postDelayed(VlcPreview.backward::drop, VlcHandoff.MAX_AGE_MS);
            mp = null; vlc = null; vlcBoost = null;
        }
        if (!isChangingConfigurations()) finish();
    }

    private void saveProgress() {
        if (DeviceLock.locked()) return;
        String key = getIntent().getStringExtra("progress_key");
        if (mp == null || key == null || isLive()) return;
        long pos = mp.getTime(), len = mp.getLength();
        if (pos <= 0 || len <= 0) return;
        if (pos >= len - 15000) pos = len;
        SharedPreferences saved = getSharedPreferences("bmplayer", MODE_PRIVATE);
        SharedPreferences.Editor ed = saved.edit();
        WatchProgress.store(saved, ed, key, pos, len);
        String series = getIntent().getStringExtra("series_key");
        if (series != null) ed.putLong(series + ":position", pos).putLong(series + ":duration", len);
        ProgressSync.touch(getSharedPreferences("bmplayer", MODE_PRIVATE), ed, key, series);
        ed.apply();
        ProgressSync.push(this, false);
    }

    @Override protected void onDestroy() {
        StreamClaim.detach(this);
        reportStall(stallTracker.finish(android.os.SystemClock.elapsedRealtime()), false);
        BufferReporter.flush(this);
        ui.removeCallbacksAndMessages(null);
        if (controller != null) controller.setPlayer(null);
        if (controlPlayer != null) controlPlayer.release();
        ProgressSync.push(this, true);
        if (mp != null) { mp.stop(); mp.detachViews(); mp.release(); mp = null; }
        if (vlc != null) { vlc.release(); vlc = null; }
        if (vlcBoost != null) { vlcBoost.release(); vlcBoost = null; }
        if (carriedStage != null) { carriedStage.close(); carriedStage = null; }
        super.onDestroy();
    }
}
