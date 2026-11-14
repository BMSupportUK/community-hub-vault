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
public class TwoScreenInteractionTest {
    @Test public void remoteMovesUpAndDownBetweenStackedScreens() {
        Activity activity = Robolectric.buildActivity(Activity.class).setup().get();
        LinearLayout root = new LinearLayout(activity);
        FrameLayout[] panes = {new FrameLayout(activity), new FrameLayout(activity)};
        for (FrameLayout pane : panes) pane.setFocusable(true);
        MainActivity.arrangeTwoScreens(root, panes);
        activity.setContentView(root);
        root.measure(View.MeasureSpec.makeMeasureSpec(960, View.MeasureSpec.EXACTLY),
                View.MeasureSpec.makeMeasureSpec(540, View.MeasureSpec.EXACTLY));
        root.layout(0, 0, 960, 540);
        panes[0].requestFocus();
        assertSame(panes[1], panes[0].focusSearch(View.FOCUS_DOWN));
        panes[1].requestFocus();
        assertSame(panes[0], panes[1].focusSearch(View.FOCUS_UP));
        assertEquals(0, panes[0].getTop());
        assertEquals(270, panes[1].getTop());
        for (FrameLayout pane : panes) {
            assertEquals(960, pane.getWidth());
            assertEquals(270, pane.getHeight());
        }
    }
}