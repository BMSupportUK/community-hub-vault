package uk.bmsupport.player;

import android.app.Activity;
import android.content.Context;
import android.net.Uri;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.WindowManager;
import android.widget.Toast;

import androidx.media3.common.MediaItem;
import androidx.media3.common.MimeTypes;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.ui.PlayerView;

/** Built-in player. Tries each stream address in turn; errors suggest VLC. */
public class PlayerActivity extends Activity {
    /** IPTV panels often block unknown players, so identify as VLC like most IPTV apps. */
    static final String UA = "VLC/3.0.20 LibVLC/3.0.20";
    private ExoPlayer player;

    /** Player that follows http↔https redirects (panels redirect to load balancers) and sends a known user agent. */
    static ExoPlayer build(Context c) {
        DefaultHttpDataSource.Factory http = new DefaultHttpDataSource.Factory()
                .setUserAgent(UA)
                .setAllowCrossProtocolRedirects(true)
                .setConnectTimeoutMs(15000)
                .setReadTimeoutMs(20000);
        return new ExoPlayer.Builder(c).setMediaSourceFactory(new DefaultMediaSourceFactory(c).setDataSourceFactory(http)).build();
    }

    static MediaItem item(String url) {
        MediaItem.Builder b = new MediaItem.Builder().setUri(Uri.parse(url));
        if (url.endsWith(".m3u8")) b.setMimeType(MimeTypes.APPLICATION_M3U8);
        else if (url.endsWith(".ts")) b.setMimeType(MimeTypes.VIDEO_MP2T);
        return b.build();
    }

    /** Plays urls[0], moving to the next address whenever one fails. */
    static void playWithFallback(ExoPlayer p, String[] urls, Runnable allFailed) {
        final int[] at = {0};
        p.addListener(new Player.Listener() {
            @Override public void onPlayerError(PlaybackException e) {
                if (++at[0] < urls.length) { p.setMediaItem(item(urls[at[0]])); p.prepare(); p.play(); }
                else if (allFailed != null) allFailed.run();
            }
        });
        p.setMediaItem(item(urls[0]));
        p.setPlayWhenReady(true);
        p.prepare();
    }

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        PlayerView view = new PlayerView(this);
        setContentView(view);
        player = build(this);
        view.setPlayer(player);
        String[] urls = getIntent().getStringArrayExtra("urls");
        if (urls == null) urls = new String[]{getIntent().getStringExtra("url")};
        playWithFallback(player, urls, () -> Toast.makeText(this,
                "This stream won't play here. Try \"Play with VLC\" or report a problem.", Toast.LENGTH_LONG).show());
    }

    @Override public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE && player != null) {
            player.setPlayWhenReady(!player.getPlayWhenReady());
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override protected void onStop() { super.onStop(); if (player != null) player.pause(); }

    @Override protected void onDestroy() { super.onDestroy(); if (player != null) { player.release(); player = null; } }
}
