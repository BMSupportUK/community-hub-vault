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

/** Scratch check: how the old equal-weight row behaved. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
public class HomeRowOldScratchTest {

    private static final String[] LABELS = {
            "📅 TV guide", "🏆 Sports guide", "★ Favourites", "⟲ Recently watched", "⚙ Settings"};

    @Test
    public void oldRowLineCounts() throws Exception {
        MainActivity activity = Robolectric.buildActivity(MainActivity.class).get();
        Method button = MainActivity.class.getDeclaredMethod("button", String.class, View.OnClickListener.class);
        Method weight = MainActivity.class.getDeclaredMethod("weight", float.class, int.class);
        button.setAccessible(true);
        weight.setAccessible(true);

        for (int widthDp : new int[]{960, 640}) {
            LinearLayout row = new LinearLayout(activity);
            row.setOrientation(LinearLayout.HORIZONTAL);
            for (String label : LABELS) {
                Button b = (Button) button.invoke(activity, label, (View.OnClickListener) v -> {});
                row.addView(b, (LinearLayout.LayoutParams) weight.invoke(activity, 1f, ViewGroup.LayoutParams.WRAP_CONTENT));
            }
            int width = (int) (widthDp * activity.getResources().getDisplayMetrics().density);
            row.measure(View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY),
                    View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED));
            row.layout(0, 0, width, row.getMeasuredHeight());
            for (int i = 0; i < row.getChildCount(); i++) {
                Button b = (Button) row.getChildAt(i);
                System.out.println("OLD " + widthDp + "dp  " + LABELS[i] + "  lines=" + b.getLineCount()
                        + "  box=" + b.getWidth() + "  text=" + (int) b.getPaint().measureText(LABELS[i]));
            }
        }
    }
}
