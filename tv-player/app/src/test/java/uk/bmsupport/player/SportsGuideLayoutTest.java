package uk.bmsupport.player;

import android.view.View;
import android.view.ViewGroup;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34, application = PlayerApplication.class, qualifiers = "w960dp-h540dp-mdpi")
public class SportsGuideLayoutTest {
    private void measureHeader(int width, int height) throws Exception {
        MainActivity activity = Robolectric.buildActivity(MainActivity.class).get();
        for (String[] value : new String[][]{{"sportsSport", "Football"}, {"sportsSub", "Mens"}, {"sportsGuide", "English Premier League TV Channels"}}) {
            Field f = MainActivity.class.getDeclaredField(value[0]);
            f.setAccessible(true);
            f.set(activity, value[1]);
        }
        TextView status = new TextView(activity);
        status.setText("Updated 09:37");
        Method factory = MainActivity.class.getDeclaredMethod("sportsHeader", TextView.class);
        factory.setAccessible(true);
        LinearLayout header = (LinearLayout) factory.invoke(activity, status);
        LinearLayout root = new LinearLayout(activity);
        root.setOrientation(LinearLayout.VERTICAL);
        root.addView(header, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        View games = new View(activity);
        root.addView(games, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        root.measure(View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(height, View.MeasureSpec.EXACTLY));
        root.layout(0, 0, width, height);
        assertFalse(header.isBaselineAligned());
        assertTrue("header must not consume the games area: " + header.getHeight(), header.getHeight() < height / 4);
        assertTrue("games must retain most of the screen", games.getHeight() > height * 3 / 4);
        assertTrue("title must remain visible", header.getChildAt(0).getWidth() > 0);
        assertTrue("category must keep usable width", header.getChildAt(2).getWidth() > 0);
        assertTrue("last control must fit inside the screen", header.getChildAt(4).getRight() <= width);
    }

    @Test public void longPremierLeagueCategoryFitsTv() throws Exception { measureHeader(960, 540); }
    @Test public void longPremierLeagueCategoryFitsShortLandscape() throws Exception { measureHeader(800, 360); }
}