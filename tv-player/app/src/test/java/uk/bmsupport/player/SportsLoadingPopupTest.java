package uk.bmsupport.player;

import android.app.AlertDialog;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34, application = PlayerApplication.class)
public class SportsLoadingPopupTest {
    private void call(MainActivity a, String name) throws Exception {
        Method m = MainActivity.class.getDeclaredMethod(name); m.setAccessible(true); m.invoke(a);
    }
    private Object field(MainActivity a, String name) throws Exception {
        Field f = MainActivity.class.getDeclaredField(name); f.setAccessible(true); return f.get(a);
    }
    @Test public void popupRemainsUntilPreparationCompletes() throws Exception {
        MainActivity a = Robolectric.buildActivity(MainActivity.class).get();
        call(a, "showSportsLoading");
        AlertDialog d = (AlertDialog) field(a, "sportsLoadingDialog");
        assertTrue(d.isShowing());
        call(a, "finishSportsLoading");
        assertFalse(d.isShowing());
        assertNull(field(a, "sportsLoadingDialog"));
    }
    @Test public void leavingGuideDismissesPendingPopup() throws Exception {
        MainActivity a = Robolectric.buildActivity(MainActivity.class).get();
        call(a, "showSportsLoading");
        AlertDialog d = (AlertDialog) field(a, "sportsLoadingDialog");
        call(a, "stopSports");
        assertFalse(d.isShowing());
        assertNull(field(a, "sportsReady"));
    }
}