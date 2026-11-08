package uk.bmsupport.player;

import android.os.Looper;
import android.view.View;
import android.view.ViewGroup;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.Shadows;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

/** Episode cards must show their number and the episode title in full, over two lines if needed. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34, qualifiers = "w960dp-h540dp-xhdpi")
public class EpisodeTitleLinesTest {
    @Test public void episodeCardsShowTheirNumberAndFullTitleOnTwoLines() throws Exception {
        MainActivity activity = activity();
        MainActivity.Item show = new MainActivity.Item("series", "1", "Test series", "", "");
        MainActivity.Item episode = new MainActivity.Item("episode", "11", "E7. The Long Way Home", "mp4", "");
        episode.epNum = "7";
        episode.epTitle = "The Long Way Home";
        View season = row(activity, show, 7, Arrays.asList(episode));
        List<TextView> labels = texts(season);
        int number = indexOf(labels, "Episode 7");
        int title = indexOf(labels, "The Long Way Home");
        assertTrue("The episode number gets its own line", number >= 0);
        assertTrue("The episode title is shown in full", title >= 0);
        assertTrue("The number line sits above the title line", number < title);
        assertEquals("Titles may take a second line", 2, labels.get(title).getMaxLines());
        assertFalse("Titles are never forced onto one truncated line", labels.get(title).getLineCount() == 1
                && labels.get(title).getMaxLines() == 1);
    }

    @Test public void episodesWithoutNumberOrTitleStillShowTheirNameOnTwoLines() throws Exception {
        MainActivity activity = activity();
        MainActivity.Item show = new MainActivity.Item("series", "1", "Test series", "", "");
        MainActivity.Item episode = new MainActivity.Item("episode", "12", "Mystery episode", "mp4", "");
        View season = row(activity, show, 1, Arrays.asList(episode));
        List<TextView> labels = texts(season);
        int title = indexOf(labels, "Mystery episode");
        assertTrue("An unnamed episode still shows its name", title >= 0);
        assertEquals("Names may take a second line", 2, labels.get(title).getMaxLines());
        assertEquals("No episode number line is invented", -1, indexOf(labels, "Episode "));
    }

    private MainActivity activity() throws Exception {
        MainActivity activity = Robolectric.buildActivity(MainActivity.class).get();
        Field prefs = MainActivity.class.getDeclaredField("prefs");
        prefs.setAccessible(true);
        prefs.set(activity, activity.getSharedPreferences("bmplayer", 0));
        ScrollView scroll = new ScrollView(activity);
        LinearLayout root = new LinearLayout(activity);
        root.setOrientation(LinearLayout.VERTICAL);
        scroll.addView(root);
        activity.setContentView(scroll);
        return activity;
    }

    private View row(MainActivity activity, MainActivity.Item show, int season, List<MainActivity.Item> eps) throws Exception {
        Method m = MainActivity.class.getDeclaredMethod("seasonRow", MainActivity.Item.class, int.class, List.class);
        m.setAccessible(true);
        return (View) m.invoke(activity, show, season, eps);
    }

    private List<TextView> texts(View view) {
        List<TextView> out = new ArrayList<>();
        if (view instanceof TextView) out.add((TextView) view);
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int i = 0; i < group.getChildCount(); i++) out.addAll(texts(group.getChildAt(i)));
        }
        return out;
    }

    private int indexOf(List<TextView> labels, String text) {
        for (int i = 0; i < labels.size(); i++) if (text.equals(labels.get(i).getText().toString())) return i;
        return -1;
    }
}
