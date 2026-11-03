package uk.bmsupport.player;

import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.LinearLayout;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

import java.lang.reflect.Method;
import java.util.List;

import static org.junit.Assert.assertTrue;
import static org.junit.Assert.assertEquals;

/**
 * The home row must never fold a name onto a second line: every button sits on one line,
 * and the longest name ("Recently watched") gets the room it needs instead of the same box
 * as "Settings".
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
public class HomeRowTest {

    private static final String[] PLAIN = {
            "📅 TV guide", "🏆 Sports guide", "★ Favourites", "⟲ Recently watched", "⚙ Settings"};
    private static final String[] WITH_MULTI = {
            "📅 TV guide", "🖥 Multi-screen (3)", "🏆 Sports guide", "★ Favourites",
            "⟲ Recently watched", "⚙ Settings"};

    /** Builds the real home row the way showHome() does, at a given screen width in dp. */
    private LinearLayout buildRow(MainActivity activity, String[] labels, int widthDp) throws Exception {
        Method smallButton = MainActivity.class.getDeclaredMethod(
                "smallButton", String.class, View.OnClickListener.class);
        Method smallWeight = MainActivity.class.getDeclaredMethod("smallWeight", String.class);
        smallButton.setAccessible(true);
        smallWeight.setAccessible(true);

        LinearLayout row = new LinearLayout(activity);
        row.setOrientation(LinearLayout.HORIZONTAL);
        for (String label : labels) {
            Button b = (Button) smallButton.invoke(activity, label, (View.OnClickListener) v -> {});
            row.addView(b, (LinearLayout.LayoutParams) smallWeight.invoke(activity, label));
        }
        int width = (int) (widthDp * activity.getResources().getDisplayMetrics().density);
        row.measure(View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY),
                View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED));
        row.layout(0, 0, width, row.getMeasuredHeight());
        return row;
    }

    private void assertEveryLabelFits(String[] labels, int widthDp) throws Exception {
        MainActivity activity = Robolectric.buildActivity(MainActivity.class).get();
        LinearLayout row = buildRow(activity, labels, widthDp);
        float density = activity.getResources().getDisplayMetrics().density;

        for (int i = 0; i < row.getChildCount(); i++) {
            Button b = (Button) row.getChildAt(i);
            String label = labels[i];
            assertEquals("One line for " + label, 1, b.getLineCount());
            float sizeSp = b.getPaint().getTextSize() / density;
            float needed = b.getPaint().measureText(label);
            float room = b.getWidth() - b.getPaddingLeft() - b.getPaddingRight();
            assertTrue(label + " fits its box (" + needed + " of " + room + " at " + sizeSp + "sp)",
                    needed <= room + 1f);
            assertTrue(label + " stays readable at " + sizeSp + "sp", sizeSp >= 11f);
        }
    }

    @Test
    public void everyHomeLabelStaysOnOneLine() throws Exception {
        assertEveryLabelFits(PLAIN, 960);
    }

    @Test
    public void homeRowStillFitsWithTheMultiScreenButton() throws Exception {
        assertEveryLabelFits(WITH_MULTI, 960);
    }

    @Test
    public void homeRowStillFitsOnANarrowScreen() throws Exception {
        assertEveryLabelFits(WITH_MULTI, 640);
    }

    /** The long name must get a wider box than a short one, which equal weights never did. */
    @Test
    public void longestLabelGetsTheWidestBox() throws Exception {
        MainActivity activity = Robolectric.buildActivity(MainActivity.class).get();
        LinearLayout row = buildRow(activity, PLAIN, 960);
        int widest = 0;
        for (int i = 0; i < row.getChildCount(); i++) {
            if (row.getChildAt(i).getWidth() > row.getChildAt(widest).getWidth()) widest = i;
        }
        assertEquals("⟲ Recently watched", PLAIN[widest]);
    }
}
