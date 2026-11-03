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

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/**
 * The home row must never fold a name onto a second line: "Recently watched" sits on one line
 * like the rest, and it gets a wider box than "Settings" instead of the same share.
 *
 * Robolectric ships no real font data, so measured glyph widths here are meaningless; this test
 * only asserts what the layout code itself decides - line count and how the row is shared out.
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34, qualifiers = "w960dp-h540dp-xhdpi")
public class HomeRowTest {

    private static final String[] PLAIN = {
            "\uD83D\uDCC5 TV guide", "\uD83C\uDFC6 Sports guide", "\u2605 Favourites",
            "\u27F2 Recently watched", "\u2699 Settings"};
    private static final String[] WITH_MULTI = {
            "\uD83D\uDCC5 TV guide", "\uD83D\uDDA5 Multi-screen (3)", "\uD83C\uDFC6 Sports guide",
            "\u2605 Favourites", "\u27F2 Recently watched", "\u2699 Settings"};

    private LinearLayout buildRow(MainActivity activity, String[] labels, int widthDp, boolean newWay)
            throws Exception {
        Method button = MainActivity.class.getDeclaredMethod("button", String.class, View.OnClickListener.class);
        Method weight = MainActivity.class.getDeclaredMethod("weight", float.class, int.class);
        Method smallButton = MainActivity.class.getDeclaredMethod("smallButton", String.class, View.OnClickListener.class);
        Method smallWeight = MainActivity.class.getDeclaredMethod("smallWeight", String.class);
        for (Method m : new Method[]{button, weight, smallButton, smallWeight}) m.setAccessible(true);

        LinearLayout row = new LinearLayout(activity);
        row.setOrientation(LinearLayout.HORIZONTAL);
        for (String label : labels) {
            if (newWay) {
                Button b = (Button) smallButton.invoke(activity, label, (View.OnClickListener) v -> {});
                row.addView(b, (LinearLayout.LayoutParams) smallWeight.invoke(activity, label));
            } else {
                Button b = (Button) button.invoke(activity, label, (View.OnClickListener) v -> {});
                row.addView(b, (LinearLayout.LayoutParams) weight.invoke(activity, 1f, ViewGroup.LayoutParams.WRAP_CONTENT));
            }
        }
        int width = (int) (widthDp * activity.getResources().getDisplayMetrics().density);
        row.measure(View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY),
                View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED));
        row.layout(0, 0, width, row.getMeasuredHeight());
        return row;
    }

    private int boxOf(LinearLayout row, String label) {
        for (int i = 0; i < row.getChildCount(); i++) {
            if (label.equals(((Button) row.getChildAt(i)).getText().toString())) return row.getChildAt(i).getWidth();
        }
        throw new AssertionError("no button for " + label);
    }

    @Test
    public void everyHomeLabelStaysOnOneLine() throws Exception {
        MainActivity activity = Robolectric.buildActivity(MainActivity.class).get();
        LinearLayout row = buildRow(activity, PLAIN, 960, true);
        for (int i = 0; i < row.getChildCount(); i++) {
            Button b = (Button) row.getChildAt(i);
            assertEquals("One line for " + b.getText(), 1, b.getLineCount());
            assertTrue("Single line requested for " + b.getText(), b.getLayout() == null || b.getLayout().getLineCount() <= 1);
        }
    }

    @Test
    public void homeRowStillFitsWithTheMultiScreenButton() throws Exception {
        MainActivity activity = Robolectric.buildActivity(MainActivity.class).get();
        LinearLayout row = buildRow(activity, WITH_MULTI, 960, true);
        assertEquals(WITH_MULTI.length, row.getChildCount());
        for (int i = 0; i < row.getChildCount(); i++) {
            assertEquals("One line for " + ((Button) row.getChildAt(i)).getText(), 1,
                    ((Button) row.getChildAt(i)).getLineCount());
        }
    }

    /** The long name must get more room than a short one, and more than equal weights gave it. */
    @Test
    public void longestLabelGetsTheWidestBox() throws Exception {
        MainActivity activity = Robolectric.buildActivity(MainActivity.class).get();
        LinearLayout row = buildRow(activity, PLAIN, 960, true);
        int widest = 0;
        for (int i = 0; i < row.getChildCount(); i++) {
            if (row.getChildAt(i).getWidth() > row.getChildAt(widest).getWidth()) widest = i;
        }
        assertEquals("\u27F2 Recently watched", PLAIN[widest]);

        LinearLayout equal = buildRow(activity, PLAIN, 960, false);
        String longLabel = "\u27F2 Recently watched";
        assertTrue("Long name gets more room than equal weights gave it",
                boxOf(row, longLabel) > boxOf(equal, longLabel));
        assertTrue("Short name keeps a smaller box",
                boxOf(row, longLabel) > boxOf(row, "\u2699 Settings"));
    }

    /** The header search pills must not sit flush against each other. */
    @Test
    public void searchPillsAreSpacedApart() throws Exception {
        MainActivity activity = Robolectric.buildActivity(MainActivity.class).get();
        Method headerPill = MainActivity.class.getDeclaredMethod("headerPill", String.class, View.OnClickListener.class);
        headerPill.setAccessible(true);
        Button pill = (Button) headerPill.invoke(activity, "\uD83D\uDD0D Search TV", (View.OnClickListener) v -> {});
        LinearLayout.LayoutParams lp = (LinearLayout.LayoutParams) pill.getLayoutParams();
        float density = activity.getResources().getDisplayMetrics().density;
        assertTrue("Gap before the pill", lp.leftMargin >= (int) (density * 8));
        assertTrue("Gap after the pill", lp.rightMargin >= (int) (density * 8));
    }
}
