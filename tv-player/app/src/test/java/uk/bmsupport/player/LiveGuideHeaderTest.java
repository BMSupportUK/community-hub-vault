package uk.bmsupport.player;

import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.LinearLayout;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

/**
 * On a phone the Live TV guide keeps its header: the bigger-guide control sits up there with the
 * search pills, and the old Now / Day row is gone so the guide gets the room it was taking.
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34, application = PlayerApplication.class, qualifiers = "w960dp-h540dp-xhdpi")
public class LiveGuideHeaderTest {

    private MainActivity open() throws Exception {
        MainActivity a = Robolectric.buildActivity(MainActivity.class).get();
        Field prefs = MainActivity.class.getDeclaredField("prefs");
        prefs.setAccessible(true);
        prefs.set(a, a.getSharedPreferences("bmplayer", 0));
        return a;
    }

    private void openLiveGuide(MainActivity a) throws Exception {
        Method m = MainActivity.class.getDeclaredMethod("showTvGuide", String.class, boolean.class);
        m.setAccessible(true);
        m.invoke(a, null, true);
    }

    private static void collect(View v, Class<?> type, List<View> out) {
        if (type.isInstance(v)) out.add(v);
        if (v instanceof ViewGroup) {
            ViewGroup g = (ViewGroup) v;
            for (int i = 0; i < g.getChildCount(); i++) collect(g.getChildAt(i), type, out);
        }
    }

    private static String text(View v) { return ((Button) v).getText().toString(); }

    /** The guide grid is added straight onto the screen's root column, so its parent is that column. */
    private static LinearLayout rootOf(MainActivity a) {
        List<View> grids = new ArrayList<>();
        collect(a.getWindow().getDecorView(), GuideGridView.class, grids);
        assertEquals("the Live TV screen must show the guide grid", 1, grids.size());
        return (LinearLayout) grids.get(0).getParent();
    }

    @Test public void biggerGuideSitsInTheHeaderRowNotAtTheBottom() throws Exception {
        MainActivity a = open();
        openLiveGuide(a);
        LinearLayout root = rootOf(a);
        List<View> pills = new ArrayList<>();
        collect(a.getWindow().getDecorView(), Button.class, pills);
        boolean found = false;
        for (View p : pills) if (text(p).equals("⤢ Bigger guide")) {
            assertFalse("the control must not be a lone button at the foot of the screen",
                    p.getParent() == root);
            assertSame("the control must sit in the screen's header row", root.getChildAt(0), p.getParent());
            found = true;
        }
        assertTrue("Live TV on a phone must offer the bigger-guide control", found);
    }

    @Test public void theNowAndDayRowIsGoneFromThePhoneGuide() throws Exception {
        MainActivity a = open();
        openLiveGuide(a);
        List<View> pills = new ArrayList<>();
        collect(a.getWindow().getDecorView(), Button.class, pills);
        for (View p : pills) {
            String t = text(p);
            assertNotEquals("the Now button must be gone", "Now", t);
            assertNotEquals("the back-a-day button must be gone", "◀ Day", t);
            assertNotEquals("the forward-a-day button must be gone", "Day ▶", t);
        }
    }

    @Test public void theHeaderKeepsItsSearchPillsAlongsideTheControl() throws Exception {
        MainActivity a = open();
        openLiveGuide(a);
        LinearLayout root = rootOf(a);
        View head = root.getChildAt(0);
        List<View> inHead = new ArrayList<>();
        collect(head, Button.class, inHead);
        List<String> labels = new ArrayList<>();
        for (View b : inHead) labels.add(text(b));
        assertTrue("search must stay in the header: " + labels, labels.contains("🔍 Search TV"));
        assertTrue("voice search must stay in the header: " + labels, labels.contains("🎤 Voice search"));
        assertTrue("the bigger-guide control must join them: " + labels, labels.contains("⤢ Bigger guide"));
    }
}
