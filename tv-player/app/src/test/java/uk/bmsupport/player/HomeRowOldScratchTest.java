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

/** Scratch check: real metrics for the old equal-weight row vs the new one. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34, qualifiers = "w960dp-h540dp-xhdpi")
public class HomeRowOldScratchTest {

    private static final String[] LABELS = {
            "\uD83D\uDCC5 TV guide", "\uD83C\uDFC6 Sports guide", "\u2605 Favourites",
            "\u27F2 Recently watched", "\u2699 Settings"};

    private void dump(String tag, LinearLayout row, int widthDp) {
        for (int i = 0; i < row.getChildCount(); i++) {
            Button b = (Button) row.getChildAt(i);
            System.out.println(tag + " " + widthDp + "dp | " + LABELS[i]
                    + " | lines=" + b.getLineCount()
                    + " | box=" + b.getWidth()
                    + " | room=" + (b.getWidth() - b.getPaddingLeft() - b.getPaddingRight())
                    + " | text=" + (int) b.getPaint().measureText(b.getText(), 0, b.getText().length())
                    + " | sp=" + (b.getPaint().getTextSize() / b.getResources().getDisplayMetrics().scaledDensity));
        }
    }

    @Test
    public void compareBothRows() throws Exception {
        MainActivity activity = Robolectric.buildActivity(MainActivity.class).get();
        float density = activity.getResources().getDisplayMetrics().density;
        float scaled = activity.getResources().getDisplayMetrics().scaledDensity;
        System.out.println("ENV density=" + density + " scaledDensity=" + scaled
                + " widthDp=" + activity.getResources().getDisplayMetrics().widthPixels / density);

        Method button = MainActivity.class.getDeclaredMethod("button", String.class, View.OnClickListener.class);
        Method weight = MainActivity.class.getDeclaredMethod("weight", float.class, int.class);
        Method smallButton = MainActivity.class.getDeclaredMethod("smallButton", String.class, View.OnClickListener.class);
        Method smallWeight = MainActivity.class.getDeclaredMethod("smallWeight", String.class);
        for (Method m : new Method[]{button, weight, smallButton, smallWeight}) m.setAccessible(true);

        for (int widthDp : new int[]{960, 640}) {
            int width = (int) (widthDp * density);

            LinearLayout old = new LinearLayout(activity);
            old.setOrientation(LinearLayout.HORIZONTAL);
            for (String label : LABELS) {
                Button b = (Button) button.invoke(activity, label, (View.OnClickListener) v -> {});
                old.addView(b, (LinearLayout.LayoutParams) weight.invoke(activity, 1f, ViewGroup.LayoutParams.WRAP_CONTENT));
            }
            old.measure(View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY),
                    View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED));
            old.layout(0, 0, width, old.getMeasuredHeight());
            dump("OLD", old, widthDp);

            LinearLayout neu = new LinearLayout(activity);
            neu.setOrientation(LinearLayout.HORIZONTAL);
            for (String label : LABELS) {
                Button b = (Button) smallButton.invoke(activity, label, (View.OnClickListener) v -> {});
                neu.addView(b, (LinearLayout.LayoutParams) smallWeight.invoke(activity, label));
            }
            neu.measure(View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY),
                    View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED));
            neu.layout(0, 0, width, neu.getMeasuredHeight());
            dump("NEW", neu, widthDp);
        }
    }
}
