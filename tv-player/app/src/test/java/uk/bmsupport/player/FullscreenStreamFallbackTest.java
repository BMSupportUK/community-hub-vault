package uk.bmsupport.player;

import android.content.Intent;
import android.content.SharedPreferences;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;
import static org.robolectric.Shadows.shadowOf;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34, application = PlayerApplication.class)
public class FullscreenStreamFallbackTest {
    private Intent launch(String format, String preferred, String direct) throws Exception {
        MainActivity activity = Robolectric.buildActivity(MainActivity.class).get();
        SharedPreferences prefs = activity.getSharedPreferences("bmplayer", 0);
        prefs.edit().clear().putString("dns", "https://example.invalid")
                .putString("user", "test-user").putString("pass", "test-password")
                .putString("format", format).putString("fmt_pref:1", preferred).apply();
        Field field = MainActivity.class.getDeclaredField("prefs");
        field.setAccessible(true);
        field.set(activity, prefs);
        MainActivity.Item item = new MainActivity.Item("live", "1", "MonoMax 01 | (Events Only)", "", "test");
        item.url = direct;
        Method method = MainActivity.class.getDeclaredMethod("beginPlayback", MainActivity.Item.class, boolean.class, long.class, boolean.class);
        method.setAccessible(true);
        method.invoke(activity, item, false, 0L, false);
        Intent intent = shadowOf(activity).getNextStartedActivity();
        assertNotNull(intent);
        assertEquals(PlayerActivity.class.getName(), intent.getComponent().getClassName());
        return intent;
    }

    @Test public void autoFullscreenReceivesAllAddresses() throws Exception {
        Intent intent = launch("auto", null, "");
        assertArrayEquals(new String[]{"https://example.invalid/live/test-user/test-password/1.ts",
                "https://example.invalid/live/test-user/test-password/1.m3u8",
                "https://example.invalid/test-user/test-password/1"}, intent.getStringArrayExtra("urls"));
        assertEquals(intent.getStringExtra("url"), intent.getStringArrayExtra("urls")[0]);
    }

    @Test public void oldLearnedFormatIsIgnored() throws Exception {
        Intent intent = launch("auto", "m3u8", "");
        assertEquals(3, intent.getStringArrayExtra("urls").length);
        assertTrue(intent.getStringArrayExtra("urls")[0].endsWith(".ts"));
    }

    @Test public void forcedTsDoesNotOverrideTheChosenFormat() throws Exception {
        assertArrayEquals(new String[]{"https://example.invalid/live/test-user/test-password/1.ts"},
                launch("ts", null, "").getStringArrayExtra("urls"));
    }

    @Test public void directProviderAddressIsNotRewritten() throws Exception {
        assertArrayEquals(new String[]{"https://example.invalid/event"},
                launch("auto", null, "https://example.invalid/event").getStringArrayExtra("urls"));
    }
}