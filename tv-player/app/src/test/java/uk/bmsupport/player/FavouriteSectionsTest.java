package uk.bmsupport.player;

import android.content.Context;
import android.content.SharedPreferences;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.Arrays;
import java.util.HashSet;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
public class FavouriteSectionsTest {
    private JSONArray clear(String... sections) throws Exception {
        MainActivity activity = Robolectric.buildActivity(MainActivity.class).get();
        SharedPreferences prefs = activity.getSharedPreferences("fav-sections-test", Context.MODE_PRIVATE);
        JSONArray items = new JSONArray();
        for (String kind : new String[]{"live", "film", "series", "episode"})
            items.put(new MainActivity.Item(kind, kind, kind, "ts", "1").toJson());
        prefs.edit().clear().putString("fav", items.toString()).commit();
        Field field = MainActivity.class.getDeclaredField("prefs"); field.setAccessible(true); field.set(activity, prefs);
        Method method = MainActivity.class.getDeclaredMethod("clearFavouriteSections", java.util.Set.class);
        method.setAccessible(true); method.invoke(activity, new HashSet<>(Arrays.asList(sections)));
        return new JSONArray(prefs.getString("fav", "[]"));
    }
    @Test public void clearLiveKeepsMoviesSeriesAndEpisodes() throws Exception {
        JSONArray kept = clear("live");
        assertEquals(3, kept.length());
        assertEquals("film", kept.getJSONObject(0).getString("kind"));
        assertEquals("series", kept.getJSONObject(1).getString("kind"));
        assertEquals("episode", kept.getJSONObject(2).getString("kind"));
    }
    @Test public void clearMoviesKeepsLiveAndSeries() throws Exception {
        JSONArray kept = clear("film");
        assertEquals(3, kept.length());
        assertEquals("live", kept.getJSONObject(0).getString("kind"));
        assertEquals("series", kept.getJSONObject(1).getString("kind"));
    }
    @Test public void clearSeriesIncludesEpisodesButKeepsLiveAndMovies() throws Exception {
        JSONArray kept = clear("series");
        assertEquals(2, kept.length());
        assertEquals("live", kept.getJSONObject(0).getString("kind"));
        assertEquals("film", kept.getJSONObject(1).getString("kind"));
    }
    @Test public void allSectionsClearEverything() throws Exception {
        assertEquals(0, clear("live", "film", "series").length());
    }
}