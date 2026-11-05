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