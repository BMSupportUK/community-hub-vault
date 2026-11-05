package uk.bmsupport.player;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Typeface;
import android.media.MediaCodecInfo;
import android.media.MediaCodecList;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Display;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.media3.common.MediaItem;
import androidx.media3.common.MimeTypes;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.VideoSize;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.exoplayer.DefaultLoadControl;
import androidx.media3.exoplayer.DefaultRenderersFactory;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.extractor.DefaultExtractorsFactory;
import androidx.media3.extractor.ts.DefaultTsPayloadReaderFactory;
import androidx.media3.ui.PlayerView;

/**
 * Built-in player: HLS, DASH, Smooth Streaming, RTSP, MPEG-TS, MP4/MKV/WebM/AVI/FLV and more,
 * hardware video (H.264/HEVC/VP9/AV1 up to 4K where the device supports it) plus FFmpeg audio
 * (AC-3, E-AC-3, DTS, TrueHD...). Tries each stream address in turn.
 */
public class PlayerActivity extends Activity {
    @Override protected void attachBaseContext(android.content.Context b) { super.attachBaseContext(PhoneScale.wrap(b)); }
    /** IPTV panels often block unknown players, so identify as VLC like most IPTV apps. */
    static final String UA = "VLC/3.0.20 LibVLC/3.0.20";
    private ExoPlayer player;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private String progressKey, seriesKey;
    private boolean playbackReady;
    private boolean subsChecked;
    private long resumePosition;
    private PlayerView view;
    private long lastPressAt;
    /**
     * The player's own hide timer can't be trusted on live TV (a stream that is buffering or has
     * no known length never counts as "playing", so it never hides the controls). This checks once
     * a second and takes the controls away shortly after the last press, whatever the player thinks.
     */
    private final Runnable hideControls = new Runnable() {
        @Override public void run() {
            if (view != null && view.isControllerFullyVisible()
                    && InactivityPolicy.hideControls(lastPressAt, android.os.SystemClock.elapsedRealtime())) {
                view.hideController();
            }
            ui.postDelayed(this, 1000);
        }
    };
    private final Runnable saveTick = new Runnable() {
        @Override public void run() { saveProgress(false); ui.postDelayed(this, 5000); }
    };

    private void saveProgress(boolean ended) {
        if (player == null || progressKey == null || !playbackReady) return;
        long duration = player.getDuration();
        if (duration <= 0) return;
        long position = ended ? duration : Math.max(0, player.getCurrentPosition());
        SharedPreferences.Editor edit = prefs(this).edit()
                .putLong(progressKey + ":position", position).putLong(progressKey + ":duration", duration);
        if (seriesKey != null) edit.putLong(seriesKey + ":position", position).putLong(seriesKey + ":duration", duration);
        ProgressSync.touch(prefs(this), edit, progressKey, seriesKey);
        edit.apply();
        ProgressSync.push(this, ended);
    }

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences("bmplayer", MODE_PRIVATE); }

    static ExoPlayer build(Context c) { return build(c, false); }
    static ExoPlayer build(Context c, boolean catchup) {
        SharedPreferences p = prefs(c);
        DefaultHttpDataSource.Factory http = new DefaultHttpDataSource.Factory()
                .setUserAgent(p.getString("ua", UA))
                .setAllowCrossProtocolRedirects(true)
                .setConnectTimeoutMs(15000)
                .setReadTimeoutMs(20000);
        DefaultExtractorsFactory ex = new DefaultExtractorsFactory()
                .setConstantBitrateSeekingEnabled(true)
                // Catch up recordings start mid-picture; waiting for a full keyframe avoids the blocky
                // smeared picture phones showed when decoding began from a partial frame.
                .setTsExtractorFlags(catchup ? DefaultTsPayloadReaderFactory.FLAG_DETECT_ACCESS_UNITS
                        : DefaultTsPayloadReaderFactory.FLAG_ALLOW_NON_IDR_KEYFRAMES | DefaultTsPayloadReaderFactory.FLAG_DETECT_ACCESS_UNITS);
        boolean sw = "software".equals(p.getString("decoder", "hardware"));
        DefaultRenderersFactory renderers = new DefaultRenderersFactory(c)
                .setEnableDecoderFallback(true)
                .setExtensionRendererMode(sw ? DefaultRenderersFactory.EXTENSION_RENDERER_MODE_PREFER
                        : DefaultRenderersFactory.EXTENSION_RENDERER_MODE_ON);
        // Catch up on phones: hardware decoders smear timeshift recordings into blocks, so prefer the
        // phone's software (backup) decoder, falling back to hardware if none exists.
        if (catchup) renderers.setMediaCodecSelector((mime, secure, tunneling) -> {
            java.util.List<androidx.media3.exoplayer.mediacodec.MediaCodecInfo> all =
                    androidx.media3.exoplayer.mediacodec.MediaCodecSelector.DEFAULT.getDecoderInfos(mime, secure, tunneling);
            java.util.List<androidx.media3.exoplayer.mediacodec.MediaCodecInfo> out = new java.util.ArrayList<>();
            for (androidx.media3.exoplayer.mediacodec.MediaCodecInfo i : all) if (i.softwareOnly) out.add(i);
            for (androidx.media3.exoplayer.mediacodec.MediaCodecInfo i : all) if (!i.softwareOnly) out.add(i);
            return out;
        });
        int[] buf = StreamRecovery.bufferMs(p.getString("buffer", StreamRecovery.DEFAULT_BUFFER));
        DefaultLoadControl load = new DefaultLoadControl.Builder()
                .setBufferDurationsMs(buf[0], buf[1], buf[2], buf[3])
                .setPrioritizeTimeOverSizeThresholds(true).build();
        ExoPlayer x = new ExoPlayer.Builder(c, renderers)
                .setMediaSourceFactory(new DefaultMediaSourceFactory(c, ex).setDataSourceFactory(http))
                .setLoadControl(load)
                .build();
        SoundBoost.attach(c, x);
        return x;
    }

    static MediaItem item(String url) {
        MediaItem.Builder b = new MediaItem.Builder().setUri(Uri.parse(url));
        String u = url.toLowerCase();
        if (u.endsWith(".m3u8")) b.setMimeType(MimeTypes.APPLICATION_M3U8);
        else if (u.endsWith(".mpd")) b.setMimeType(MimeTypes.APPLICATION_MPD);
        else if (u.endsWith(".ism") || u.endsWith("/manifest")) b.setMimeType(MimeTypes.APPLICATION_SS);
        else if (u.endsWith(".ts")) b.setMimeType(MimeTypes.VIDEO_MP2T);
        else if (u.startsWith("rtsp://")) b.setMimeType(MimeTypes.APPLICATION_RTSP);
        return b.build();
    }

    /** Plays urls[0], moving to the next address whenever one fails. */
    static void playWithFallback(ExoPlayer p, String[] urls, Runnable allFailed) {
        final int[] at = {0};
        p.addListener(new Player.Listener() {
            @Override public void onPlayerError(PlaybackException e) {
                if (e.errorCode == PlaybackException.ERROR_CODE_BEHIND_LIVE_WINDOW) { p.seekToDefaultPosition(); p.prepare(); return; }
                if (++at[0] < urls.length) { p.setMediaItem(item(urls[at[0]])); p.prepare(); p.play(); }
                else if (allFailed != null) allFailed.run();
            }
        });
        p.setMediaItem(item(urls[0]));
        p.setPlayWhenReady(true);
        p.prepare();
    }

    // ---------- catch up: reconnect when the provider closes the recording early ----------
    private long cuSegStart, cuEnd; private int cuRetries; private boolean skipAhead;

    static String timeshiftUrl(String prefix, String id, long start, long end, String tz) {
        long mins = Math.max(1, (end - start + 59) / 60);
        java.text.SimpleDateFormat f = new java.text.SimpleDateFormat("yyyy-MM-dd:HH-mm", java.util.Locale.UK);
        f.setTimeZone(java.util.TimeZone.getTimeZone(tz));
        return prefix + mins + "/" + f.format(new java.util.Date(start * 1000)) + "/" + id + ".ts";
    }

    private void startCatchup() {
        cuSegStart = getIntent().getLongExtra("catchup_start", 0);
        cuEnd = getIntent().getLongExtra("catchup_end", 0);
        player.addListener(new Player.Listener() {
            @Override public void onPlaybackStateChanged(int s) {
                if (s == Player.STATE_READY) cuRetries = 0;
                if (s == Player.STATE_ENDED) catchupResume();
            }
            @Override public void onPlayerError(PlaybackException e) { catchupResume(); }
        });
        player.setMediaItem(item(getIntent().getStringExtra("url")));
        player.setPlayWhenReady(true);
        player.prepare();
        ui.postDelayed(freezeWatch, 4000);
    }

    // Timeshift recordings can jump in their timestamps; the sound carries on but the picture
    // freezes. If no new video frame is drawn for 4s while playing, reopen at the point reached.
    private int lastFrames = -1, frozenTicks;
    private final Runnable freezeWatch = new Runnable() {
        @Override public void run() {
            if (player == null) return;
            androidx.media3.exoplayer.DecoderCounters c = player.getVideoDecoderCounters();
            int frames = c == null ? -1 : c.renderedOutputBufferCount;
            boolean playing = player.isPlaying() && player.getPlaybackState() == Player.STATE_READY;
            if (playing && frames >= 0 && frames == lastFrames) frozenTicks++; else frozenTicks = 0;
            lastFrames = frames;
            if (frozenTicks >= 4) { frozenTicks = 0; lastFrames = -1; skipAhead = true; catchupResume(); }
            ui.postDelayed(this, 1000);
        }
    };

    private void catchupResume() {
        if (player == null || isFinishing()) return;
        long reached = cuSegStart + Math.max(0, player.getCurrentPosition()) / 1000;
        if (reached >= cuEnd - 30 || ++cuRetries > 8) {
            if (cuRetries > 8) Toast.makeText(this, "The catch up recording stopped and couldn't reconnect. Try again or report a problem.", Toast.LENGTH_LONG).show();
            return;
        }
        // Timeshift addresses are minute-precise; restart at the minute reached (a few seconds may repeat).
        cuSegStart = reached - (reached % 60);
        if (skipAhead) { cuSegStart += 60; skipAhead = false; }
        String url = timeshiftUrl(getIntent().getStringExtra("catchup_prefix"), getIntent().getStringExtra("catchup_id"), cuSegStart, cuEnd, getIntent().getStringExtra("catchup_tz"));
        ui.postDelayed(() -> { if (player == null) return; player.setMediaItem(item(url)); player.setPlayWhenReady(true); player.prepare(); }, cuRetries > 1 ? 2000 : 300);
    }

    /** True when both the screen (TV/HDMI output) and a video decoder can show 2160p. */
    static boolean device4k(Activity a) {
        boolean screen = false;
        Display d = a.getWindowManager().getDefaultDisplay();
        if (Build.VERSION.SDK_INT >= 23) {
            for (Display.Mode m : d.getSupportedModes())
                if (Math.max(m.getPhysicalWidth(), m.getPhysicalHeight()) >= 3840) { screen = true; break; }
        }
        boolean decoder = false;
        try {
            for (MediaCodecInfo info : new MediaCodecList(MediaCodecList.REGULAR_CODECS).getCodecInfos()) {
                if (info.isEncoder()) continue;
                for (String t : info.getSupportedTypes()) {
                    if (!t.startsWith("video/")) continue;
                    MediaCodecInfo.VideoCapabilities v = info.getCapabilitiesForType(t).getVideoCapabilities();
                    if (v != null && v.isSizeSupported(3840, 2160)) { decoder = true; break; }
                }
                if (decoder) break;
            }
        } catch (Exception ignored) {}
        return screen && decoder;
    }

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        FrameLayout root = new FrameLayout(this);
        view = new PlayerView(this);
        view.setControllerShowTimeoutMs((int) InactivityPolicy.CONTROLS_MS);
        // Fast forward/rewind only where they work: films and series episodes, never live TV or catch up.
        view.setShowFastForwardButton(PlayerControls.canSkip(kind()));
        view.setShowRewindButton(PlayerControls.canSkip(kind()));
        root.addView(view);
        TextView banner = new TextView(this);
        banner.setText("Non 4K Device");
        banner.setTextSize(22);
        banner.setTypeface(Typeface.DEFAULT_BOLD);
        banner.setTextColor(0xFFFFFFFF);
        banner.setBackgroundColor(0xCCE11D48);
        banner.setPadding(40, 20, 40, 20);
        banner.setVisibility(TextView.GONE);
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.TOP | Gravity.CENTER_HORIZONTAL);
        lp.topMargin = 60;
        root.addView(banner, lp);
        final android.widget.Button boostBtn = new android.widget.Button(this);
        boostBtn.setAllCaps(false);
        boostBtn.setText("🔊 Sound booster: " + SoundBoost.label(this));
        boostBtn.setOnClickListener(v -> {
            String id = SoundBoost.next(SoundBoost.current(this));
            SoundBoost.set(this, id);
            boostBtn.setText("🔊 Sound booster: " + SoundBoost.label(this));
            android.widget.Toast.makeText(this, "Sound booster: " + SoundBoost.label(this) + ("high".equals(id) ? "\n" + SoundBoost.HIGH_NOTE : ""), android.widget.Toast.LENGTH_SHORT).show();
        });
        // Sound booster and Report a problem sit bottom-left, opposite the player's settings cog, just above the time bar.
        final int ctrlBottom = (int) (84 * getResources().getDisplayMetrics().density);
        FrameLayout.LayoutParams blp = new FrameLayout.LayoutParams(FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM | Gravity.START);
        blp.bottomMargin = ctrlBottom; blp.leftMargin = 24;
        final android.widget.LinearLayout ctrlRow = new android.widget.LinearLayout(this);
        ctrlRow.setOrientation(android.widget.LinearLayout.HORIZONTAL);
        ctrlRow.addView(boostBtn);
        root.addView(ctrlRow, blp);
        // Films and series always fill the screen (Zoom); live TV and catch up keep their own shape.
        if (PlayerControls.canSkip(kind())) view.setResizeMode(androidx.media3.ui.AspectRatioFrameLayout.RESIZE_MODE_ZOOM);
        final android.widget.Button reportBtn = new android.widget.Button(this);
        reportBtn.setAllCaps(false);
        reportBtn.setText("⚠ Report a problem");
        reportBtn.setOnClickListener(v -> showReport());
        android.widget.LinearLayout.LayoutParams reportLp = new android.widget.LinearLayout.LayoutParams(android.widget.LinearLayout.LayoutParams.WRAP_CONTENT, android.widget.LinearLayout.LayoutParams.WRAP_CONTENT);
        reportLp.leftMargin = (int) (12 * getResources().getDisplayMetrics().density);
        ctrlRow.addView(reportBtn, reportLp);
        // Catch up problems can't be fixed by us, so there is no report button on catch up.
        final boolean canReport = PlayerControls.canReport(kind());
        if (!canReport) reportBtn.setVisibility(android.view.View.GONE);
        view.setControllerVisibilityListener((PlayerView.ControllerVisibilityListener) vis -> { boostBtn.setVisibility(vis); reportBtn.setVisibility(canReport ? vis : android.view.View.GONE); });
        setContentView(root);
        lastPressAt = android.os.SystemClock.elapsedRealtime();
        ui.postDelayed(hideControls, 1000);

        player = build(this, getIntent().hasExtra("catchup_prefix"));
        final int subs = getIntent().getIntExtra("subtitles", -1);
        if (subs == 0 || subs == 1) player.setTrackSelectionParameters(player.getTrackSelectionParameters().buildUpon()
                .setTrackTypeDisabled(androidx.media3.common.C.TRACK_TYPE_TEXT, subs == 0)
                .setPreferredTextLanguage(subs == 1 ? java.util.Locale.getDefault().getLanguage() : null)
                .setSelectUndeterminedTextLanguage(subs == 1)
                .setIgnoredTextSelectionFlags(subs == 1 ? 0 : androidx.media3.common.C.SELECTION_FLAG_FORCED).build());
        progressKey = getIntent().getStringExtra("progress_key");
        seriesKey = getIntent().getStringExtra("series_key");
        resumePosition = getIntent().getLongExtra("resume_ms", 0);
        view.setPlayer(player);
        final boolean is4kDevice = device4k(this);
        player.addListener(new Player.Listener() {
            @Override public void onPlaybackStateChanged(int state) {
                if (state == Player.STATE_READY) {
                    playbackReady = true;
                    if (subs >= 1 && !subsChecked) onTracksChanged(player.getCurrentTracks());
                    if (resumePosition > 0) {
                        long at = resumePosition; resumePosition = 0;
                        player.seekTo(player.getDuration() > 0 ? Math.min(at, player.getDuration() - 1) : at);
                    }
                } else if (state == Player.STATE_ENDED) saveProgress(true);
            }
            @Override public void onTracksChanged(androidx.media3.common.Tracks tracks) {
                if (subs < 1 || subsChecked) return;
                // "Subtitles on": if no subtitle track got picked (e.g. a language other than the device's,
                // or not marked default), pick one ourselves — English first, else the first available.
                androidx.media3.common.TrackGroup pick = null; boolean anySelected = false; boolean any = false;
                for (androidx.media3.common.Tracks.Group g : tracks.getGroups()) {
                    if (g.getType() != androidx.media3.common.C.TRACK_TYPE_TEXT) continue;
                    any = true;
                    if (g.isSelected()) anySelected = true;
                    String lang = g.getMediaTrackGroup().getFormat(0).language;
                    boolean en = lang != null && lang.toLowerCase(java.util.Locale.ROOT).startsWith("en");
                    if (pick == null || en) { if (pick == null || en) pick = g.getMediaTrackGroup(); }
                    if (en) break;
                }
                if (!playbackReady && !any) return; // tracks can arrive in stages; wait until playback is ready
                subsChecked = true;
                if (!any) { if (subs == 1) android.widget.Toast.makeText(PlayerActivity.this, "This film or episode has no subtitles from your provider", android.widget.Toast.LENGTH_LONG).show(); return; }
                if (!anySelected && pick != null) player.setTrackSelectionParameters(player.getTrackSelectionParameters().buildUpon()
                        .setTrackTypeDisabled(androidx.media3.common.C.TRACK_TYPE_TEXT, false)
                        .setOverrideForType(new androidx.media3.common.TrackSelectionOverride(pick, 0)).build());
                if (subs == 2) {
                    // Subtitles exist and are on: only now ask whether to turn them off.
                    player.pause();
                    new android.app.AlertDialog.Builder(PlayerActivity.this).setTitle("Subtitles")
                            .setMessage("This has subtitles and they're on. Do you want to keep them?")
                            .setPositiveButton("Keep subtitles on", (d, w) -> player.play())
                            .setNegativeButton("Turn subtitles off", (d, w) -> {
                                player.setTrackSelectionParameters(player.getTrackSelectionParameters().buildUpon()
                                        .clearOverridesOfType(androidx.media3.common.C.TRACK_TYPE_TEXT)
                                        .setTrackTypeDisabled(androidx.media3.common.C.TRACK_TYPE_TEXT, true).build());
                                player.play();
                            })
                            .setOnCancelListener(d -> player.play()).show();
                }
            }
            @Override public void onVideoSizeChanged(VideoSize s) {
                if (Math.max(s.width, s.height) >= 3840 && !is4kDevice) {
                    banner.setText("Non 4K Device – this is a 4K stream. Your TV or streaming device can't show 4K, so it may not play smoothly.");
                    banner.setVisibility(TextView.VISIBLE);
                    ui.postDelayed(() -> banner.setVisibility(TextView.GONE), 10000);
                }
            }
        });
        if (getIntent().hasExtra("catchup_prefix")) { startCatchup(); ui.postDelayed(saveTick, 5000); return; }
        String[] urls = getIntent().getStringArrayExtra("urls");
        if (urls == null) urls = new String[]{getIntent().getStringExtra("url")};
        reconnectNote = new TextView(this);
        reconnectNote.setText("Reconnecting…");
        reconnectNote.setTextSize(18);
        reconnectNote.setTextColor(0xFFFFFFFF);
        reconnectNote.setBackgroundColor(0xB3000000);
        reconnectNote.setPadding(28, 12, 28, 12);
        reconnectNote.setVisibility(TextView.GONE);
        FrameLayout.LayoutParams rlp = new FrameLayout.LayoutParams(FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM | Gravity.START);
        rlp.leftMargin = 32; rlp.bottomMargin = 32;
        root.addView(reconnectNote, rlp);
        startWithRecovery(urls);
        ui.postDelayed(saveTick, 5000);
    }

    // ---------- anti-buffering: stall tracking, silent reconnect, quality drop, SD offer ----------
    private String[] liveUrls;
    private int urlAt, reconnects;
    private long stallStartedAt, lastStableAt, lastPosition;
    private final long[] stallTimes = new long[16]; private int stallCount;
    private boolean everReady, capped, sdOffered;
    private TextView reconnectNote;

    private void startWithRecovery(String[] urls) {
        liveUrls = urls;
        player.addListener(new Player.Listener() {
            @Override public void onPlaybackStateChanged(int s) {
                long now = android.os.SystemClock.elapsedRealtime();
                if (s == Player.STATE_BUFFERING && everReady && stallStartedAt == 0) {
                    stallStartedAt = now;
                    ui.postDelayed(stallWatch, StreamRecovery.STALL_RECONNECT_MS);
                } else if (s == Player.STATE_READY) {
                    if (stallStartedAt > 0) onStallEnded(now - stallStartedAt, reconnects > 0);
                    everReady = true; stallStartedAt = 0; reconnects = 0; lastStableAt = now;
                    ui.removeCallbacks(stallWatch);
                    if (reconnectNote != null) reconnectNote.setVisibility(TextView.GONE);
                }
            }
            @Override public void onPlayerError(PlaybackException e) {
                if (e.errorCode == PlaybackException.ERROR_CODE_BEHIND_LIVE_WINDOW) { player.seekToDefaultPosition(); player.prepare(); return; }
                if (!everReady && urlAt + 1 < liveUrls.length) { urlAt++; open(0); return; }
                // Every address failed before any picture (format the main player cannot open): backup engine takes over.
                if (!everReady && !"catchup".equals(kind())) { handToBackup(); return; }
                reconnect();
            }
        });
        open(0);
        ui.postDelayed(qualityRaise, StreamRecovery.STABLE_RAISE_MS);
        ui.postDelayed(antiFreeze, 1000);
    }

    // Anti-freeze: picture stuck while "playing" (sound carries on) or live drifting far behind now.
    private int afLastFrames = -1, afTicks;
    private final Runnable antiFreeze = new Runnable() {
        @Override public void run() {
            if (player == null) return;
            boolean playing = player.isPlaying() && player.getPlaybackState() == Player.STATE_READY;
            androidx.media3.exoplayer.DecoderCounters c = player.getVideoDecoderCounters();
            int frames = c == null ? -1 : c.renderedOutputBufferCount;
            if (playing && frames >= 0 && frames == afLastFrames) afTicks++; else afTicks = 0;
            afLastFrames = frames;
            if (StreamRecovery.frozen(afTicks)) {
                afTicks = 0; afLastFrames = -1;
                BufferReporter.record(PlayerActivity.this, kind(), getIntent().getStringExtra("content_id"), getIntent().getStringExtra("content_name"), StreamRecovery.FREEZE_TICKS * 1000L, true, true);
                if ("live".equals(kind())) { player.seekToDefaultPosition(); player.prepare(); player.play(); } else reconnect();
            } else if (playing && player.isCurrentMediaItemLive() && StreamRecovery.drifted(player.getCurrentLiveOffset())) {
                player.seekToDefaultPosition();
            }
            ui.postDelayed(this, 1000);
        }
    };

    /** Remember the other stream format for this channel after repeated stalls, so next time starts with it. */
    private void rememberBetterFormat() {
        String id = getIntent().getStringExtra("content_id");
        if (!"live".equals(kind()) || id == null || liveUrls.length < 2) return;
        String other = StreamRecovery.otherFormat(liveUrls[urlAt]);
        if (other != null) prefs(this).edit().putString("fmt_pref:" + id, other).apply();
    }

    private boolean handedOver;
    /** Restart this stream in the built-in backup engine (BackupPlayerActivity) with the same addresses and position. */
    private void handToBackup() {
        if (handedOver || isFinishing()) return;
        handedOver = true;
        long pos = player != null && player.getDuration() > 0 ? Math.max(lastPosition, player.getCurrentPosition()) : resumePosition;
        if (player != null) { player.release(); player = null; }
        Toast.makeText(this, "Switching to BM Player's backup engine…", Toast.LENGTH_SHORT).show();
        android.content.Intent i = new android.content.Intent(getIntent()).setClass(this, BackupPlayerActivity.class)
                .putExtra("urls", liveUrls).putExtra("resume_ms", pos);
        startActivity(i);
        finish();
    }

    private void open(long at) {
        player.setMediaItem(item(liveUrls[urlAt]));
        player.setPlayWhenReady(true);
        player.prepare();
        if (at > 0) player.seekTo(at);
    }

    private final Runnable stallWatch = () -> { if (player != null && player.getPlaybackState() == Player.STATE_BUFFERING) reconnect(); };

    private void reconnect() {
        if (player == null || isFinishing()) return;
        if (player.getDuration() > 0) lastPosition = Math.max(lastPosition, player.getCurrentPosition());
        reconnects++;
        if (StreamRecovery.giveUp(reconnects)) {
            if (reconnectNote != null) reconnectNote.setVisibility(TextView.GONE);
            BufferReporter.record(this, kind(), getIntent().getStringExtra("content_id"), getIntent().getStringExtra("content_name"), StreamRecovery.STALL_RECONNECT_MS, true);
            handToBackup();
            return;
        }
        if (reconnectNote != null) reconnectNote.setVisibility(TextView.VISIBLE);
        final long at = player.getDuration() > 0 ? lastPosition : 0;
        ui.postDelayed(() -> { if (player != null) open(at); }, StreamRecovery.backoffMs(reconnects));
    }

    /** Report from inside the player: one plain pop-up that pans above the keypad (no resizing, which made phones flicker). */
    private void showReport() {
        String title = getIntent().getStringExtra("content_name");
        if (title == null) title = "";
        String rk = getIntent().getStringExtra("report_kind");
        final String kind = rk != null ? rk : "live".equals(kind()) ? "live" : "film".equals(kind()) ? "film" : "series";
        final String cat = getIntent().getStringExtra("report_category");
        ReportBox rb = buildReportBox(this, title, kind, cat);
        final android.widget.LinearLayout box = rb.box;
        final android.widget.Button cancelBtn = rb.cancel;
        final android.widget.Button sendBtn = rb.send;
        final android.widget.EditText issue = rb.issue;
        final String fTitle = title;
        final android.app.AlertDialog dlg = new android.app.AlertDialog.Builder(this).setView(box).create();
        cancelBtn.setOnClickListener(v -> dlg.dismiss());
        issue.setOnEditorActionListener((tv, a, e) -> { if (a == android.view.inputmethod.EditorInfo.IME_ACTION_SEND) { sendBtn.performClick(); return true; } return false; });
        if (dlg.getWindow() != null) dlg.getWindow().setSoftInputMode(reportInputMode());
        sendBtn.setOnClickListener(v -> {
            String msg = issue.getText().toString().trim();
            if (msg.length() < 3) { issue.setError("Please type a short description"); return; }
            v.setEnabled(false);
            final String token = getSharedPreferences("bmplayer", MODE_PRIVATE).getString("token", "");
            new Thread(() -> {
                String err = null;
                try {
                    org.json.JSONObject b = new org.json.JSONObject().put("action", "report").put("device_token", token)
                            .put("kind", kind).put("title", fTitle).put("issue", msg)
                            .put("device", String.valueOf(getIntent().getStringExtra("report_device")))
                            .put("version", String.valueOf(getIntent().getStringExtra("report_version")));
                    if (cat != null && !cat.isEmpty()) b.put("category", cat);
                    Net.postJson(Net.SITE + "/api/public/player", b.toString());
                } catch (Exception e) {
                    String m = String.valueOf(e.getMessage());
                    int i = m.indexOf("\"error\":\"");
                    err = i >= 0 ? m.substring(i + 9, Math.max(i + 9, m.indexOf('"', i + 9))) : "Couldn't send your report. Check your internet and try again.";
                }
                final String fe = err;
                ui.post(() -> {
                    if (isFinishing()) return;
                    if (fe != null) { v.setEnabled(true); Toast.makeText(this, fe, Toast.LENGTH_LONG).show(); return; }
                    dlg.dismiss();
                    Toast.makeText(this, "Thanks – a support ticket has been opened. You'll find replies at bmsupport.uk/tickets", Toast.LENGTH_LONG).show();
                });
            }).start();
        });
        dlg.show();
    }

    /** The pop-up pans above the keypad instead of resizing itself around it (resizing made phones flicker). */
    static int reportInputMode() {
        return WindowManager.LayoutParams.SOFT_INPUT_ADJUST_PAN | WindowManager.LayoutParams.SOFT_INPUT_STATE_VISIBLE;
    }

    /** The report pop-up's contents, built in one place so the layout can be checked: Send/Cancel above the typing box. */
    static final class ReportBox {
        final android.widget.LinearLayout box;
        final android.widget.Button send;
        final android.widget.Button cancel;
        final android.widget.EditText issue;
        ReportBox(android.widget.LinearLayout box, android.widget.Button send, android.widget.Button cancel, android.widget.EditText issue) {
            this.box = box; this.send = send; this.cancel = cancel; this.issue = issue;
        }
    }

    static ReportBox buildReportBox(android.content.Context ctx, String title, String kind, String cat) {
        android.widget.LinearLayout box = new android.widget.LinearLayout(ctx);
        box.setOrientation(android.widget.LinearLayout.VERTICAL);
        int pad = (int) (20 * ctx.getResources().getDisplayMetrics().density);
        box.setPadding(pad, pad / 2, pad, 0);
        TextView info = new TextView(ctx);
        info.setText((kind.equals("live") ? "Channel: " : kind.equals("film") ? "Film: " : "Series: ") + title + (cat == null || cat.isEmpty() ? "" : "\nCategory: " + cat));
        // Sideways phones leave only a strip above the keypad, so Send and Cancel sit at the top, above the box.
        android.widget.LinearLayout actions = new android.widget.LinearLayout(ctx);
        actions.setGravity(Gravity.END);
        android.widget.Button cancelBtn = new android.widget.Button(ctx); cancelBtn.setAllCaps(false); cancelBtn.setText("Cancel");
        android.widget.Button sendBtn = new android.widget.Button(ctx); sendBtn.setAllCaps(false); sendBtn.setText("Send to BM Support");
        actions.addView(cancelBtn); actions.addView(sendBtn);
        box.addView(actions);
        box.addView(info);
        android.widget.EditText issue = new android.widget.EditText(ctx);
        issue.setHint("Briefly tell us what's wrong (e.g. buffering, no sound, won't play)");
        issue.setMinLines(1); issue.setMaxLines(3);
        issue.setImeOptions(android.view.inputmethod.EditorInfo.IME_ACTION_SEND | android.view.inputmethod.EditorInfo.IME_FLAG_NO_EXTRACT_UI | android.view.inputmethod.EditorInfo.IME_FLAG_NO_FULLSCREEN);
        issue.setFilters(new android.text.InputFilter[]{ new android.text.InputFilter.LengthFilter(1000) });
        issue.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
        box.addView(issue);
        return new ReportBox(box, sendBtn, cancelBtn, issue);
    }

    private String kind() { String k = getIntent().getStringExtra("content_kind"); return k == null ? "live" : k; }

    private void onStallEnded(long ms, boolean reconnected) {
        BufferReporter.record(this, kind(), getIntent().getStringExtra("content_id"), getIntent().getStringExtra("content_name"), ms, reconnected);
        if (ms < StreamRecovery.MIN_REPORT_MS) return;
        long now = android.os.SystemClock.elapsedRealtime();
        stallTimes[stallCount % stallTimes.length] = now; stallCount++;
        int recent = StreamRecovery.recentStalls(stallTimes, Math.min(stallCount, stallTimes.length), now);
        if (recent >= StreamRecovery.STALLS_TO_LOWER) { lowerQuality(); rememberBetterFormat(); }
        if (recent >= StreamRecovery.STALLS_TO_OFFER_SD) offerSd();
    }

    /** Adaptive (HLS/DASH) streams step down; single-quality streams are unaffected. */
    private void lowerQuality() {
        if (player == null) return;
        androidx.media3.common.Format f = player.getVideoFormat();
        int cap = StreamRecovery.lowerCap(f == null ? 0 : f.bitrate);
        player.setTrackSelectionParameters(player.getTrackSelectionParameters().buildUpon().setMaxVideoBitrate(cap).build());
        capped = true;
    }

    private final Runnable qualityRaise = new Runnable() {
        @Override public void run() {
            if (player == null) return;
            long now = android.os.SystemClock.elapsedRealtime();
            if (capped && stallStartedAt == 0 && now - lastStableAt >= StreamRecovery.STABLE_RAISE_MS
                    && StreamRecovery.recentStalls(stallTimes, Math.min(stallCount, stallTimes.length), now) == 0) {
                player.setTrackSelectionParameters(player.getTrackSelectionParameters().buildUpon().setMaxVideoBitrate(Integer.MAX_VALUE).build());
                capped = false;
            }
            ui.postDelayed(this, 60000);
        }
    };

    private void offerSd() {
        String[] sd = getIntent().getStringArrayExtra("sd_urls");
        if (sdOffered || sd == null || sd.length == 0 || isFinishing()) return;
        sdOffered = true;
        String name = getIntent().getStringExtra("sd_name");
        new android.app.AlertDialog.Builder(this).setTitle("Keeps buffering")
                .setMessage("This HD channel keeps stopping on your connection. Switch to the SD version" + (name == null ? "" : " (" + name + ")") + "?")
                .setPositiveButton("Switch to SD version", (d, w) -> {
                    liveUrls = sd; urlAt = 0; everReady = false; reconnects = 0; stallCount = 0;
                    getIntent().putExtra("content_name", name);
                    open(0);
                })
                .setNegativeButton("Stay on HD", null).show();
    }

    @Override public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE && player != null) {
            player.setPlayWhenReady(!player.getPlayWhenReady());
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override public boolean dispatchKeyEvent(android.view.KeyEvent e) {
        int k = e.getKeyCode();
        if (!PlayerControls.canSkip(kind()) && (k == KeyEvent.KEYCODE_MEDIA_FAST_FORWARD || k == KeyEvent.KEYCODE_MEDIA_REWIND)) return true;
        return PlayerApplication.closeAnnouncementOnBack(this, e) || super.dispatchKeyEvent(e); }

    @Override public void onUserInteraction() {
        super.onUserInteraction();
        lastPressAt = android.os.SystemClock.elapsedRealtime();
        PlayerApplication.interaction(this);
    }

    @Override protected void onStop() { saveProgress(false); super.onStop(); if (player != null) player.pause(); }

    @Override protected void onDestroy() { ui.removeCallbacks(freezeWatch); ui.removeCallbacks(stallWatch); ui.removeCallbacks(qualityRaise); ui.removeCallbacks(antiFreeze); BufferReporter.flush(this); saveProgress(false); ProgressSync.push(this, true); ui.removeCallbacks(saveTick); ui.removeCallbacks(hideControls); super.onDestroy(); if (player != null) { player.release(); player = null; } }
}
