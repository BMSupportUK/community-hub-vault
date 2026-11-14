package uk.bmsupport.player;

import android.app.Activity;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ListView;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34, qualifiers = "w960dp-h540dp-mdpi")
public class LiveGuideNavigationTest {
    @Test public void leftOpensCategoriesFromEveryChannelRowWithoutChangingSelection() {
        Activity activity = Robolectric.buildActivity(Activity.class).setup().get();
        GuideGridView grid = grid(activity);
        final int[] opens = {0};
        grid.setOnCategories(() -> opens[0]++);
        for (int row = 0; row < 20; row++) {
            grid.selectChannel(row);
            assertTrue(grid.onKeyDown(KeyEvent.KEYCODE_DPAD_LEFT,
                    new KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_DPAD_LEFT)));
            assertEquals(row + 1, opens[0]);
            assertEquals(row, grid.selectedRow());
        }
    }

    @Test public void leftOnFutureProgrammeStepsBackInsteadOfOpeningCategories() {
        Activity activity = Robolectric.buildActivity(Activity.class).setup().get();
        GuideGridView grid = grid(activity);
        grid.setChannels(Arrays.asList("BBC One", "ITV"), Arrays.asList(true, true));
        grid.selectChannel(1);
        final int[] opens = {0};
        grid.setOnCategories(() -> opens[0]++);
        grid.onKeyDown(KeyEvent.KEYCODE_DPAD_LEFT, new KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_DPAD_LEFT));
        assertEquals(1, opens[0]);
        grid.shiftDay(1);
        long end = grid.windowEnd();
        grid.onKeyDown(KeyEvent.KEYCODE_DPAD_LEFT, new KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_DPAD_LEFT));
        assertEquals(1, opens[0]);
        assertEquals(1, grid.selectedRow());
        assertTrue(grid.windowEnd() < end);
    }

    @Test public void phoneWithoutCategoriesShortcutKeepsLeftTimeNavigation() {
        Activity activity = Robolectric.buildActivity(Activity.class).setup().get();
        GuideGridView grid = grid(activity);
        grid.shiftDay(1);
        long end = grid.windowEnd();
        grid.onKeyDown(KeyEvent.KEYCODE_DPAD_LEFT, new KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_DPAD_LEFT));
        assertTrue(grid.windowEnd() < end);
    }

    @Test public void upcomingReminderSelectionWorksBeforeAnyPreviewAndRemoteMatchesTouch() {
        Activity activity = Robolectric.buildActivity(Activity.class).setup().get();
        GuideGridView grid = grid(activity);
        long now = System.currentTimeMillis() / 1000;
        // Span the right-hand edge in both the phone (3h) and TV (2h) windows.
        GuideGridView.Prog programme = new GuideGridView.Prog("Upcoming match", now + 1800, now + 14400);
        grid.setProgs(0, Arrays.asList(programme));
        final int[] reminders = {0}, previews = {0};
        grid.setListener(new GuideGridView.Listener() {
            public void needEpg(int row) {}
            public void onHighlight(int row, GuideGridView.Prog p) {}
            public void onPick(int row, GuideGridView.Prog p) {
                if (GuideReminder.eligible(p, now)) reminders[0]++; else previews[0]++;
            }
            public boolean hasReminder(int row, long start) { return false; }
            public void onCatchup(int row) { fail("Reminder must not open catch up"); }
        });
        touch(grid, MotionEvent.ACTION_DOWN, 940, 66);
        touch(grid, MotionEvent.ACTION_UP, 940, 66);
        assertEquals(1, reminders[0]); assertEquals(0, previews[0]);
        grid.onKeyDown(KeyEvent.KEYCODE_DPAD_CENTER, new KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_DPAD_CENTER));
        assertEquals(2, reminders[0]); assertEquals(0, previews[0]);
        assertFalse(GuideReminder.eligible(new GuideGridView.Prog("No Event Scheduled", now + 1800, now + 7200), now));
    }
    @Test public void categoryOpensChannelsAndPickSelectsTheirGuideRow() {
        Activity activity = Robolectric.buildActivity(Activity.class).setup().get();
        GuideGridView grid = grid(activity);
        ListView categories = new ListView(activity);
        LiveChannelDrawer drawer = new LiveChannelDrawer(activity, categories, grid::selectChannel);
        activity.setContentView(drawer);
        drawer.showChannels(Arrays.asList("BBC One", "BBC Two", "ITV"));
        assertEquals(View.GONE, categories.getVisibility());
        LinearLayout channelPage = (LinearLayout) drawer.getChildAt(1);
        assertEquals(View.VISIBLE, channelPage.getVisibility());
        ListView channels = (ListView) channelPage.getChildAt(1);
        assertEquals(3, channels.getCount());
        channels.performItemClick(null, 2, 2);
        assertEquals(2, grid.selectedRow());
        ((Button) channelPage.getChildAt(0)).performClick();
        assertEquals(View.VISIBLE, categories.getVisibility());
        assertEquals(View.GONE, channelPage.getVisibility());
    }

    @org.robolectric.annotation.Config(qualifiers = "sw720dp-land")
    @Test public void swipeDownTheGuideScrollsWithoutPlayingAChannel() {
        Activity activity = Robolectric.buildActivity(Activity.class).setup().get();
        GuideGridView grid = grid(activity);
        final int[] picks = {0};
        grid.setListener(new GuideGridView.Listener() {
            public void needEpg(int row) {}
            public void onHighlight(int row, GuideGridView.Prog p) {}
            public void onPick(int row, GuideGridView.Prog p) { picks[0]++; }
            public boolean hasReminder(int row, long start) { return false; }
            public void onCatchup(int row) { fail("Swiping must not open catch up"); }
        });
        touch(grid, MotionEvent.ACTION_DOWN, 500, 240);
        touch(grid, MotionEvent.ACTION_MOVE, 500, 48);
        touch(grid, MotionEvent.ACTION_UP, 500, 48);
        assertEquals(3, grid.selectedRow());
        assertEquals(0, picks[0]);
        grid.onKeyDown(KeyEvent.KEYCODE_DPAD_DOWN, new KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_DPAD_DOWN));
        assertEquals(4, grid.selectedRow());
        touch(grid, MotionEvent.ACTION_DOWN, 500, 90);
        touch(grid, MotionEvent.ACTION_UP, 500, 90);
        assertEquals(1, picks[0]);
    }

    @Test public void swipeAcrossTheGuideMovesToALaterTime() {
        Activity activity = Robolectric.buildActivity(Activity.class).setup().get();
        GuideGridView grid = grid(activity);
        long now = System.currentTimeMillis() / 1000;
        final int[] picks = {0};
        grid.setListener(new GuideGridView.Listener() {
            public void needEpg(int row) {}
            public void onHighlight(int row, GuideGridView.Prog p) {}
            public void onPick(int row, GuideGridView.Prog p) { picks[0]++; }
            public boolean hasReminder(int row, long start) { return false; }
            public void onCatchup(int row) {}
        });
        java.util.List<GuideGridView.Prog> l = new ArrayList<>();
        for (int i = 0; i < 12; i++) l.add(new GuideGridView.Prog("Show " + i, now - 600 + i * 1800L, now - 600 + (i + 1) * 1800L));
        grid.setProgs(0, l);
        touch(grid, MotionEvent.ACTION_DOWN, 900, 90);
        touch(grid, MotionEvent.ACTION_MOVE, 180, 92);
        touch(grid, MotionEvent.ACTION_UP, 180, 92);
        assertEquals(0, picks[0]);
        assertTrue(grid.selected().st > now);
        touch(grid, MotionEvent.ACTION_DOWN, 100, 90);
        touch(grid, MotionEvent.ACTION_MOVE, 950, 92);
        touch(grid, MotionEvent.ACTION_MOVE, 950, 92);
        touch(grid, MotionEvent.ACTION_UP, 950, 92);
        assertEquals("Show 0", grid.selected().title);
    }

    @Test public void phoneGuideReservesAndroidGestureEdgesWithoutAccumulatingPadding() {
        Activity activity = Robolectric.buildActivity(Activity.class).setup().get();
        android.widget.FrameLayout screen = new android.widget.FrameLayout(activity);
        screen.setPadding(3, 4, 5, 6);
        GuideSafeArea.apply(screen);
        activity.setContentView(screen);
        androidx.core.view.WindowInsetsCompat insets = new androidx.core.view.WindowInsetsCompat.Builder()
                .setInsets(androidx.core.view.WindowInsetsCompat.Type.systemBars(), androidx.core.graphics.Insets.of(0, 24, 0, 20))
                .setInsets(androidx.core.view.WindowInsetsCompat.Type.systemGestures(), androidx.core.graphics.Insets.of(28, 0, 28, 32))
                .setInsets(androidx.core.view.WindowInsetsCompat.Type.mandatorySystemGestures(), androidx.core.graphics.Insets.of(0, 0, 0, 32))
                .setInsets(androidx.core.view.WindowInsetsCompat.Type.displayCutout(), androidx.core.graphics.Insets.of(40, 0, 0, 0))
                .build();
        for (int i = 0; i < 2; i++) {
            androidx.core.view.ViewCompat.dispatchApplyWindowInsets(screen, insets);
            assertEquals(43, screen.getPaddingLeft());
            assertEquals(28, screen.getPaddingTop());
            assertEquals(33, screen.getPaddingRight());
            assertEquals(38, screen.getPaddingBottom());
        }
    }

    @Test public void cancelledPhoneSwipeCannotPlayAChannelAndNextTapStillWorks() {
        Activity activity = Robolectric.buildActivity(Activity.class).setup().get();
        GuideGridView grid = grid(activity);
        final int[] picks = {0};
        grid.setListener(new GuideGridView.Listener() {
            public void needEpg(int row) {}
            public void onHighlight(int row, GuideGridView.Prog p) {}
            public void onPick(int row, GuideGridView.Prog p) { picks[0]++; }
            public boolean hasReminder(int row, long start) { return false; }
            public void onCatchup(int row) { fail("Cancelled swipe must not open catch up"); }
        });
        touch(grid, MotionEvent.ACTION_DOWN, 500, 240);
        touch(grid, MotionEvent.ACTION_MOVE, 510, 48);
        int rowAfterScroll = grid.selectedRow();
        assertTrue(rowAfterScroll > 0);
        touch(grid, MotionEvent.ACTION_CANCEL, 510, 48);
        touch(grid, MotionEvent.ACTION_MOVE, 800, 90);
        touch(grid, MotionEvent.ACTION_UP, 800, 90);
        assertEquals(rowAfterScroll, grid.selectedRow());
        assertEquals(0, picks[0]);
        touch(grid, MotionEvent.ACTION_DOWN, 500, 90);
        touch(grid, MotionEvent.ACTION_UP, 500, 90);
        assertEquals(1, picks[0]);
    }

    private GuideGridView grid(Activity activity) {
        GuideGridView grid = new GuideGridView(activity);
        ArrayList<String> names = new ArrayList<>();
        for (int i = 0; i < 20; i++) names.add("Channel " + i);
        grid.setChannels(names, Collections.nCopies(20, false));
        grid.measure(View.MeasureSpec.makeMeasureSpec(960, View.MeasureSpec.EXACTLY),
                View.MeasureSpec.makeMeasureSpec(300, View.MeasureSpec.EXACTLY));
        grid.layout(0, 0, 960, 300);
        return grid;
    }

    private void touch(GuideGridView grid, int action, float x, float y) {
        MotionEvent event = MotionEvent.obtain(0, 100, action, x, y, 0);
        try { assertTrue(grid.onTouchEvent(event)); } finally { event.recycle(); }
    }
}