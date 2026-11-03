package uk.bmsupport.player;

import android.view.KeyEvent;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ListView;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.Arrays;
import java.util.List;
import java.util.SortedMap;
import java.util.TreeMap;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34, qualifiers = "w960dp-h540dp-xhdpi")
public class SeriesSelectionTest {
    @Test public void remoteSelectsSeasonThenEpisodeWithoutResettingOnFocus() throws Exception {
        MainActivity activity = Robolectric.buildActivity(MainActivity.class).get();
        Field prefs = MainActivity.class.getDeclaredField("prefs");
        prefs.setAccessible(true);
        prefs.set(activity, activity.getSharedPreferences("bmplayer", 0));
        LinearLayout root = new LinearLayout(activity);
        root.setOrientation(LinearLayout.VERTICAL);
        LinearLayout pills = new LinearLayout(activity);
        ListView episodes = new ListView(activity) {
            @Override public boolean isInTouchMode() { return false; }
        };
        root.addView(pills); root.addView(episodes);
        activity.setContentView(root);
        SortedMap<Integer, List<MainActivity.Item>> seasons = new TreeMap<>();
        seasons.put(1, Arrays.asList(new MainActivity.Item("episode", "11", "E1", "mp4", "")));
        seasons.put(2, Arrays.asList(new MainActivity.Item("episode", "21", "E1", "mp4", ""),
                new MainActivity.Item("episode", "22", "E2", "mp4", "")));
        Method bind = MainActivity.class.getDeclaredMethod("bindSeriesSeasons", LinearLayout.class, ListView.class, SortedMap.class);
        bind.setAccessible(true); bind.invoke(activity, pills, episodes, seasons);
        root.measure(View.MeasureSpec.makeMeasureSpec(1920, View.MeasureSpec.EXACTLY),
                View.MeasureSpec.makeMeasureSpec(1080, View.MeasureSpec.EXACTLY));
        root.layout(0, 0, 1920, 1080);
        Button second = (Button) pills.getChildAt(1);
        second.requestFocus();
        assertEquals("Focus alone must not switch seasons", "11", ((MainActivity.Item) episodes.getItemAtPosition(0)).id);
        second.performClick();
        assertTrue(second.isSelected());
        assertFalse(pills.getChildAt(0).isSelected());
        second.dispatchKeyEvent(new KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_DPAD_DOWN));
        assertTrue("Down enters episodes", episodes.hasFocus());
        root.measure(View.MeasureSpec.makeMeasureSpec(1920, View.MeasureSpec.EXACTLY),
                View.MeasureSpec.makeMeasureSpec(1080, View.MeasureSpec.EXACTLY));
        root.layout(0, 0, 1920, 1080);
        android.widget.ListAdapter adapter = episodes.getAdapter();
        second.requestFocus(); second.performClick();
        assertSame("Same season must not reload its episodes", adapter, episodes.getAdapter());
        episodes.requestFocus(); episodes.setSelection(1);
        root.measure(View.MeasureSpec.makeMeasureSpec(1920, View.MeasureSpec.EXACTLY),
                View.MeasureSpec.makeMeasureSpec(1080, View.MeasureSpec.EXACTLY));
        root.layout(0, 0, 1920, 1080);
        assertEquals(1, episodes.getSelectedItemPosition());
        final String[] played = {null};
        episodes.setOnItemClickListener((p, v, pos, id) -> played[0] = ((MainActivity.Item) episodes.getItemAtPosition(pos)).id);
        episodes.dispatchKeyEvent(new KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_DPAD_CENTER));
        episodes.dispatchKeyEvent(new KeyEvent(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_DPAD_CENTER));
        assertEquals("OK opens the selected episode", "22", played[0]);
        episodes.setSelection(0);
        episodes.dispatchKeyEvent(new KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_DPAD_UP));
        assertTrue("Up from first episode returns to selected season", second.hasFocus());
    }
}