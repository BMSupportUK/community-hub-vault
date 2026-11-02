package uk.bmsupport.player;

import android.app.Activity;
import android.net.Uri;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.WindowManager;
import android.widget.Toast;

import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.ui.PlayerView;

/** Built-in player. Errors offer VLC (if installed) via a toast hint. */
public class PlayerActivity extends Activity {
    private ExoPlayer player;

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        PlayerView view = new PlayerView(this);
        setContentView(view);
        player = new ExoPlayer.Builder(this).build();
        view.setPlayer(player);
        String url = getIntent().getStringExtra("url");
        player.setMediaItem(MediaItem.fromUri(Uri.parse(url)));
        player.addListener(new Player.Listener() {
            @Override public void onPlayerError(PlaybackException e) {
                Toast.makeText(PlayerActivity.this,
                        "This stream won't play here. Try \"Play with VLC\" or report a problem.", Toast.LENGTH_LONG).show();
            }
        });
        player.setPlayWhenReady(true);
        player.prepare();
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
