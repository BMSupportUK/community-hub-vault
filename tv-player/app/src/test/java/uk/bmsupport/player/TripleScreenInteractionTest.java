package uk.bmsupport.player;

import android.app.Activity;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34, application = android.app.Application.class)
public class TripleScreenInteractionTest {
    @Test public void remoteMovesBetweenLargeTopAndBothLowerScreens() {
        Activity activity = Robolectric.buildActivity(Activity.class).setup().get();
        LinearLayout root = new LinearLayout(activity);
        FrameLayout[] panes = new FrameLayout[3];
        for (int i = 0; i < panes.length; i++) {
            panes[i] = new FrameLayout(activity);
            panes[i].setFocusable(true);
        }
        MainActivity.arrangeTripleScreen(root, panes);
        activity.setContentView(root);
        root.measure(View.MeasureSpec.makeMeasureSpec(960, View.MeasureSpec.EXACTLY),
                View.MeasureSpec.makeMeasureSpec(540, View.MeasureSpec.EXACTLY));
        root.layout(0, 0, 960, 540);
        panes[0].requestFocus();
        assertSame(panes[1], panes[0].focusSearch(View.FOCUS_DOWN));
        panes[1].requestFocus();
        assertSame(panes[2], panes[1].focusSearch(View.FOCUS_RIGHT));
        assertSame(panes[0], panes[1].focusSearch(View.FOCUS_UP));
        panes[2].requestFocus();
        assertSame(panes[1], panes[2].focusSearch(View.FOCUS_LEFT));
        assertSame(panes[0], panes[2].focusSearch(View.FOCUS_UP));
        assertEquals(960, panes[0].getWidth());
        assertEquals(360, panes[0].getHeight());
        assertEquals(480, panes[1].getWidth());
        assertEquals(180, panes[1].getHeight());
        assertEquals(480, panes[2].getWidth());
        assertEquals(180, panes[2].getHeight());
    }
}