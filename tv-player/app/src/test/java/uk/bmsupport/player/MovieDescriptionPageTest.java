package uk.bmsupport.player;

import android.os.Build;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.TextView;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.Map;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import org.robolectric.util.ReflectionHelpers;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34, qualifiers = "w960dp-h540dp-mdpi")
public class MovieDescriptionPageTest {
    @Test public void androidMoviePageRetainsFullDescriptionAndReturnsToPosters() throws Exception {
        checkMoviePage("Google");
    }
    @Test @Config(sdk = 28) public void amazonMoviePageRetainsFullDescriptionAndReturnsToPosters() throws Exception {
        checkMoviePage("Amazon");
    }
    @Test public void emptyPlotUsesTheFullAlternativeDescription() throws Exception {
        JSONObject response = new JSONObject("{\"info\":{\"plot\":\"  \"},\"movie_data\":{\"description\":\"Full fallback description.\"}}");
        assertEquals("Full fallback description.", MovieDescription.fromResponse(response));
        assertEquals("", MovieDescription.fromResponse(new JSONObject("{\"info\":{\"plot\":null}}")));
    }
    private void checkMoviePage(String manufacturer) throws Exception {
        ReflectionHelpers.setStaticField(Build.class, "MANUFACTURER", manufacturer);
        MainActivity activity = Robolectric.buildActivity(MainActivity.class).get();
        Field prefs = MainActivity.class.getDeclaredField("prefs"); prefs.setAccessible(true);
        prefs.set(activity, activity.getSharedPreferences("bmplayer", 0));
        View posters = new View(activity); activity.setContentView(posters);
        StringBuilder text = new StringBuilder();
        for (int i = 0; i < 200; i++) text.append("A complete movie description. ");
        text.append("The final sentence.");
        String description = text.toString();
        JSONObject response = new JSONObject().put("info", new JSONObject().put("plot", description));
        Field cacheField = MainActivity.class.getDeclaredField("heroInfo"); cacheField.setAccessible(true);
        @SuppressWarnings("unchecked") Map<String, JSONObject> cache = (Map<String, JSONObject>) cacheField.get(null);
        String id = "movie-description-" + manufacturer;
        cache.put("film:" + id, response.getJSONObject("info"));
        try {
            MainActivity.Item item = new MainActivity.Item("film", id, "Test movie", "mp4", "10");
            Method show = MainActivity.class.getDeclaredMethod("showFilm", MainActivity.Item.class); show.setAccessible(true);
            show.invoke(activity, item);
            ViewGroup content = activity.findViewById(android.R.id.content);
            TextView plot = findText(content, description);
            assertNotNull("Complete fetched movie description reaches the detail page", plot);
            assertTrue("Full movie text is reachable by remote focus", plot.isFocusable());
            Button back = (Button) findText(content, "← Movies"); assertNotNull(back);
            back.performClick();
            assertSame("Back preserves the original poster selection view", posters, content.getChildAt(0));
        } finally { cache.remove("film:" + id); }
    }
    private TextView findText(View root, String text) {
        if (root instanceof TextView && text.contentEquals(((TextView) root).getText())) return (TextView) root;
        if (root instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) root;
            for (int i = 0; i < group.getChildCount(); i++) {
                TextView found = findText(group.getChildAt(i), text); if (found != null) return found;
            }
        }
        return null;
    }
}