package uk.bmsupport.player;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Typeface;
import android.media.MediaCodecInfo;
import android.media.MediaCodecList;
import android.net.Uri;
import android.os.Build;
import android.graphics.Bitmap;
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
    private String activeDecoder = "media3/unknown";
    private final Handler ui = new Handler(Looper.getMainLooper());
    private String progressKey, seriesKey;
    private boolean playbackReady;
    private boolean subsChecked;
    private long resumePosition;
    private PlayerView view;
    private android.widget.LinearLayout controlsRow;
    private long lastPressAt;
    /**
     * The player's own hide timer can't be trusted on live TV (a stream that is buffering or has
     * no known length never counts as "playing", so it never hides the controls). This checks once
     * a second and takes the controls away shortly after the last press, whatever the player thinks.
     */
    private final Runnable hideControls = new Runnable() {
        @Override public void run() {
            if (view != null && InactivityPolicy.hideControls(lastPressAt, android.os.SystemClock.elapsedRealtime())) {
                view.hideController();
                // These controls are siblings of PlayerView, not its controller. Hide them even
                // when Media3 already considers its controller hidden or mid-animation.
                if (controlsRow != null) controlsRow.setVisibility(android.view.View.GONE);
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
        return build(c, catchup, null);
    }
    static ExoPlayer build(Context c, boolean catchup, String channelName) {
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
                .setTsExtractorFlags(VideoDecodePolicy.cleanKeyframes(catchup, channelName) ? DefaultTsPayloadReaderFactory.FLAG_DETECT_ACCESS_UNITS
                        : DefaultTsPayloadReaderFactory.FLAG_ALLOW_NON_IDR_KEYFRAMES | DefaultTsPayloadReaderFactory.FLAG_DETECT_ACCESS_UNITS);
        boolean sw = VideoDecodePolicy.preferSoftware(catchup, p.getString("decoder", "hardware"), channelName);
        DefaultRenderersFactory renderers = new DefaultRenderersFactory(c) {
            // High-level H.264 feeds decode in low-latency mode (HighLevelAvcRenderer); same for all channels.
            @Override protected void buildVideoRenderers(Context ctx, int mode, androidx.media3.exoplayer.mediacodec.MediaCodecSelector sel,
                    boolean fallback, Handler h, androidx.media3.exoplayer.video.VideoRendererEventListener l, long joining,
                    java.util.ArrayList<androidx.media3.exoplayer.Renderer> out) {
                int start = out.size();
                super.buildVideoRenderers(ctx, mode, sel, fallback, h, l, joining, out);
                for (int i = start; i < out.size(); i++) if (out.get(i).getClass() == androidx.media3.exoplayer.video.MediaCodecVideoRenderer.class) {
                    out.set(i, new HighLevelAvcRenderer(ctx, sel, joining, fallback, h, l, MAX_DROPPED_VIDEO_FRAME_COUNT_TO_NOTIFY)); break;
                }
            }
        }
                .setEnableDecoderFallback(true)
                .setExtensionRendererMode(sw ? DefaultRenderersFactory.EXTENSION_RENDERER_MODE_PREFER
                        : DefaultRenderersFactory.EXTENSION_RENDERER_MODE_ON);
        // MediaTek video chips stall after a few dozen frames when Media3 feeds them asynchronously
        // (picture frozen, sound playing); the backup engine feeds the same chip synchronously and plays.
        if (VideoDecodePolicy.synchronousFeed(android.os.Build.HARDWARE, android.os.Build.VERSION.SDK_INT >= 31 ? android.os.Build.SOC_MANUFACTURER : ""))
            renderers.forceDisableMediaCodecAsynchronousQueueing();
        // Catch up on phones: hardware decoders smear timeshift recordings into blocks, so prefer the
        // phone's software (backup) decoder, falling back to hardware if none exists.
        if (sw) renderers.setMediaCodecSelector((mime, secure, tunneling) -> {
            java.util.List<androidx.media3.exoplayer.mediacodec.MediaCodecInfo> all =
                    androidx.media3.exoplayer.mediacodec.MediaCodecSelector.DEFAULT.getDecoderInfos(mime, secure, tunneling);
            java.util.List<androidx.media3.exoplayer.mediacodec.MediaCodecInfo> out = new java.util.ArrayList<>();
            for (androidx.media3.exoplayer.mediacodec.MediaCodecInfo i : all) if (i.softwareOnly) out.add(i);
            for (androidx.media3.exoplayer.mediacodec.MediaCodecInfo i : all) if (!i.softwareOnly) out.add(i);
            return out;
        });
        int[] buf = StreamRecovery.bufferMs(p.getString("buffer", StreamRecovery.DEFAULT_BUFFER), catchup ? null : channelName);
        DefaultLoadControl load = new DefaultLoadControl.Builder()
                .setBufferDurationsMs(buf[0], buf[1], buf[2], buf[3])
                // Memory cap: a 60s buffer of UHD (30–40 Mbps) would take hundreds of MB and get the app killed.
                .setTargetBufferBytes(StreamRecovery.bufferBytes(Runtime.getRuntime().maxMemory()))
                .setPrioritizeTimeOverSizeThresholds(false).build();
        ExoPlayer x = new ExoPlayer.Builder(c, renderers)
                // Retry slow/missing provider segments in place instead of dropping the stream.
                .setMediaSourceFactory(new DefaultMediaSourceFactory(c, ex).setDataSourceFactory(http)
                        .setLoadErrorHandlingPolicy(new androidx.media3.exoplayer.upstream.DefaultLoadErrorHandlingPolicy(StreamRecovery.SEGMENT_RETRIES)))
                // Live never races to the edge (empties the preload) and may ease slightly slower when the buffer runs low.
                .setLivePlaybackSpeedControl(new androidx.media3.exoplayer.DefaultLivePlaybackSpeedControl.Builder()
                        .setFallbackMinPlaybackSpeed(StreamRecovery.HLS_MIN_SPEED).setFallbackMaxPlaybackSpeed(StreamRecovery.HLS_MAX_SPEED).build())
                .setLoadControl(load)
                // Some TV boxes (SDMC/Amlogic) hang when a 4K decoder is let go; never block the screen waiting for it.
                .setReleaseTimeoutMs(400).setDetachSurfaceTimeoutMs(400)
                .build();
        // Startup owns the display rate; video surfaces must not request content-driven switches.
        x.setVideoChangeFrameRateStrategy(androidx.media3.common.C.VIDEO_CHANGE_FRAME_RATE_STRATEGY_OFF);
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
    static Player.Listener playWithFallback(ExoPlayer p, String[] urls, Runnable allFailed) {
        final int[] at = {0};
        Player.Listener l = new Player.Listener() {
            @Override public void onPlayerError(PlaybackException e) {
                if (e.errorCode == PlaybackException.ERROR_CODE_BEHIND_LIVE_WINDOW) { p.seekToDefaultPosition(); p.prepare(); return; }
                if (++at[0] < urls.length) { p.setMediaItem(item(urls[at[0]])); p.prepare(); p.play(); }
                else if (allFailed != null) allFailed.run();
            }
        };
        p.addListener(l);
        p.setMediaItem(item(urls[0]));
        p.setPlayWhenReady(true);
        p.prepare();
        return l;
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
        listenA(new androidx.media3.exoplayer.analytics.AnalyticsListener() {
            @Override public void onVideoDecoderInitialized(androidx.media3.exoplayer.analytics.AnalyticsListener.EventTime eventTime, String decoderName, long initializedTimestampMs, long initializationDurationMs) { activeDecoder = decoderName; }
            // Adverts stitched into a live channel change sound/picture format; mark the switch so it is waited out, not reconnected.
            @Override public void onAudioInputFormatChanged(androidx.media3.exoplayer.analytics.AnalyticsListener.EventTime e, androidx.media3.common.Format f, androidx.media3.exoplayer.DecoderReuseEvaluation r) { markSwitch(); }
            @Override public void onVideoInputFormatChanged(androidx.media3.exoplayer.analytics.AnalyticsListener.EventTime e, androidx.media3.common.Format f, androidx.media3.exoplayer.DecoderReuseEvaluation r) { markSwitch(); }
        });
        listen(new Player.Listener() {
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

    private float barShare = 1f; private int barSame = 0; private float barSeen = 1f;
    /** Every 2s: if the picture has black bars baked in top and bottom, scale it up until they are off screen (like a TV's zoom). */
    private final Runnable barWatch = new Runnable() { @Override public void run() {
        try {
            android.view.View sv = view == null ? null : view.getVideoSurfaceView();
            if (sv instanceof android.view.TextureView && player != null && player.isPlaying()) {
                Bitmap bm = ((android.view.TextureView) sv).getBitmap(96, 54);
                if (bm != null) {
                    float share = LetterboxCrop.contentShare(bm); bm.recycle();
                    if (Math.abs(share - barSeen) < 0.03f) barSame++; else { barSame = 0; barSeen = share; }
                    // Only change after the same reading 3 times running, and only zoom further in, so dark scenes never make it jump.
                    if (barSame >= 2 && share < barShare - 0.02f) { barShare = share; float sc = 1f / share; sv.setScaleX(sc); sv.setScaleY(sc); }
                }
            }
        } catch (Exception ignored) {}
        ui.postDelayed(this, 2000);
    } };

    /** Re-opened straight into playback after being away: close it so the main screen asks the PIN first. */
    @Override protected void onStart() {
        super.onStart();
        if (!PlayerApplication.pinPassed) {
            startActivity(new android.content.Intent(this, MainActivity.class).addFlags(android.content.Intent.FLAG_ACTIVITY_CLEAR_TOP | android.content.Intent.FLAG_ACTIVITY_SINGLE_TOP));
            finish();
        }
    }

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        StreamClaim.attach(this);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        FrameLayout root = new FrameLayout(this);
        final boolean stage = this instanceof PlayerStageActivity;
        // A see-through window can't fix its orientation on Android 8.0; the guide beneath is already sideways.
        if (stage && android.os.Build.VERSION.SDK_INT != 26) setRequestedOrientation(android.content.pm.ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
        // Films and episodes draw to a TextureView so baked-in black bars can be measured and zoomed past.
        // Stage: the guide's own picture is already full screen underneath; this view only adds the controls.
        view = stage ? (PlayerView) getLayoutInflater().inflate(R.layout.bm_player_stage, root, false)
                : PlayerControls.canSkip(kind()) ? (PlayerView) getLayoutInflater().inflate(R.layout.bm_player_texture, root, false) : new PlayerView(this);
        view.setControllerShowTimeoutMs((int) InactivityPolicy.CONTROLS_MS);
        view.setErrorMessageProvider(e -> android.util.Pair.create(0, SafeError.PLAYBACK));
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
        controlsRow = PlayerActionControls.add(this, root, () -> {}, this::showReport, () -> offerSwap(false), this::chooseSubtitles);
        final android.widget.LinearLayout ctrlRow = controlsRow;
        // Films and series always fill the screen (Zoom); live TV and catch up keep their own shape.
        if (PlayerControls.canSkip(kind())) { view.setResizeMode(androidx.media3.ui.AspectRatioFrameLayout.RESIZE_MODE_ZOOM); ui.postDelayed(barWatch, 3000); }
        view.setControllerVisibilityListener((PlayerView.ControllerVisibilityListener) vis -> {
            ctrlRow.setVisibility(vis);
            if (vis == android.view.View.VISIBLE) lastPressAt = android.os.SystemClock.elapsedRealtime();
        });
        ctrlRow.setVisibility(view.isControllerFullyVisible() ? android.view.View.VISIBLE : android.view.View.GONE);
        setContentView(root);
        lastPressAt = android.os.SystemClock.elapsedRealtime();
        ui.postDelayed(hideControls, 1000);

        // Live channel opened from its playing preview: keep that stream instead of reconnecting.
        carried = getIntent().getBooleanExtra("carried", false) && !getIntent().hasExtra("catchup_prefix")
                ? PreviewHandoff.take(getIntent().getStringExtra("content_id")) : null;
        loadHeavy(this);
        player = carried != null ? carried : build(this, getIntent().hasExtra("catchup_prefix"), recoveryName());
        final int subs = getIntent().getIntExtra("subtitles", -1);
        if (subs == 0 || subs == 1) player.setTrackSelectionParameters(player.getTrackSelectionParameters().buildUpon()
                .setTrackTypeDisabled(androidx.media3.common.C.TRACK_TYPE_TEXT, subs == 0)
                .setPreferredTextLanguage(subs == 1 ? java.util.Locale.getDefault().getLanguage() : null)
                .setSelectUndeterminedTextLanguage(subs == 1)
                .setIgnoredTextSelectionFlags(subs == 1 ? 0 : androidx.media3.common.C.SELECTION_FLAG_FORCED).build());
        progressKey = getIntent().getStringExtra("progress_key");
        seriesKey = getIntent().getStringExtra("series_key");
        resumePosition = getIntent().getLongExtra("resume_ms", 0);
        view.setKeepContentOnPlayerReset(true); // the last picture stays up while a dropped live stream reopens
        view.setPlayer(player);
        Bitmap still = carried != null && !stage ? PreviewSnapshot.take() : null;
        if (still != null) {
            final android.widget.ImageView cover = new android.widget.ImageView(this);
            cover.setImageBitmap(still);
            cover.setScaleType(android.widget.ImageView.ScaleType.FIT_CENTER);
            root.addView(cover, 1);
            final Runnable lift = () -> { if (cover.getParent() != null) root.removeView(cover); };
            listen(new Player.Listener() { @Override public void onRenderedFirstFrame() { ui.post(lift); } });
            ui.postDelayed(lift, PreviewSnapshot.MAX_COVER_MS);
        } else PreviewSnapshot.clear();
        final boolean is4kDevice = device4k(this);
        listen(new Player.Listener() {
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
                            .setMessage("This has subtitles and they're on. Do you want to keep them?\n\nYou can change or switch them off any time with the 💬 Subtitles button.")
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
        // Live feed status pill (top right): only appears for "Buffering…" or "No picture".
        feedNote = new TextView(this);
        feedNote.setTextSize(16);
        feedNote.setTypeface(Typeface.DEFAULT_BOLD);
        feedNote.setTextColor(0xFFFFFFFF);
        feedNote.setBackgroundColor(0xB30B1220);
        feedNote.setPadding(28, 12, 28, 12);
        feedNote.setVisibility(TextView.GONE);
        FrameLayout.LayoutParams flp = new FrameLayout.LayoutParams(FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.TOP | Gravity.END);
        flp.rightMargin = 32; flp.topMargin = 32;
        root.addView(feedNote, flp);
        coverUntilFirstFrame(root);
        startWithRecovery(urls);
        ui.postDelayed(saveTick, 5000);
    }

    // ---------- anti-buffering: stall tracking, silent reconnect, quality drop, SD offer ----------
    private String[] liveUrls;
    private int urlAt, reconnects;
    private long stallStartedAt, lastStableAt, lastPosition;
    private final long[] stallTimes = new long[16]; private int stallCount;
    private boolean everReady, capped, sdOffered;
    private final long openedAt = android.os.SystemClock.elapsedRealtime();
    private ExoPlayer carried;
    private long formatChangedAt = -100000;
    private boolean stallAdvert;
    private String lastAudioKey;
    private final BufferRecoveryWatch bufferWatch = new BufferRecoveryWatch();
    private boolean reconnectPending;
    private boolean reopenForBuffer;
    private long reopenBufferedPosition;
    private String pendingFormat;
    private TextView reconnectNote;
    private final Runnable reopenStream = () -> {
        reconnectPending = false;
        if (player == null || isFinishing()) return;
        if (reopenForBuffer && (player.getPlaybackState() == Player.STATE_READY
                || !player.getPlayWhenReady() || player.getBufferedPosition() > reopenBufferedPosition)) {
            bufferWatch.reset();
            { ui.removeCallbacks(this.showReconnectNote); if (reconnectNote != null) reconnectNote.setVisibility(TextView.GONE); }
            return;
        }
        if (pendingFormat != null) {
            for (int i=0;i<liveUrls.length;i++) if (liveUrls[i].endsWith("." + pendingFormat)) { urlAt=i; break; }
            pendingFormat=null;
        }
        open(!"live".equals(kind()) ? lastPosition : 0);
    };
    private TextView feedNote;

    private void showFeed(String label) {
        if (feedNote == null) return;
        if (label == null) { feedNote.setVisibility(TextView.GONE); return; }
        feedNote.setText(label);
        feedNote.setVisibility(TextView.VISIBLE);
    }

    // Startup owns the refresh rate. Fresh playback only waits for its first picture.
    private android.view.View loadingCover;
    private boolean uncovered, firstFrame;
    private final Runnable uncover = () -> {
        if (uncovered) return; uncovered = true;
        if (loadingCover != null) loadingCover.setVisibility(android.view.View.GONE);
        if (player != null) player.setVolume(1f);
    };
    private void maybeUncover() {
        if (uncovered || !firstFrame) return;
        ui.post(uncover);
    }
    private void coverUntilFirstFrame(FrameLayout root) {
        if (carried != null) { uncovered = true; return; }
        // Loading picture: family watching TV with popcorn and "Channel Loading" (sound muted underneath).
        FrameLayout cover = new FrameLayout(this);
        cover.setBackgroundColor(0xFF000000);
        android.widget.ImageView art = new android.widget.ImageView(this);
        art.setImageResource(R.drawable.channel_loading);
        art.setScaleType(android.widget.ImageView.ScaleType.CENTER_CROP);
        cover.addView(art, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        TextView msg = new TextView(this);
        msg.setText("Channel Loading…");
        msg.setTextSize(30); msg.setTypeface(Typeface.DEFAULT_BOLD); msg.setTextColor(0xFFFFFFFF);
        msg.setShadowLayer(12, 0, 2, 0xCC000000);
        msg.setBackgroundColor(0x99000000); msg.setPadding(48, 18, 48, 18);
        FrameLayout.LayoutParams mlp = new FrameLayout.LayoutParams(FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL);
        mlp.bottomMargin = 90;
        cover.addView(msg, mlp);
        loadingCover = cover;
        root.addView(cover, 1, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        player.setVolume(0f);
        listen(new Player.Listener() { @Override public void onRenderedFirstFrame() { firstFrame = true; maybeUncover(); } });

    }

    private void startWithRecovery(String[] urls) {
        liveUrls = urls;
        urlAt = Math.max(0, Math.min(urls.length - 1, getIntent().getIntExtra("freeze_url_index", 0)));
        listenA(new androidx.media3.exoplayer.analytics.AnalyticsListener() {
            @Override public void onVideoDecoderInitialized(androidx.media3.exoplayer.analytics.AnalyticsListener.EventTime eventTime, String decoderName, long initializedTimestampMs, long initializationDurationMs) { activeDecoder = decoderName; }
            // Adverts stitched into a live channel change sound/picture format; mark the switch so it is waited out, not reconnected.
            @Override public void onAudioInputFormatChanged(androidx.media3.exoplayer.analytics.AnalyticsListener.EventTime e, androidx.media3.common.Format f, androidx.media3.exoplayer.DecoderReuseEvaluation r) { markSwitch("sound"); }
            @Override public void onVideoInputFormatChanged(androidx.media3.exoplayer.analytics.AnalyticsListener.EventTime e, androidx.media3.common.Format f, androidx.media3.exoplayer.DecoderReuseEvaluation r) { markSwitch("picture"); }
        });
        listen(new Player.Listener() {
            @Override public void onPlaybackStateChanged(int s) {
                long now = android.os.SystemClock.elapsedRealtime();
                if (s == Player.STATE_BUFFERING && everReady && stallStartedAt == 0) {
                    stallStartedAt = now;
                    showFeed(FeedStatus.label(blackSent, true));
                    ui.removeCallbacks(cleanPlay);
                    bufferWatch.reset();
                    // Classify the report without abandoning the existing buffer.
                    stallAdvert = "live".equals(kind()) && StreamRecovery.advertSwitch(now - formatChangedAt);
                    // A size change alone does not prove a broken stream. Let buffered video load
                    // rather than seeking away from it during a normal advert/quality transition.
                } else if (s == Player.STATE_READY) {
                    if (stallStartedAt > 0) onStallEnded(now - stallStartedAt, reconnects > 0);
                    everReady = true; stallStartedAt = 0; reconnects = 0; lastStableAt = now;
                    if (player != null) surveySubtitles(player.getCurrentTracks());
                    showFeed(FeedStatus.label(blackSent, false));
                    if ("live".equals(kind())) {
                        ui.removeCallbacks(cleanPlay); ui.postDelayed(cleanPlay, ChannelHealth.CLEAN_MS);
                        if (!blackArmed) { blackArmed = true; ui.postDelayed(blackCheck, ChannelHealth.BLACK_MS); }
                    }
                    // The periodic watch stays armed across READY and subsequent buffering.
                    ui.removeCallbacks(reopenStream); reconnectPending = false; bufferWatch.reset();
                    { ui.removeCallbacks(showReconnectNote); if (reconnectNote != null) reconnectNote.setVisibility(TextView.GONE); }
                } else if (s == Player.STATE_ENDED && "live".equals(kind())) {
                    // Live never really ends: the provider dropped the stream (picture and sound stop
                    // with no buffering sign). Record it and reopen the channel at now.
                    reportBuffer(0, true, true, "provider_cut");
                    noteSwitch("provider_restart");
                    // Inside an advert switch the feed needs its cushion back (4.56 behaviour) or it keeps
                    // buffering into the break; a plain provider restart outside adverts reopens at once.
                    reconnect(advertGrace() ? StreamRecovery.cushioned(recoveryName()) : true);
                }
            }
            @Override public void onPositionDiscontinuity(Player.PositionInfo o, Player.PositionInfo n, int reason) {
                // A clock jump in the stream (typical at an advert break) is a switch, not a seek by the viewer.
                if (reason == Player.DISCONTINUITY_REASON_AUTO_TRANSITION || reason == Player.DISCONTINUITY_REASON_INTERNAL) markSwitch("timing");
            }
            @Override public void onVideoSizeChanged(VideoSize v) {
                markSwitch("picture");
                androidx.media3.common.Format f = player == null ? null : player.getVideoFormat();
                if (f != null && "live".equals(kind()) && StreamRecovery.isHeavyFormat(f.width, f.height, f.frameRate, f.bitrate)
                        && StreamRecovery.rememberHeavy(recoveryName())) saveHeavy(PlayerActivity.this);
            }
            @Override public void onTracksChanged(androidx.media3.common.Tracks t) {
                surveySubtitles(t);
                // Sound format change at a break (e.g. stereo to surround) is a feed switch too.
                String audioKey = null;
                for (androidx.media3.common.Tracks.Group g : t.getGroups())
                    if (g.getType() == androidx.media3.common.C.TRACK_TYPE_AUDIO)
                        for (int i = 0; i < g.length; i++) if (g.isTrackSelected(i)) { androidx.media3.common.Format af = g.getTrackFormat(i); audioKey = af.sampleMimeType + "/" + af.channelCount + "/" + af.sampleRate; }
                if (audioKey != null) { if (lastAudioKey != null && !audioKey.equals(lastAudioKey)) markSwitch("sound"); lastAudioKey = audioKey; }

            }
            @Override public void onPlayerError(PlaybackException e) {
                if (e.errorCode == PlaybackException.ERROR_CODE_BEHIND_LIVE_WINDOW) { player.seekToDefaultPosition(); player.prepare(); return; }
                if (!everReady && urlAt + 1 < liveUrls.length) { urlAt++; open(0); return; }
                // Every address failed before any picture (format the main player cannot open): backup engine takes over.
                lastError = e.getErrorCodeName() + ": " + e.getMessage() + (e.getCause() != null ? " / " + e.getCause() : "");
                // A UHD decoder can still be held by the preview for a moment: retry the same address once before giving up.
                if (!everReady && !retriedStart) { retriedStart = true; ui.postDelayed(() -> { if (player != null) open(0); }, 1500); return; }
                if (!everReady && !"catchup".equals(kind())) { sendDiagnostic(); handToBackup(); return; }
                reconnect();
            }
        });
        if (carried != null && player.getPlaybackState() != Player.STATE_IDLE) {
            // Already playing from the preview: pick up where it is and arm the usual health checks.
            urlAt = PreviewHandoff.urlIndex(player, urls);
            player.setPlayWhenReady(true);
            if (player.getPlaybackState() == Player.STATE_READY) {
                everReady = true; lastStableAt = android.os.SystemClock.elapsedRealtime();
                if ("live".equals(kind())) { ui.postDelayed(cleanPlay, ChannelHealth.CLEAN_MS); blackArmed = true; ui.postDelayed(blackCheck, ChannelHealth.BLACK_MS); }
            }
        } else open(0);
        ui.postDelayed(qualityRaise, StreamRecovery.STABLE_RAISE_MS);
        ui.postDelayed(antiFreeze, 1000);
        ui.postDelayed(stallWatch, 1000);
    }

    // Sports Guide crosses: a live channel with no picture 10s after opening, or 2 clean minutes to clear a cross.
    private boolean blackArmed, cleanSent, blackSent;
    private final Runnable blackCheck = () -> {
        if (player == null || blackSent) return;
        androidx.media3.exoplayer.DecoderCounters c = player.getVideoDecoderCounters();
        if (c == null || c.renderedOutputBufferCount == 0) { blackSent = true; showFeed(FeedStatus.NO_PICTURE); ChannelHealth.report(this, getIntent().getStringExtra("content_name"), "black"); }
    };
    private final Runnable cleanPlay = () -> {
        if (player == null || cleanSent || blackSent) return;
        cleanSent = true; ChannelHealth.report(this, getIntent().getStringExtra("content_name"), "ok");
    };

    // Anti-freeze: picture stuck while "playing" (sound carries on) or live drifting far behind now.
    private int afLastFrames = -1, afTicks;
    private void markSwitch() { markSwitch("picture"); }
    private void markSwitch(String type) { if (everReady) { formatChangedAt = android.os.SystemClock.elapsedRealtime(); noteSwitch(type); } }
    /** Feed switch for the admin report (live only; one per type every 30s per channel). */
    private void noteSwitch(String type) {
        if (!"live".equals(kind())) return;
        BufferReporter.feedSwitch(this, getIntent().getStringExtra("content_id"), getIntent().getStringExtra("content_name"), getIntent().getStringExtra("category_name"), type, stallAdvert);
    }
    private boolean advertGrace() { return "live".equals(kind()) && StreamRecovery.inAdvertGrace(android.os.SystemClock.elapsedRealtime() - formatChangedAt); }

    private final Runnable antiFreeze = new Runnable() {
        @Override public void run() {
            if (player == null) return;
            boolean playing = player.isPlaying() && player.getPlaybackState() == Player.STATE_READY;
            androidx.media3.exoplayer.DecoderCounters c = player.getVideoDecoderCounters();
            int frames = c == null ? -1 : c.renderedOutputBufferCount;
            // The short black/still gap between programme and adverts is not a freeze.
            if (playing && frames >= 0 && frames == afLastFrames && !advertGrace()) afTicks++; else afTicks = 0;
            afLastFrames = frames;
            if (StreamRecovery.frozen(afTicks)) {
                afTicks = 0; afLastFrames = -1;
                reportBuffer(StreamRecovery.FREEZE_TICKS * 1000L, true, true, null);
                if ("live".equals(kind())) { recoverFrozenLive(); return; } else reconnect();
            } else if (playing && player.isCurrentMediaItemLive() && StreamRecovery.drifted(player.getCurrentLiveOffset(), defaultLiveOffset(), recoveryName())) {
                player.seekToDefaultPosition();
            }
            ui.postDelayed(this, 1000);
        }
    };

    static android.content.Intent freshFreezeIntent(android.content.Intent original, int urlIndex) {
        android.content.Intent next = new android.content.Intent(original);
        next.removeExtra("carried");
        next.putExtra("freeze_url_index", urlIndex);
        next.putExtra("freeze_restarts", original.getIntExtra("freeze_restarts", 0) + 1);
        return next;
    }

    private void recoverFrozenLive() {
        if (player == null || handedOver || isFinishing()) return;
        if (LiveFreezeRecovery.useBackup(getIntent().getIntExtra("freeze_restarts", 0))) {
            handToBackup(); return;
        }
        // A fresh opaque playback screen also replaces a carried guide-stage surface. Never hand
        // the frozen decoder back to the guide, and never open a second provider connection first.
        android.content.Intent next = freshFreezeIntent(getIntent(), urlAt).setClass(this, PlayerActivity.class);
        handedOver = true;
        ui.removeCallbacks(reopenStream); reconnectPending = false;
        for (Player.Listener l : mine) player.removeListener(l);
        for (androidx.media3.exoplayer.analytics.AnalyticsListener l : mineA) player.removeAnalyticsListener(l);
        player.release(); player = null;
        startActivity(next);
        finish();
    }

    /** The live offset the stream itself settled on (provider hold-back), 0 when unknown. */
    private long defaultLiveOffset() {
        try {
            androidx.media3.common.Timeline t = player.getCurrentTimeline();
            if (t.isEmpty()) return 0;
            androidx.media3.common.Timeline.Window w = t.getWindow(player.getCurrentMediaItemIndex(), new androidx.media3.common.Timeline.Window());
            long ms = w.liveConfiguration == null ? androidx.media3.common.C.TIME_UNSET : w.liveConfiguration.targetOffsetMs;
            return ms == androidx.media3.common.C.TIME_UNSET ? 0 : ms;
        } catch (RuntimeException e) { return 0; }
    }

    /** Remember the other stream format for this channel after repeated stalls, so next time starts with it. */
    private void rememberBetterFormat() {
        String id = getIntent().getStringExtra("content_id");
        if (!"live".equals(kind()) || id == null || liveUrls.length < 2) return;
        String other = StreamRecovery.otherFormat(liveUrls[urlAt]);
        if (other != null) { prefs(this).edit().putString("fmt_pref:" + id, other).apply(); FormatSync.push(this, id, other); }
    }

    private void chooseSubtitles() {
        if (player == null) return;
        final java.util.List<androidx.media3.common.TrackGroup> groups = new java.util.ArrayList<>();
        final java.util.List<Integer> indices = new java.util.ArrayList<>();
        java.util.List<String> names = new java.util.ArrayList<>(); int selected = -1;
        boolean off = player.getTrackSelectionParameters().disabledTrackTypes.contains(androidx.media3.common.C.TRACK_TYPE_TEXT);
        for (androidx.media3.common.Tracks.Group g : player.getCurrentTracks().getGroups()) {
            if (g.getType() != androidx.media3.common.C.TRACK_TYPE_TEXT) continue;
            for (int i = 0; i < g.length; i++) {
                if (!g.isTrackSupported(i)) continue;
                androidx.media3.common.Format f = g.getTrackFormat(i);
                if (!off && g.isTrackSelected(i)) selected = names.size();
                groups.add(g.getMediaTrackGroup()); indices.add(i);
                names.add(PlayerActionControls.trackName(f.label, f.language, names.size() + 1));
            }
        }
        PlayerActionControls.pickSubtitles(this, names, selected, which -> {
            if (player == null) return;
            androidx.media3.common.TrackSelectionParameters.Builder b = player.getTrackSelectionParameters().buildUpon()
                    .clearOverridesOfType(androidx.media3.common.C.TRACK_TYPE_TEXT);
            if (which < 0) b.setTrackTypeDisabled(androidx.media3.common.C.TRACK_TYPE_TEXT, true);
            else b.setTrackTypeDisabled(androidx.media3.common.C.TRACK_TYPE_TEXT, false)
                    .setOverrideForType(new androidx.media3.common.TrackSelectionOverride(groups.get(which), indices.get(which)));
            player.setTrackSelectionParameters(b.build());
        });
    }

    private boolean subtitlesSurveyed;
    /** Quietly tells BM Support whether this live channel carries subtitle tracks (once per play, nothing shown). */
    private void surveySubtitles(androidx.media3.common.Tracks t) {
        if (subtitlesSurveyed || !"live".equals(kind()) || !everReady) return;
        boolean video = false; int text = 0; java.util.LinkedHashSet<String> langs = new java.util.LinkedHashSet<>();
        for (androidx.media3.common.Tracks.Group g : t.getGroups()) {
            if (g.getType() == androidx.media3.common.C.TRACK_TYPE_VIDEO) video = true;
            if (g.getType() != androidx.media3.common.C.TRACK_TYPE_TEXT) continue;
            text++; String l = g.getMediaTrackGroup().getFormat(0).language; if (l != null) langs.add(l);
        }
        if (!video) return; // tracks still arriving
        subtitlesSurveyed = true;
        final String token = getSharedPreferences("bmplayer", MODE_PRIVATE).getString("token", "");
        final String name = getIntent().getStringExtra("content_name");
        if (token.isEmpty() || name == null || name.trim().isEmpty()) return;
        final int count = text; final String languages = android.text.TextUtils.join(",", langs);
        new Thread(() -> { try {
            Net.postJson(Net.SITE + "/api/public/player", new org.json.JSONObject().put("action", "subtitle_check").put("device_token", token)
                    .put("name", name.length() > 200 ? name.substring(0, 200) : name).put("tracks", Math.min(count, 50))
                    .put("languages", languages.length() > 200 ? languages.substring(0, 200) : languages).toString());
        } catch (Exception ignored) {} }).start();
    }

    private boolean handedOver, retriedStart;
    private String lastError = "";
    /** Tells BM Support why the main player couldn't open this stream (automatic, no customer text). */
    private void sendDiagnostic() {
        final String token = getSharedPreferences("bmplayer", MODE_PRIVATE).getString("token", "");
        if (token.isEmpty()) return;
        String u = liveUrls[urlAt]; String fmt = u.endsWith(".m3u8") ? "m3u8" : u.endsWith(".ts") ? "ts" : "direct";
        final String issue = ("Main player failed (" + fmt + "), switched to backup engine. " + lastError);
        new Thread(() -> { try {
            Net.postJson(Net.SITE + "/api/public/player", new org.json.JSONObject().put("action", "report").put("device_token", token)
                    .put("kind", kind()).put("title", "Playback error (automatic): " + String.valueOf(getIntent().getStringExtra("content_name")))
                    .put("issue", issue.length() > 990 ? issue.substring(0, 990) : issue)
                    .put("device", String.valueOf(getIntent().getStringExtra("report_device"))).put("version", String.valueOf(getIntent().getStringExtra("report_version"))).toString());
        } catch (Exception ignored) {} }).start();
    }
    /** Restart this stream in the built-in backup engine (BackupPlayerActivity) with the same addresses and position. */
    private void handToBackup() {
        if (handedOver || isFinishing()) return;
        handedOver = true;
        // Report straight away so the Sports Guide marks it even if the viewer gives up on the backup engine.
        if (!"catchup".equals(kind()) && !everReady) ChannelHealth.report(this, getIntent().getStringExtra("content_name"), "failed");
        long pos = player != null && player.getDuration() > 0 ? Math.max(lastPosition, player.getCurrentPosition()) : resumePosition;
        if (player != null) { player.release(); player = null; }
        Toast.makeText(this, "Switching to BM Player's backup engine…", Toast.LENGTH_SHORT).show();
        android.content.Intent i = new android.content.Intent(getIntent()).setClass(this, BackupPlayerActivity.class)
                .putExtra("urls", liveUrls).putExtra("resume_ms", pos);
        startActivity(i);
        finish();
    }

    private void open(long at) {
        bufferWatch.reset();
        MediaItem mi = item(liveUrls[urlAt]);
        // Live sits a few seconds behind the edge so short provider cut-outs play through from the buffer.
        if ("live".equals(kind()) && StreamRecovery.overrideLiveOffset(liveUrls[urlAt])) mi = mi.buildUpon().setLiveConfiguration(new MediaItem.LiveConfiguration.Builder()
                .setTargetOffsetMs(StreamRecovery.liveTargetMs(recoveryName())).setMinOffsetMs(StreamRecovery.liveTargetMs(recoveryName()) / 2).build()).build();
        float[] sp = "live".equals(kind()) ? StreamRecovery.hlsLiveSpeeds(liveUrls[urlAt]) : null;
        // HLS keeps the provider's hold-back (no offset) but may slow a touch rather than stall when segments arrive late.
        if (sp != null) mi = mi.buildUpon().setLiveConfiguration(new MediaItem.LiveConfiguration.Builder()
                .setMinPlaybackSpeed(sp[0]).setMaxPlaybackSpeed(sp[1]).build()).build();
        player.setMediaItem(mi);
        player.setPlayWhenReady(true);
        player.prepare();
        if (at > 0) player.seekTo(at);
    }

    private final Runnable stallWatch = new Runnable() {
        @Override public void run() {
            if (player == null || isFinishing()) return;
            if (reconnectPending && reopenForBuffer && player.getBufferedPosition() > reopenBufferedPosition) {
                ui.removeCallbacks(reopenStream); reconnectPending=false;
                { ui.removeCallbacks(showReconnectNote); if (reconnectNote != null) reconnectNote.setVisibility(TextView.GONE); }
            }
            boolean retry = bufferWatch.retry(android.os.SystemClock.elapsedRealtime(),
                    player.getBufferedPosition(), StreamRecovery.advertStallTimeout(StreamRecovery.stallReconnectMs(recoveryName()), stallAdvert),
                    player.getPlaybackState() == Player.STATE_BUFFERING, player.getPlayWhenReady());
            if (!reconnectPending && retry) reconnect();
            ui.postDelayed(this, 1000);
        }
    };

    private final Runnable showReconnectNote = () -> {
        if (reconnectNote != null && player != null && player.getPlaybackState() != Player.STATE_READY) reconnectNote.setVisibility(TextView.VISIBLE);
    };
    private void reconnect() {
        reconnect(false);
    }
    private void reconnect(boolean immediate) {
        if (player == null || isFinishing() || reconnectPending) return;
        if (player.getDuration() > 0) lastPosition = Math.max(lastPosition, player.getCurrentPosition());
        reconnects++;
        if (StreamRecovery.giveUp(reconnects)) {
            { ui.removeCallbacks(showReconnectNote); if (reconnectNote != null) reconnectNote.setVisibility(TextView.GONE); }
            reportBuffer(StreamRecovery.stallReconnectMs(recoveryName()), true, false, stallAdvert ? "advert_switch" : "network_drop");
            handToBackup();
            return;
        }
        // Only show the reconnecting note if the stream isn't back within 3 seconds.
        ui.removeCallbacks(showReconnectNote); ui.postDelayed(showReconnectNote, 3000);
        reconnectPending = true;
        reopenForBuffer = player.getPlaybackState() == Player.STATE_BUFFERING;
        reopenBufferedPosition = player.getBufferedPosition();
        ui.postDelayed(reopenStream, immediate && reconnects == 1 ? 0 : StreamRecovery.backoffMs(reconnects));
    }

    /** Report from inside the player: one plain pop-up that pans above the keypad (no resizing, which made phones flicker). */
    private void showReport() { PlayerActionControls.report(this); }

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
    /** Measured high-bitrate channels, so they open with the large buffer next time. */
    static void loadHeavy(Context c) {
        if (!StreamRecovery.HEAVY.isEmpty()) return;
        String saved = prefs(c).getString("heavy_channels", "");
        for (String k : saved.split("\n")) if (!k.isEmpty()) StreamRecovery.HEAVY.add(k);
    }
    static void saveHeavy(Context c) {
        synchronized (StreamRecovery.HEAVY) { prefs(c).edit().putString("heavy_channels", String.join("\n", StreamRecovery.HEAVY)).apply(); }
    }

    private String recoveryName() { return "live".equals(kind()) ? getIntent().getStringExtra("recovery_name") == null ? getIntent().getStringExtra("content_name") : getIntent().getStringExtra("recovery_name") : ""; }
    private void reportBuffer(long ms, boolean reconnected, boolean freeze, String cause) {
        String u = liveUrls.length > urlAt ? liveUrls[urlAt] : "";
        String fmt = u.endsWith(".m3u8") ? "m3u8" : u.endsWith(".ts") ? "ts" : "direct";
        androidx.media3.exoplayer.DecoderCounters dc = player == null ? null : player.getVideoDecoderCounters();
        androidx.media3.common.Format vf = player == null ? null : player.getVideoFormat();
        String d = activeDecoder + (dc == null ? "" : " r" + dc.renderedOutputBufferCount + " d" + dc.droppedBufferCount
                + " q" + dc.queuedInputBufferCount + " s" + dc.skippedInputBufferCount) + VideoDecodePolicy.describe(vf);
        String decoder = d.substring(0, Math.min(120, d.length()));
        BufferReporter.record(this, kind(), getIntent().getStringExtra("content_id"), getIntent().getStringExtra("content_name"), ms, reconnected, freeze, cause, fmt, decoder, StreamRecovery.providerTag(recoveryName()), getIntent().getStringExtra("event_name"));
    }

    private void onStallEnded(long ms, boolean reconnected) {
        boolean dropOut = !stallAdvert;
        reportBuffer(ms, reconnected, false, stallAdvert ? "advert_switch" : "network_drop");
        stallAdvert = false;
        if (ms < StreamRecovery.MIN_REPORT_MS) return;
        long now = android.os.SystemClock.elapsedRealtime();
        stallTimes[stallCount % stallTimes.length] = now; stallCount++;
        int recent = StreamRecovery.recentStalls(stallTimes, Math.min(stallCount, stallTimes.length), now);
        if (recent >= StreamRecovery.STALLS_TO_LOWER) lowerQuality();
        // A channel whose connection keeps dropping is remembered on this box, so it opens with the
        // large cushion from then on and short dropouts pass without the picture stopping.
        if (dropOut && recent >= StreamRecovery.STALLS_TO_LOWER && StreamRecovery.rememberHeavy(recoveryName())) saveHeavy(this);
        // Stream type (ts/m3u8) is never switched or shared because of buffering: channels
        // always play in the playlist's own order, like other IPTV apps.
        if (recent >= ChannelSwap.AUTO_STALLS && swapOptions().length() > 0) offerSwap(true);
        else if (recent >= StreamRecovery.STALLS_TO_OFFER_SD) offerSd();
    }
    private boolean daznFormatSwapped, feedOffered;
    private org.json.JSONArray swapOptions() {
        try { String raw = getIntent().getStringExtra("swap_options"); return new org.json.JSONArray(raw == null ? "[]" : raw); }
        catch (Exception e) { return new org.json.JSONArray(); }
    }
    /** Swap channel: manual from the controls, or offered once by itself when the channel keeps buffering. */
    private void offerSwap(boolean auto) {
        if (isFinishing() || (auto && feedOffered)) return;
        if (auto && swapOptions().length() > 0) feedOffered = true;
        PlayerActionControls.swap(this, auto, () -> { if (player != null) { player.release(); player = null; } });
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

    // Player control buttons (Sound booster, Report a problem, Swap channel) get a bright border
    // while the remote is on them, so the focused box is obvious on a TV.
    private void focusBorder(android.widget.Button b) {
        final float d = getResources().getDisplayMetrics().density;
        final android.graphics.drawable.GradientDrawable normal = new android.graphics.drawable.GradientDrawable();
        normal.setColor(0xB30B1220); normal.setCornerRadius(12 * d);
        final android.graphics.drawable.GradientDrawable focused = new android.graphics.drawable.GradientDrawable();
        focused.setColor(0xB30B1220); focused.setCornerRadius(12 * d);
        focused.setStroke((int) (3 * d), 0xFFFBBF24);
        b.setBackground(normal);
        b.setTextColor(0xFFFFFFFF);
        b.setOnFocusChangeListener((v, has) -> v.setBackground(has ? focused : normal));
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


    // Every listener this screen puts on the player, so a live channel can be handed back to the guide preview clean.
    private final java.util.List<Player.Listener> mine = new java.util.ArrayList<>();
    private final java.util.List<androidx.media3.exoplayer.analytics.AnalyticsListener> mineA = new java.util.ArrayList<>();
    private void listen(Player.Listener l) { mine.add(l); player.addListener(l); }
    private void listenA(androidx.media3.exoplayer.analytics.AnalyticsListener l) { mineA.add(l); player.addAnalyticsListener(l); }

    /** Backing out of a live channel keeps it playing for the guide preview: no reconnect, no rebuffer. */
    private void handBackToGuide() {
        if (player == null || handedOver || !everReady || !"live".equals(kind()) || getIntent().hasExtra("catchup_prefix")) return;
        int st = player.getPlaybackState();
        if (st != Player.STATE_READY && st != Player.STATE_BUFFERING) return;
        String id = getIntent().getStringExtra("content_id");
        if (id == null) return;
        for (Player.Listener l : mine) player.removeListener(l);
        for (androidx.media3.exoplayer.analytics.AnalyticsListener l : mineA) player.removeAnalyticsListener(l);
        mine.clear(); mineA.clear();
        player.setVolume(1f);
        ExoPlayer p = player; player = null;
        PreviewHandoff.offerBack(p, id);
    }

    @Override protected void onPause() { if (isFinishing()) handBackToGuide(); super.onPause(); }

    @Override protected void onStop() { saveProgress(false); super.onStop(); if (player != null) player.pause(); }

    @Override protected void onDestroy() {
        StreamClaim.detach(this);
        // Viewer gave up on a live channel that never showed a picture: tell the Sports Guide so it gets crossed.
        if ("live".equals(kind()) && !everReady && !handedOver && !blackSent && isFinishing()
                && android.os.SystemClock.elapsedRealtime() - openedAt >= ChannelHealth.GIVE_UP_MS)
            ChannelHealth.report(this, getIntent().getStringExtra("content_name"), "failed");
        ui.removeCallbacks(uncover); ui.removeCallbacks(reopenStream); ui.removeCallbacks(freezeWatch); ui.removeCallbacks(stallWatch); ui.removeCallbacks(qualityRaise); ui.removeCallbacks(antiFreeze); BufferReporter.flush(this); saveProgress(false); ProgressSync.push(this, true); ui.removeCallbacks(saveTick); ui.removeCallbacks(hideControls); ui.removeCallbacks(barWatch); super.onDestroy(); if (player != null) { player.release(); player = null; } }
}
