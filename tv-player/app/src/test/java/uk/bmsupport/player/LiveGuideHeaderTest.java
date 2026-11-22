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

    private static Button find(MainActivity a, String label) {
        List<View> b = new ArrayList<>();
        collect(a.getWindow().getDecorView(), Button.class, b);
        for (View v : b) if (text(v).equals(label)) return (Button) v;
        return null;
    }

    @Test public void phonesShowChannelsGuideAndFavouritesTabs() throws Exception {
        MainActivity a = open();
        openLiveGuide(a);
        assertNotNull(find(a, "📺 Channels"));
        assertNotNull(find(a, "📅 Guide"));
        assertNotNull(find(a, "★ Favourites"));
        assertNull("View EPG is replaced by the Guide tab", find(a, "View EPG"));
    }

    @Test public void phoneGuideTabOpensTheGridAndChannelsTabPutsItAway() throws Exception {
        MainActivity a = open();
        openLiveGuide(a);
        List<View> grids = new ArrayList<>();
        collect(a.getWindow().getDecorView(), GuideGridView.class, grids);
        View grid = grids.get(0);
        assertEquals(View.GONE, grid.getVisibility());
        find(a, "📅 Guide").performClick();
        assertEquals(View.VISIBLE, grid.getVisibility());
        find(a, "📺 Channels").performClick();
        assertEquals(View.GONE, grid.getVisibility());
    }

    @Test public void phoneHeaderKeepsSearchAndAChannelList() throws Exception {
        MainActivity a = open();
        openLiveGuide(a);
        assertNotNull(find(a, "🔍 Search TV"));
        List<View> lists = new ArrayList<>();
        collect(a.getWindow().getDecorView(), android.widget.ListView.class, lists);
        assertTrue("phone Live TV needs its channel list beside the preview", lists.size() >= 2);
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

    /** No persistent left-edge Categories tab: the guide's root column sits straight in the drawer frame. */
    @Test public void thereIsNoLeftEdgeCategoriesTabEatingGuideWidth() throws Exception {
        MainActivity a = open();
        openLiveGuide(a);
        LinearLayout root = rootOf(a);
        assertTrue("the guide root must sit directly in the drawer frame, not beside an edge-tab rail",
                root.getParent() instanceof android.widget.FrameLayout);
    }

    /** TV boxes: a bold stand-out hint beside the Category pill says Left lists the categories. */
    @Test public void theBoxCategoryPillCarriesThePressLeftHint() throws Exception {
        MainActivity a = open();
        org.robolectric.Shadows.shadowOf(a.getPackageManager()).setSystemFeature(android.content.pm.PackageManager.FEATURE_LEANBACK, true);
        openLiveGuide(a);
        List<View> texts = new ArrayList<>();
        collect(a.getWindow().getDecorView(), android.widget.TextView.class, texts);
        android.widget.TextView hint = null;
        for (View t : texts) if ("Press Left button on your remote to open categories".equals(((android.widget.TextView) t).getText().toString())) hint = (android.widget.TextView) t;
        assertNotNull("the box guide must tell remote users that Left lists the categories", hint);
        assertTrue("the hint must be bold so it stands out", hint.getTypeface() != null);
        View parent = (View) hint.getParent();
        List<View> siblings = new ArrayList<>();
        collect(parent, Button.class, siblings);
        boolean pillThere = false;
        for (View b : siblings) if (text(b).startsWith("Category:")) pillThere = true;
        assertTrue("the hint must sit beside the Category pill", pillThere);
    }

    /** The Press Left hint only applies at "now"; on future listings Left steps back, so it hides. */
    @Test public void thePressLeftHintHidesOnFutureProgrammes() throws Exception {
        MainActivity a = open();
        org.robolectric.Shadows.shadowOf(a.getPackageManager()).setSystemFeature(android.content.pm.PackageManager.FEATURE_LEANBACK, true);
        openLiveGuide(a);
        List<View> texts = new ArrayList<>();
        collect(a.getWindow().getDecorView(), android.widget.TextView.class, texts);
        View hint = null;
        for (View t : texts) if ("Press Left button on your remote to open categories".equals(((android.widget.TextView) t).getText().toString())) hint = t;
        assertNotNull("the box guide must carry the Press Left hint", hint);
        List<View> grids = new ArrayList<>();
        collect(a.getWindow().getDecorView(), GuideGridView.class, grids);
        GuideGridView grid = (GuideGridView) grids.get(0);
        grid.shiftDay(1);
        assertEquals("on future listings Left steps back, so the hint must hide", View.GONE, hint.getVisibility());
        grid.jumpNow();
        assertEquals("back at the on-now programme the hint returns", View.VISIBLE, hint.getVisibility());
    }

    /** Phones have no remote: their Categories pill stays in the View EPG pop-up bar. */
    @Test public void closingBoxCategoriesReturnsToThePreviousGuideRowAndTime() throws Exception {
        MainActivity a = open();
        org.robolectric.Shadows.shadowOf(a.getPackageManager()).setSystemFeature(android.content.pm.PackageManager.FEATURE_LEANBACK, true);
        openLiveGuide(a);
        GuideGridView grid = (GuideGridView) rootOf(a).getChildAt(rootOf(a).getChildCount() - 1);
        List<String> names = new ArrayList<>();
        for (int i = 0; i < 30; i++) names.add("Channel " + i);
        grid.setChannels(names, java.util.Collections.nCopies(30, false));
        grid.selectChannel(17);
        long end = grid.windowEnd();
        Field top = GuideGridView.class.getDeclaredField("topRow"); top.setAccessible(true);
        int scroll = top.getInt(grid);
        grid.requestFocus();
        grid.onKeyDown(android.view.KeyEvent.KEYCODE_DPAD_LEFT,
                new android.view.KeyEvent(android.view.KeyEvent.ACTION_DOWN, android.view.KeyEvent.KEYCODE_DPAD_LEFT));
        // The test catalogue is empty; put focus on the drawer's Close action as a remote would.
        Field drawer = MainActivity.class.getDeclaredField("drawerPanel"); drawer.setAccessible(true);
        LinearLayout panel = (LinearLayout) drawer.get(a);
        panel.getChildAt(panel.getChildCount() - 1).setFocusableInTouchMode(true);
        panel.getChildAt(panel.getChildCount() - 1).requestFocus();
        assertFalse(grid.hasFocus());
        a.onBackPressed();
        assertTrue(grid.hasFocus());
        assertEquals(17, grid.selectedRow());
        assertEquals(end, grid.windowEnd());
        assertEquals(scroll, top.getInt(grid));
    }

    @Test public void boxCategoryLabelCannotOpenAListOrTakeRemoteFocus() throws Exception {
        MainActivity a = open();
        org.robolectric.Shadows.shadowOf(a.getPackageManager()).setSystemFeature(android.content.pm.PackageManager.FEATURE_LEANBACK, true);
        openLiveGuide(a);
        Field pill = MainActivity.class.getDeclaredField("boxCatPill"); pill.setAccessible(true);
        Button label = (Button) pill.get(a);
        assertNotNull(label);
        assertFalse(label.isFocusable());
        assertFalse(label.isClickable());
        assertFalse(label.performClick());
        Method panel = MainActivity.class.getDeclaredMethod("panelOpen"); panel.setAccessible(true);
        assertEquals(false, panel.invoke(a));
    }

    @Test public void phonesKeepTheCategoriesPillInTheBiggerGuideBar() throws Exception {
        MainActivity a = open();
        openLiveGuide(a);
        List<View> pills = new ArrayList<>();
        collect(a.getWindow().getDecorView(), Button.class, pills);
        View bigBar = null, categories = null;
        for (View p : pills) {
            if (text(p).equals("✕ Close")) bigBar = (View) p.getParent();
            if (text(p).startsWith("☰ Categories:")) categories = p;
        }
        assertNotNull("the phone guide must keep a Categories control", categories);
        assertNotNull(bigBar);
        View parent = (View) categories.getParent();
        assertTrue("the phone Categories pill must live in the View EPG pop-up bar",
                parent == bigBar || parent.getParent() == bigBar);
        assertEquals("the phone Categories pill must be visible", View.VISIBLE, categories.getVisibility());
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
