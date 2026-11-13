package uk.bmsupport.player;

import android.content.pm.PackageManager;
import android.view.KeyEvent;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ListView;
import androidx.media3.ui.PlayerView;
import java.lang.reflect.Field;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;
import static org.robolectric.Shadows.shadowOf;

/** The full-screen player's Left drawer: categories slide over the playing picture on TV boxes. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34, application = PlayerApplication.class)
public class LiveDrawerOverlayTest {
    @Before public void snapshot() {
        List<String[]> cats = new ArrayList<>();
        cats.add(new String[]{"*", "All"});
        cats.add(new String[]{"1", "Entertainment"});
        cats.add(new String[]{"2", "Films"});
        List<LiveDrawerData.Channel> chans = new ArrayList<>();
        chans.add(new LiveDrawerData.Channel("10", "BBC One", "1", "Entertainment", new String[]{"u10"}));
        chans.add(new LiveDrawerData.Channel("11", "ITV 1", "1", "Entertainment", new String[]{"u11"}));
        chans.add(new LiveDrawerData.Channel("20", "Movie Premiere", "2", "Films", new String[]{"u20"}));
        LiveDrawerData.set(cats, chans);
    }

    @After public void clear() {
        LiveDrawerData.set(null, null);
        LiveDrawerData.pendingPick = null;
    }

    private static void set(Object target, String name, Object value) throws Exception {
        Field f = PlayerActivity.class.getDeclaredField(name); f.setAccessible(true); f.set(target, value);
    }

    private static boolean bool(Object target, String name) throws Exception {
        Field f = PlayerActivity.class.getDeclaredField(name); f.setAccessible(true); return f.getBoolean(target);
    }

    private PlayerActivity boxPlayer() {
        PlayerActivity a = Robolectric.buildActivity(PlayerActivity.class).get();
        shadowOf(a.getPackageManager()).setSystemFeature(PackageManager.FEATURE_LEANBACK, true);
        return a;
    }

    @Test public void snapshotServesCategoriesAndChannels() {
        assertTrue(LiveDrawerData.ready());
        assertEquals(3, LiveDrawerData.categories().size());
        assertEquals(3, LiveDrawerData.channelsIn("*").size());
        assertEquals(2, LiveDrawerData.channelsIn("1").size());
        assertEquals("Movie Premiere", LiveDrawerData.find("20").name);
        assertNull(LiveDrawerData.find("missing"));
    }

    @Test public void leftOpensDrawerOverPlayer() throws Exception {
        PlayerActivity a = boxPlayer();
        FrameLayout root = new FrameLayout(a);
        set(a, "rootView", root);
        set(a, "view", new PlayerView(a)); // controller hidden: Left is free
        assertTrue(a.onKeyDown(KeyEvent.KEYCODE_DPAD_LEFT, new KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_DPAD_LEFT)));
        assertTrue(bool(a, "drawerShown"));
        assertEquals(2, root.getChildCount()); // scrim + panel over the picture
    }

    @Test public void backClosesDrawerBeforeLeaving() throws Exception {
        PlayerActivity a = boxPlayer();
        FrameLayout root = new FrameLayout(a);
        set(a, "rootView", root);
        set(a, "view", new PlayerView(a));
        a.onKeyDown(KeyEvent.KEYCODE_DPAD_LEFT, new KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_DPAD_LEFT));
        assertTrue(a.onKeyDown(KeyEvent.KEYCODE_BACK, new KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_BACK)));
        assertFalse(bool(a, "drawerShown"));
        // The scrim goes at once; the panel slides out and is removed when its animation ends.
        assertEquals(1, root.getChildCount());
    }

    @Test public void leftAgainClosesDrawer() throws Exception {
        PlayerActivity a = boxPlayer();
        set(a, "rootView", new FrameLayout(a));
        set(a, "view", new PlayerView(a));
        a.onKeyDown(KeyEvent.KEYCODE_DPAD_LEFT, new KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_DPAD_LEFT));
        assertTrue(a.onKeyDown(KeyEvent.KEYCODE_DPAD_LEFT, new KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_DPAD_LEFT)));
        assertFalse(bool(a, "drawerShown"));
    }

    @Test public void phonesKeepLeftForThemselves() throws Exception {
        PlayerActivity a = Robolectric.buildActivity(PlayerActivity.class).get(); // no LEANBACK, not Amazon
        set(a, "rootView", new FrameLayout(a));
        set(a, "view", new PlayerView(a));
        assertFalse(a.onKeyDown(KeyEvent.KEYCODE_DPAD_LEFT, new KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_DPAD_LEFT)));
        assertFalse(bool(a, "drawerShown"));
    }

    @Test public void pickingChannelHandsIdToMainScreen() throws Exception {
        PlayerActivity a = boxPlayer();
        set(a, "rootView", new FrameLayout(a));
        set(a, "view", new PlayerView(a));
        a.onKeyDown(KeyEvent.KEYCODE_DPAD_LEFT, new KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_DPAD_LEFT));
        Field panelField = PlayerActivity.class.getDeclaredField("drawerPanel"); panelField.setAccessible(true);
        LinearLayout panel = (LinearLayout) panelField.get(a);
        LiveChannelDrawer drawer = (LiveChannelDrawer) panel.getChildAt(1);
        ListView cats = (ListView) drawer.getChildAt(0);
        cats.performItemClick(cats.getAdapter().getView(1, null, cats), 1, cats.getAdapter().getItemId(1)); // Entertainment
        ListView channels = (ListView) ((ViewGroup) drawer.getChildAt(1)).getChildAt(1);
        channels.performItemClick(channels.getAdapter().getView(1, null, channels), 1, channels.getAdapter().getItemId(1)); // ITV 1
        assertEquals("11", LiveDrawerData.pendingPick);
    }
}
