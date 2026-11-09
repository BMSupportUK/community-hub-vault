package uk.bmsupport.player;

import android.app.Activity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34, application = PlayerApplication.class)
public class AnnouncementTest {
    private PlayerApplication app() {
        return (PlayerApplication) RuntimeEnvironment.getApplication();
    }
    private void set(String name, Object value) throws Exception {
        Field f = PlayerApplication.class.getDeclaredField(name);
        f.setAccessible(true); f.set(app(), value);
    }
    private View banner() throws Exception {
        Field f = PlayerApplication.class.getDeclaredField("banner");
        f.setAccessible(true); return (View) f.get(app());
    }
    private void show(String id) throws Exception {
        PlayerApplication.pinPassed = true;
        Field u = MainActivity.class.getDeclaredField("unlocked"); u.setAccessible(true); u.set(null, true);
        set("annId", id); set("annMsg", "Announcement test");
        Method m = PlayerApplication.class.getDeclaredMethod("showAnnouncement");
        m.setAccessible(true); m.invoke(app());
    }
    private Activity open() {
        return Robolectric.buildActivity(Activity.class).setup().get();
    }
    @Test public void hiddenBeforeSignInAnd2fa() throws Exception {
        open();
        Field u = MainActivity.class.getDeclaredField("unlocked"); u.setAccessible(true); u.set(null, false);
        PlayerApplication.pinPassed = false;
        set("annId", "locked-test"); set("annMsg", "x");
        Method m = PlayerApplication.class.getDeclaredMethod("showAnnouncement"); m.setAccessible(true); m.invoke(app());
        assertNull(banner());
    }
    @Test public void tapClosesAndDoesNotReplay() throws Exception {
        open(); show("tap-test");
        assertNotNull(banner());
        assertTrue(banner().performClick());
        assertNull(banner());
        show("tap-test"); assertNull(banner());
        show("new-announcement"); assertNotNull(banner());
    }
    @Test public void crossCloses() throws Exception {
        open(); show("cross-test");
        ViewGroup bar = (ViewGroup) banner();
        assertNotNull(bar);
        assertTrue(bar.getChildAt(1).performClick());
        assertNull(banner());
    }
    @Test public void backClosesBeforePageNavigation() throws Exception {
        Activity a = open(); show("back-test");
        assertTrue(PlayerApplication.closeAnnouncementOnBack(a, new KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_BACK)));
        assertNotNull(banner());
        assertTrue(PlayerApplication.closeAnnouncementOnBack(a, new KeyEvent(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_BACK)));
        assertNull(banner());
        assertFalse(PlayerApplication.closeAnnouncementOnBack(a, new KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_BACK)));
    }
    @Test public void switchingScreensKeepsDismissal() throws Exception {
        open(); show("screen-test");
        Activity second = open();
        assertSame(second, banner().getContext());
        assertTrue(banner().performClick());
        open(); show("screen-test"); assertNull(banner());
    }
}