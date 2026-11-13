package uk.bmsupport.player;

import android.app.Activity;
import android.os.Looper;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ArrayAdapter;
import android.widget.GridView;
import android.widget.ListView;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.time.Duration;
import java.util.ArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.TimeUnit;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;
import static org.robolectric.Shadows.shadowOf;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34, qualifiers = "w960dp-h540dp-mdpi", application = PlayerApplication.class)
public class MediaCategoryNavigationTest {
    @Test public void leftOpensCategoriesAtEveryPosterRowEdgeButStillMovesAcrossPosters() {
        Activity activity = Robolectric.buildActivity(Activity.class).setup().get();
        GridView grid = new GridView(activity); grid.setNumColumns(4);
        ArrayList<String> names = new ArrayList<>(); for (int i = 0; i < 80; i++) names.add("Title " + i);
        grid.setAdapter(new ArrayAdapter<>(activity, android.R.layout.simple_list_item_1, names));
        activity.setContentView(grid);
        grid.measure(View.MeasureSpec.makeMeasureSpec(960, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(540, View.MeasureSpec.EXACTLY));
        grid.layout(0, 0, 960, 540);
        int[] opens = {0}; MediaCategoryNavigation.bind(grid, () -> opens[0]++);
        for (int row = 0; row < 20; row++) {
            grid.setSelection(row * 4);
            grid.layout(0, 0, 960, 540);
            assertTrue(MediaCategoryNavigation.handle(grid, KeyEvent.KEYCODE_DPAD_LEFT,
                    new KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_DPAD_LEFT), () -> opens[0]++));
            assertEquals(row + 1, opens[0]); assertEquals(row * 4, grid.getSelectedItemPosition());
            grid.setSelection(row * 4 + 1);
            grid.layout(0, 0, 960, 540);
            assertFalse(MediaCategoryNavigation.handle(grid, KeyEvent.KEYCODE_DPAD_LEFT,
                    new KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_DPAD_LEFT), () -> opens[0]++));
            assertEquals(row + 1, opens[0]);
        }
    }

    private Object field(MainActivity activity, String name) throws Exception {
        Field f = MainActivity.class.getDeclaredField(name); f.setAccessible(true); return f.get(activity);
    }
    private GridView grid(View v) {
        if (v instanceof GridView) return (GridView) v;
        if (v instanceof ViewGroup) for (int i = 0; i < ((ViewGroup) v).getChildCount(); i++) {
            GridView result = grid(((ViewGroup) v).getChildAt(i)); if (result != null) return result;
        }
        return null;
    }
    @Test public void filmsAndSeriesDrawerSelectsCategoryOnlyOnClickAndReturnsToGrid() throws Exception {
        for (String kind : new String[]{"film", "series"}) {
            org.robolectric.android.controller.ActivityController<MainActivity> controller = Robolectric.buildActivity(MainActivity.class);
            MainActivity activity = controller.get();
            Field prefs = MainActivity.class.getDeclaredField("prefs"); prefs.setAccessible(true);
            prefs.set(activity, activity.getSharedPreferences("bmplayer", 0));
            Method write = MainActivity.class.getDeclaredMethod("writeCache", String.class, String.class, String.class); write.setAccessible(true);
            write.invoke(activity, kind, kind.equals("film") ? "get_vod_categories" : "get_series_categories",
                    "[{\"category_id\":\"10\",\"category_name\":\"Drama\"}]");
            write.invoke(activity, kind, kind.equals("film") ? "get_vod_streams" : "get_series",
                    "[{\"stream_id\":1,\"series_id\":1,\"name\":\"Title\",\"category_id\":\"10\"}]");
            Method browse = MainActivity.class.getDeclaredMethod("browse", String.class); browse.setAccessible(true); browse.invoke(activity, kind);
            controller.visible();
            ExecutorService queue = (ExecutorService) field(activity, "plIo");
            queue.submit(() -> {}).get(10, TimeUnit.SECONDS);
            shadowOf(Looper.getMainLooper()).idle();
            ViewGroup panel = (ViewGroup) field(activity, "drawerPanel");
            GridView posters = grid((View) field(activity, "drawerWrap")); assertNotNull(posters);
            View decor = activity.getWindow().getDecorView();
            decor.measure(View.MeasureSpec.makeMeasureSpec(960, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(540, View.MeasureSpec.EXACTLY));
            decor.layout(0, 0, 960, 540);
            Method show = MainActivity.class.getDeclaredMethod("showPanel"); show.setAccessible(true); show.invoke(activity);
            ListView categories = (ListView) panel.getChildAt(1);
            assertEquals(2, categories.getCount());
            categories.requestFocus(); categories.setSelection(1);
            shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(300));
            assertTrue((Boolean) field(activity, "drawerShown"));
            categories.performItemClick(null, 1, 1);
            shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(300));
            assertFalse((Boolean) field(activity, "drawerShown"));
            decor.measure(View.MeasureSpec.makeMeasureSpec(960, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(540, View.MeasureSpec.EXACTLY));
            decor.layout(0, 0, 960, 540);
            assertEquals(1, posters.getCount()); assertEquals(0, posters.getSelectedItemPosition());
            queue.shutdownNow();
        }
    }
}