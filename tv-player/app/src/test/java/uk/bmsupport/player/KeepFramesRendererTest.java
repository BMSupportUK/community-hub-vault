package uk.bmsupport.player;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34, application = PlayerApplication.class)
public class KeepFramesRendererTest {
    @Test public void veryLateVideoNeverFreezesWaitingForAKeyframe() {
        assertFalse(KeepFramesRenderer.dropToKeyframe(-2_000_000, false));
        assertFalse(KeepFramesRenderer.dropToKeyframe(-600_000, false));
    }
    @Test public void lateFramesStillShowAtLeast25TimesASecond() {
        assertTrue(KeepFramesRenderer.forceRender(-600_000, 40_000));
        assertFalse(KeepFramesRenderer.forceRender(-600_000, 20_000));
        assertFalse(KeepFramesRenderer.forceRender(-10_000, 200_000));
    }
    @Test public void liveAndFilmPlayersUseTheKeepFramesRenderer() {
        androidx.media3.exoplayer.ExoPlayer live = PlayerActivity.build(RuntimeEnvironment.getApplication(), false, "Movie Premiere VIP Cinema Collection");
        assertNotNull(PlayerActivity.keepFrames(live));
        live.release();
    }
    @Test public void catchUpKeepsTheStockRenderer() {
        androidx.media3.exoplayer.ExoPlayer cu = PlayerActivity.build(RuntimeEnvironment.getApplication(), true, null);
        assertNull(PlayerActivity.keepFrames(cu));
        cu.release();
    }
}
