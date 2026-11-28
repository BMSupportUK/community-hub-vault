package uk.bmsupport.player;

import static org.junit.Assert.*;
import android.content.Intent;
import android.widget.FrameLayout;
import android.widget.ImageView;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import org.robolectric.Robolectric;
import org.robolectric.RuntimeEnvironment;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
public class RadioChannelTest {
    @Test public void identifiesProviderRadioCategoriesAndStationNames() {
        assertTrue(RadioChannel.is("BBC Radio 1", "UK | Music"));
        assertTrue(RadioChannel.is("Capital FM", "UK | Radio Stations"));
        assertTrue(RadioChannel.is("Capital FM", "RADIO"));
        assertFalse(RadioChannel.is("BBC One", "UK | Free to air"));
        assertFalse(RadioChannel.is("Sky Sports Main Event", "Sports"));
    }

    @Test public void advancingAudioWithoutPicturesIsNotAStall() {
        LiveReconnect recovery = new LiveReconnect();
        recovery.opened(0);
        for (long second = 1; second <= 60; second++)
            assertFalse(recovery.stalled(0, second * 20, second * 1000));
    }

    @Test public void fullScreenRadioNeverWaitsForVideoBeforeAllowingSound() throws Exception {
        Intent intent = new Intent(RuntimeEnvironment.getApplication(), PlayerActivity.class)
                .putExtra("content_kind", "live").putExtra("radio_stream", true);
        PlayerActivity activity = Robolectric.buildActivity(PlayerActivity.class, intent).get();
        Method cover = PlayerActivity.class.getDeclaredMethod("coverUntilFirstFrame", FrameLayout.class);
        cover.setAccessible(true);
        cover.invoke(activity, new FrameLayout(activity));
        Field uncovered = PlayerActivity.class.getDeclaredField("uncovered"); uncovered.setAccessible(true);
        Field loadingCover = PlayerActivity.class.getDeclaredField("loadingCover"); loadingCover.setAccessible(true);
        assertTrue(uncovered.getBoolean(activity));
        assertNull(loadingCover.get(activity));
    }

    @Test public void studioArtworkIsReusedAcrossPreviewAndFullScreenLayouts() {
        FrameLayout host = new FrameLayout(RuntimeEnvironment.getApplication());
        ImageView first = RadioChannel.installArt(RuntimeEnvironment.getApplication(), host);
        ImageView second = RadioChannel.installArt(RuntimeEnvironment.getApplication(), host);
        assertSame(first, second);
        assertEquals(1, host.getChildCount());
        assertEquals("Radio station DJ mixing songs in the studio", first.getContentDescription());
        assertNotNull(first.getDrawable());
    }
}
