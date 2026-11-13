package uk.bmsupport.player;

import android.widget.FrameLayout;
import android.widget.TextView;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.ui.PlayerView;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.List;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34, application = PlayerApplication.class)
public class MultiScreenPaneTest {
    private Object field(MainActivity activity, String name) throws Exception {
        Field field = MainActivity.class.getDeclaredField(name);
        field.setAccessible(true);
        return field.get(activity);
    }

    @Test public void rightPaneRebuildKeepsLeftPlayerChannelAudioAndRejectsStaleSession() throws Exception {
        MainActivity activity = Robolectric.buildActivity(MainActivity.class).get();
        Field prefs = MainActivity.class.getDeclaredField("prefs"); prefs.setAccessible(true);
        prefs.set(activity, activity.getSharedPreferences("bmplayer", 0));
        @SuppressWarnings("unchecked") List<ExoPlayer> players = (List<ExoPlayer>) field(activity, "multiPlayers");
        FrameLayout[] panes = (FrameLayout[]) field(activity, "multiPanes");
        PlayerView[] views = (PlayerView[]) field(activity, "multiVideoViews");
        TextView[] labels = (TextView[]) field(activity, "multiLabels");
        for (int i = 0; i < 2; i++) {
            panes[i] = new FrameLayout(activity); views[i] = new PlayerView(activity);
            labels[i] = new TextView(activity); panes[i].addView(views[i]); panes[i].addView(labels[i]);
            players.add(PlayerActivity.build(activity)); views[i].setPlayer(players.get(i));
        }
        ExoPlayer left = players.get(0), oldRight = players.get(1);
        PlayerView oldSurface = views[1];
        Field audio = MainActivity.class.getDeclaredField("multiAudioPane"); audio.setAccessible(true); audio.setInt(activity, 1);
        MainActivity.Item channel = new MainActivity.Item("live", "123", "Test HD", "", "test");
        channel.url = "https://example.invalid/123.ts";
        Method reopen = MainActivity.class.getDeclaredMethod("reopenMultiPane", int.class, MainActivity.Item.class, int.class, int.class, boolean.class);
        reopen.setAccessible(true);
        try {
            reopen.invoke(activity, 1, channel, 0, 0, true);
            assertSame(left, players.get(0)); assertNotSame(oldRight, players.get(1));
            assertNotSame(oldSurface, views[1]); assertNull(oldSurface.getParent());
            assertSame(players.get(1), views[1].getPlayer());
            assertEquals(1f, players.get(1).getVolume(), 0f);
            assertNotNull(players.get(1).getCurrentMediaItem());
            assertEquals(channel.url, players.get(1).getCurrentMediaItem().localConfiguration.uri.toString());
            ExoPlayer recovered = players.get(1);
            reopen.invoke(activity, 1, channel, 99, 0, true);
            assertSame(recovered, players.get(1));
            ((int[]) field(activity, "multiSelections"))[1] = 1;
            reopen.invoke(activity, 1, channel, 0, 0, true);
            assertSame(recovered, players.get(1));
        } finally {
            Method stop = MainActivity.class.getDeclaredMethod("stopMulti"); stop.setAccessible(true); stop.invoke(activity);
        }
        assertTrue(players.isEmpty()); assertNull(views[1]);
    }
}