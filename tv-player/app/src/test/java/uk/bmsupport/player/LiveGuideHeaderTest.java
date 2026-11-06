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

    @Test public void viewEpgSitsInTheHeaderRowBeforeSearchTv() throws Exception {
        MainActivity a = open();
        openLiveGuide(a);
        LinearLayout root = rootOf(a);
        List<View> pills = new ArrayList<>();
        collect(a.getWindow().getDecorView(), Button.class, pills);
        boolean found = false;
        for (View p : pills) if (text(p).equals("View EPG")) {
            assertFalse("the control must not be a lone button at the foot of the screen",
                    p.getParent() == root);
            assertSame("the control must sit in the screen's header row", root.getChildAt(0), p.getParent());
            found = true;
        }
        assertTrue("Live TV on a phone must offer the View EPG control", found);
        View head = root.getChildAt(0);
        int epg = -1, search = -1;
        for (int i = 0; i < ((ViewGroup) head).getChildCount(); i++) {
            View c = ((ViewGroup) head).getChildAt(i);
            if (!(c instanceof Button)) continue;
            String t = text(c);
            if (t.equals("View EPG")) epg = i;
            if (t.equals("🔍 Search TV")) search = i;
        }
        assertTrue("View EPG must come before Search TV in the header", epg >= 0 && search >= 0 && epg < search);
    }

    @Test public void theGridStaysHiddenUnderThePreviewUntilViewEpgOpensIt() throws Exception {
        MainActivity a = open();
        openLiveGuide(a);
        List<View> grids = new ArrayList<>();
        collect(a.getWindow().getDecorView(), GuideGridView.class, grids);
        assertEquals(1, grids.size());
        View grid = grids.get(0);
        assertEquals("the phone guide must not sit under the preview", View.GONE, grid.getVisibility());
        List<View> pills = new ArrayList<>();
        collect(a.getWindow().getDecorView(), Button.class, pills);
        for (View p : pills) if (text(p).equals("View EPG")) { p.performClick(); break; }
        assertEquals("View EPG must open the guide full screen", View.VISIBLE, grid.getVisibility());
        LinearLayout root = (LinearLayout) grid.getParent();
        assertEquals(View.GONE, root.getChildAt(0).getVisibility());
        assertEquals(View.GONE, root.getChildAt(1).getVisibility());
        for (View p : pills) if (text(p).equals("✕ Close")) { p.performClick(); break; }
        assertEquals("Close must put the guide away again", View.GONE, grid.getVisibility());
        assertEquals(View.VISIBLE, root.getChildAt(0).getVisibility());
        assertEquals(View.VISIBLE, root.getChildAt(1).getVisibility());
    }

    @Test public void tvBoxesKeepTheirAlwaysVisibleGuide() throws Exception {
        MainActivity a = open();
        org.robolectric.Shadows.shadowOf(a.getPackageManager()).setSystemFeature(android.content.pm.PackageManager.FEATURE_LEANBACK, true);
        openLiveGuide(a);
        LinearLayout root = rootOf(a);
        List<View> grids = new ArrayList<>();
        collect(root, GuideGridView.class, grids);
        assertEquals(View.VISIBLE, grids.get(0).getVisibility());
        List<View> buttons = new ArrayList<>();
        collect(root, Button.class, buttons);
        for (View b : buttons) assertNotEquals("View EPG", text(b));
    }

    @Test public void theNowAndDayControlsLiveInsideTheBiggerGuidePopup() throws Exception {
        MainActivity a = open();
        openLiveGuide(a);
        LinearLayout root = rootOf(a);
        List<View> pills = new ArrayList<>();
        collect(a.getWindow().getDecorView(), Button.class, pills);
        View bigBar = null;
        for (View p : pills) if (text(p).equals("✕ Close")) bigBar = (View) p.getParent();
        assertNotNull("the bigger-guide pop-up bar must exist", bigBar);
        assertEquals("the pop-up bar stays hidden until Bigger guide is tapped", View.GONE, bigBar.getVisibility());
        for (String label : new String[]{"Now", "◀ Day", "Day ▶"}) {
            int found = 0;
            for (View p : pills) if (text(p).equals(label)) {
                found++;
                View parent = (View) p.getParent();
                assertTrue("the " + label + " button must sit inside the pop-up bar, not the normal guide",
                        parent == bigBar || parent.getParent() == bigBar);
            }
            assertEquals("exactly one " + label + " button", 1, found);
        }
        View head = root.getChildAt(0);
        List<View> inHead = new ArrayList<>();
        collect(head, Button.class, inHead);
        for (View b : inHead) {
            String t = text(b);
            assertNotEquals("the Now button must not be in the header", "Now", t);
            assertNotEquals("the back-a-day button must not be in the header", "◀ Day", t);
            assertNotEquals("the forward-a-day button must not be in the header", "Day ▶", t);
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
        assertTrue("the View EPG control must join them: " + labels, labels.contains("View EPG"));
    }

    @Test public void playChannelIsReachableOnAShortLandscapePhone() throws Exception {
        MainActivity a = open();
        openLiveGuide(a);
        View screen = (View) rootOf(a).getParent().getParent().getParent();
        float density = a.getResources().getDisplayMetrics().density;
        int width = Math.round(800 * density), height = Math.round(360 * density);
        screen.measure(View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY),
                View.MeasureSpec.makeMeasureSpec(height, View.MeasureSpec.EXACTLY));
        screen.layout(0, 0, width, height);
        List<View> buttons = new ArrayList<>();
        collect(screen, Button.class, buttons);
        View play = null;
        for (View b : buttons) if (text(b).equals("▶ Preview channel")) play = b;
        assertNotNull(play);
        android.graphics.Rect bounds = new android.graphics.Rect(0, 0, play.getWidth(), play.getHeight());
        ((ViewGroup) screen).offsetDescendantRectToMyCoords(play, bounds);
        assertTrue("Preview channel must fit above the phone's bottom edge: " + bounds,
                bounds.bottom <= height && bounds.top >= 0 && bounds.height() > 0);
        play.performClick();
        assertNotNull(org.robolectric.shadows.ShadowToast.getTextOfLatestToast());
    }

    /** Once the preview is actually on, the button's job changes to bringing up the channel's play menu. */
    @Test public void theButtonBecomesThePlayMenuOnceThePreviewKicksIn() throws Exception {
        MainActivity a = open();
        openLiveGuide(a);
        List<View> buttons = new ArrayList<>();
        collect(a.getWindow().getDecorView(), Button.class, buttons);
        Button preview = null;
        for (View b : buttons) if (text(b).equals("▶ Preview channel")) preview = (Button) b;
        assertNotNull("the phone must offer previewing before anything plays", preview);
        a.previewStarted();
        assertEquals("once the preview kicks in the button must bring up the play menu",
                "▶ Play menu", preview.getText().toString());
        a.previewStopped();
        assertEquals("stopping the preview must offer previewing again",
                "▶ Preview channel", preview.getText().toString());
    }

    /** Watching through the preview box is real watching: the phone screen must not lock while it plays. */
    @Test public void theScreenStaysAwakeWhileThePreviewPlaysAndCanSleepAfter() throws Exception {
        MainActivity a = open();
        int flag = android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON;
        assertFalse("the screen must be allowed to sleep before anything plays",
                (a.getWindow().getAttributes().flags & flag) != 0);
        a.previewStarted();
        assertTrue("the screen must stay awake while the preview box is playing",
                (a.getWindow().getAttributes().flags & flag) != 0);
        a.previewStopped();
        assertFalse("the screen must be allowed to sleep once the preview stops",
                (a.getWindow().getAttributes().flags & flag) != 0);
    }
}
