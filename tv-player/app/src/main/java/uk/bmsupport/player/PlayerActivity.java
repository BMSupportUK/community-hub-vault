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
        edit.apply();
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
        int buf = "large".equals(p.getString("buffer", "normal")) ? 60000 : "small".equals(p.getString("buffer", "normal")) ? 15000 : 30000;
        DefaultLoadControl load = new DefaultLoadControl.Builder()
                .setBufferDurationsMs(Math.min(15000, buf), buf, 2000, 4000).build();
        return new ExoPlayer.Builder(c, renderers)
                .setMediaSourceFactory(new DefaultMediaSourceFactory(c, ex).setDataSourceFactory(http))
                .setLoadControl(load)
                .build();
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
            if (cuRetries > 8) Toast.makeText(this, "The catch up recording stopped and couldn't reconnect. Try again or use VLC.", Toast.LENGTH_LONG).show();
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
        playWithFallback(player, urls, () -> Toast.makeText(this,
                "This stream won't play here. Try \"Play with VLC\" or report a problem.", Toast.LENGTH_LONG).show());
        ui.postDelayed(saveTick, 5000);
    }

    @Override public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE && player != null) {
            player.setPlayWhenReady(!player.getPlayWhenReady());
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override public boolean dispatchKeyEvent(android.view.KeyEvent e) { return PlayerApplication.closeAnnouncementOnBack(this, e) || super.dispatchKeyEvent(e); }

    @Override public void onUserInteraction() {
        super.onUserInteraction();
        lastPressAt = android.os.SystemClock.elapsedRealtime();
        PlayerApplication.interaction(this);
    }

    @Override protected void onStop() { saveProgress(false); super.onStop(); if (player != null) player.pause(); }

    @Override protected void onDestroy() { ui.removeCallbacks(freezeWatch); saveProgress(false); ui.removeCallbacks(saveTick); ui.removeCallbacks(hideControls); super.onDestroy(); if (player != null) { player.release(); player = null; } }
}
