package uk.bmsupport.player;

import android.os.Looper;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.Arrays;
import java.util.List;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.Shadows;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34, qualifiers = "w960dp-h540dp-xhdpi")
public class SeriesStartingPositionTest {
    @Test public void delayedEpisodesDoNotStealTopFocusOrScroll() throws Exception {
        MainActivity activity = Robolectric.buildActivity(MainActivity.class).get();
        Field prefs = MainActivity.class.getDeclaredField("prefs");
        prefs.setAccessible(true);
        prefs.set(activity, activity.getSharedPreferences("bmplayer", 0));
        ScrollView scroll = new ScrollView(activity);
        LinearLayout root = new LinearLayout(activity);
        root.setOrientation(LinearLayout.VERTICAL);
        Button top = new Button(activity); top.setText("Add favourite"); top.setFocusableInTouchMode(true);
        root.addView(top);
        root.addView(new View(activity), new LinearLayout.LayoutParams(1200, 1200));
        scroll.addView(root); activity.setContentView(scroll);
        layout(scroll); top.requestFocus();
        MainActivity.Item show = new MainActivity.Item("series", "1", "Test series", "", "");
        MainActivity.Item episode = new MainActivity.Item("episode", "11", "Episode 1", "mp4", "");
        Method row = MainActivity.class.getDeclaredMethod("seasonRow", MainActivity.Item.class, int.class, List.class);
        row.setAccessible(true);
        View season = (View) row.invoke(activity, show, 1, Arrays.asList(episode));
        root.addView(season); layout(scroll);
        Shadows.shadowOf(Looper.getMainLooper()).idle(); layout(scroll);
        assertTrue("Loading episodes keeps focus on the top action", top.hasFocus());
        assertEquals("Series still starts at the top after episodes load", 0, scroll.getScrollY());
        LinearLayout seasonBox = (LinearLayout) season;
        android.widget.HorizontalScrollView stripScroll = (android.widget.HorizontalScrollView) seasonBox.getChildAt(1);
        LinearLayout strip = (LinearLayout) stripScroll.getChildAt(0);
        View card = strip.getChildAt(0);
        card.setFocusableInTouchMode(true);
        card.requestFocus();
        assertTrue("Episodes remain reachable by remote focus", card.hasFocus());
    }
    private void layout(View view) {
        view.measure(View.MeasureSpec.makeMeasureSpec(1920, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(1080, View.MeasureSpec.EXACTLY));
        view.layout(0, 0, 1920, 1080);
    }
}