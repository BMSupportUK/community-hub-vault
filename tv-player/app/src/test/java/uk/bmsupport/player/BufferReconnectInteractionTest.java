package uk.bmsupport.player;

import android.content.Intent;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.ExoPlayer;
import java.lang.reflect.*;
import java.time.Duration;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.LooperMode;
import static org.junit.Assert.*;
import static org.robolectric.Shadows.shadowOf;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=34,application=PlayerApplication.class)
@LooperMode(LooperMode.Mode.PAUSED)
public class BufferReconnectInteractionTest {
    private static class Fixture {
        final PlayerActivity activity=Robolectric.buildActivity(PlayerActivity.class).get();
        int state=Player.STATE_BUFFERING,opens; long buffered=1000; String opened;
        Fixture() throws Exception {
            activity.setIntent(new Intent().putExtra("content_kind","live").putExtra("content_name","Coupang Event 12"));
            ExoPlayer fake=(ExoPlayer)Proxy.newProxyInstance(ExoPlayer.class.getClassLoader(),new Class[]{ExoPlayer.class},(p,m,a)->{
                switch(m.getName()) {
                    case "getPlaybackState": return state;
                    case "getPlayWhenReady": return true;
                    case "getBufferedPosition": return buffered;
                    case "getDuration": case "getCurrentPosition": return 0L;
                    case "setMediaItem": opens++; opened=((androidx.media3.common.MediaItem)a[0]).localConfiguration.uri.toString();return null;
                    default: if(m.getReturnType()==boolean.class)return false;if(m.getReturnType()==int.class)return 0;if(m.getReturnType()==long.class)return 0L;return null;
                }
            });
            field("player",fake);field("liveUrls",new String[]{"https://example.invalid/1.ts","https://example.invalid/1.m3u8"});
        }
        void field(String name,Object value)throws Exception { Field f=PlayerActivity.class.getDeclaredField(name);f.setAccessible(true);f.set(activity,value); }
        void reconnect()throws Exception { Method m=PlayerActivity.class.getDeclaredMethod("reconnect");m.setAccessible(true);m.invoke(activity); }
        void waitRetry(){shadowOf(android.os.Looper.getMainLooper()).idleFor(Duration.ofSeconds(2));}
    }
    @Test public void recoveredBufferDuringBackoffIsNotReopened()throws Exception { Fixture f=new Fixture();f.reconnect();f.buffered=2000;f.waitRetry();assertEquals(0,f.opens); }
    @Test public void readyDuringBackoffIsNotReopened()throws Exception { Fixture f=new Fixture();f.reconnect();f.state=Player.STATE_READY;f.waitRetry();assertEquals(0,f.opens); }
    @Test public void repeatedErrorsQueueOnlyOneReopenAndIdleStillRecovers()throws Exception { Fixture f=new Fixture();f.state=Player.STATE_IDLE;f.reconnect();f.reconnect();f.waitRetry();assertEquals(1,f.opens); }
    @Test public void deferredFormatIsUsedOnlyOnNextFailedConnection()throws Exception { Fixture f=new Fixture();f.field("pendingFormat","m3u8");assertEquals(0,f.opens);f.reconnect();f.waitRetry();assertEquals("https://example.invalid/1.m3u8",f.opened); }
}