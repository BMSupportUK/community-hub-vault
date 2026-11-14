package uk.bmsupport.player;

import android.content.Context;
import android.content.SharedPreferences;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import org.json.JSONArray;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
public class RecentPrivacyTest {
    @Test public void adultCategoryIdsCannotBeSavedAndOldHistoryIsPurged() throws Exception {
        MainActivity a = Robolectric.buildActivity(MainActivity.class).get();
        SharedPreferences prefs = a.getSharedPreferences("recent-privacy-test", Context.MODE_PRIVATE);
        prefs.edit().clear().commit();
        Field field = MainActivity.class.getDeclaredField("prefs"); field.setAccessible(true); field.set(a, prefs);
        Method cache = MainActivity.class.getDeclaredMethod("cacheFile", String.class, String.class); cache.setAccessible(true);
        java.io.File file = (java.io.File) cache.invoke(a, "live", "get_live_categories");
        Files.write(file.toPath(), "[{\"category_id\":\"17\",\"category_name\":\"UK | ADULT\"},{\"category_id\":\"1\",\"category_name\":\"UK Entertainment\"}]".getBytes(StandardCharsets.UTF_8));
        MainActivity.Item adult = new MainActivity.Item("live", "99", "Channel 99", "ts", "17");
        MainActivity.Item safe = new MainActivity.Item("live", "1", "BBC One", "ts", "1");
        Method remember = MainActivity.class.getDeclaredMethod("remember", String.class, MainActivity.Item.class); remember.setAccessible(true);
        remember.invoke(a, "recent", adult);
        assertEquals(0, new JSONArray(prefs.getString("recent", "[]")).length());
        prefs.edit().putString("recent", new JSONArray().put(adult.toJson()).put(safe.toJson()).toString()).commit();
        Method saved = MainActivity.class.getDeclaredMethod("saved", String.class); saved.setAccessible(true);
        JSONArray clean = (JSONArray) saved.invoke(a, "recent");
        assertEquals(1, clean.length()); assertEquals("BBC One", clean.getJSONObject(0).getString("name"));
        assertEquals(1, new JSONArray(prefs.getString("recent", "[]")).length());
        remember.invoke(a, "recent", new MainActivity.Item("live", "2", "XXX Channel", "ts", "1"));
        remember.invoke(a, "recent", new MainActivity.Item("live", "3", "Unknown", "ts", "999"));
        assertEquals(1, new JSONArray(prefs.getString("recent", "[]")).length());
        remember.invoke(a, "fav", adult);
        assertEquals(1, new JSONArray(prefs.getString("fav", "[]")).length());
    }
}