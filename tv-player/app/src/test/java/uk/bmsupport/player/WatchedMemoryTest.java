package uk.bmsupport.player;

import android.content.SharedPreferences;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
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
public class WatchedMemoryTest {
    private SharedPreferences prefs() {
        return org.robolectric.RuntimeEnvironment.getApplication().getSharedPreferences("watched-test", 0);
    }
    @Test public void completedFilmStaysWatchedAfterRewatchAndRestart() {
        SharedPreferences p = prefs(); p.edit().clear().commit();
        String key = "watch:owner:film:14";
        SharedPreferences.Editor e = p.edit(); WatchProgress.store(p, e, key, 90000, 100000); e.commit();
        e = p.edit(); WatchProgress.store(p, e, key, 5000, 100000); e.commit();
        SharedPreferences reopened = prefs();
        assertTrue(WatchProgress.remembered(reopened, key));
        assertEquals(5000, reopened.getLong(key + ":position", 0));
    }
    @Test public void existingCompletedEpisodeIsKeptWhenPlaybackRestarts() {
        SharedPreferences p = prefs(); p.edit().clear().commit();
        String key = "watch:owner:episode:7";
        p.edit().putLong(key + ":position", 95000).putLong(key + ":duration", 100000).commit();
        SharedPreferences.Editor e = p.edit(); WatchProgress.store(p, e, key, 1000, 100000); e.commit();
        assertTrue(WatchProgress.remembered(p, key));
        assertFalse(WatchProgress.remembered(p, "watch:other:episode:7"));
    }
    @Test public void incompleteItemDoesNotBecomeWatched() {
        SharedPreferences p = prefs(); p.edit().clear().commit();
        SharedPreferences.Editor e = p.edit(); WatchProgress.store(p, e, "watch:owner:film:1", 89000, 100000); e.commit();
        assertFalse(WatchProgress.remembered(p, "watch:owner:film:1"));
    }
    @Test public void attachedProgressUpdatesWithoutReopeningPage() throws Exception {
        org.robolectric.android.controller.ActivityController<MainActivity> controller = Robolectric.buildActivity(MainActivity.class);
        MainActivity a = controller.get();
        SharedPreferences p = a.getSharedPreferences("bmplayer", 0); p.edit().clear().commit();
        Field field = MainActivity.class.getDeclaredField("prefs"); field.setAccessible(true); field.set(a, p);
        MainActivity.Item item = new MainActivity.Item("episode", "22", "Episode", "mp4", "");
        Method keyMethod = MainActivity.class.getDeclaredMethod("watchKey", String.class, String.class); keyMethod.setAccessible(true);
        String key = (String) keyMethod.invoke(a, item.kind, item.id);
        p.edit().putLong(key + ":position", 10000).putLong(key + ":duration", 100000).commit();
        Method barMethod = MainActivity.class.getDeclaredMethod("watchedBar", MainActivity.Item.class); barMethod.setAccessible(true);
        LinearLayout bar = (LinearLayout) barMethod.invoke(a, item);
        a.setContentView(bar);
        controller.visible();
        assertTrue(bar.isAttachedToWindow());
        assertEquals(10, ((ProgressBar) bar.getChildAt(0)).getProgress());
        SharedPreferences.Editor e = p.edit(); WatchProgress.store(p, e, key, 90000, 100000); e.commit();
        org.robolectric.Shadows.shadowOf(android.os.Looper.getMainLooper()).idle();
        assertEquals(90, ((ProgressBar) bar.getChildAt(0)).getProgress());
        assertTrue(WatchProgress.remembered(p, key));
    }
}