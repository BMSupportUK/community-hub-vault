package uk.bmsupport.player;

import android.app.Activity;
import android.view.View;
import android.widget.FrameLayout;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=34, application=android.app.Application.class)
public class VlcStageInteractionTest {
    @Test public void expandingAndReturningNeverDetachesPicture() {
        Activity activity=Robolectric.buildActivity(Activity.class).setup().get();
        FrameLayout anchor=new FrameLayout(activity);
        activity.setContentView(anchor);
        View picture=new View(activity);
        VlcStage stage=new VlcStage(activity,anchor,picture);
        Object parent=picture.getParent();
        stage.full(true);
        assertSame(parent,picture.getParent());
        assertTrue(stage.full);
        stage.full(false);
        assertSame(parent,picture.getParent());
        assertFalse(stage.full);
        stage.close();
        assertNull(picture.getParent());
    }
}